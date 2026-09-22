/**
 * Offline regression gate for the file-queue channel.
 *
 * Why this exists
 * ---------------
 * The queue bridge is the only transport that mobile can run, and the HTTP
 * bridge's test cannot cover it: that one needs a listening socket, which is
 * exactly what this transport exists to avoid. Rather than depend on a running
 * Obsidian instance, this gate bundles `src/queueBridge.ts`, wires it to an
 * in-memory vault adapter, and drives real command batches through `tick()`.
 *
 * It asserts the two things that would silently break a caller:
 *   1. the wire contract shared with arias007/minis-bridge — file names, the
 *      result envelope, op names and argument names, and
 *   2. that every op announced in QUEUE_BRIDGE_OPS actually reaches an executor.
 *
 * A gate that only checked "the file exists" would pass while every command
 * failed, so each assertion here drives behaviour and inspects the outcome.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

// The bridge stamps the plugin version into the heartbeat and into every result,
// so read it from package.json rather than hardcoding a literal that goes stale.
const pluginVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

let pass = 0;
let fail = 0;
const results = [];
function check(name, fn) {
  try {
    const outcome = fn();
    if (outcome instanceof Promise) throw new Error("check callbacks must be synchronous; use awaitCheck");
    pass += 1;
    results.push(["PASS", name]);
  } catch (error) {
    fail += 1;
    results.push(["FAIL", `${name} :: ${error && error.message}`]);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    pass += 1;
    results.push(["PASS", name]);
  } catch (error) {
    fail += 1;
    results.push(["FAIL", `${name} :: ${error && error.message}`]);
  }
}

const temp = await mkdtemp(join(tmpdir(), "cancip-queue-bridge-"));
const bundlePath = join(temp, "queueBridge.cjs");
await esbuild.build({
  entryPoints: [join(root, "src", "queueBridge.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: bundlePath,
  logLevel: "silent"
});
const require = createRequire(import.meta.url);
const queueBridgeModule = require(bundlePath);
const { CancipQueueBridge, QUEUE_BRIDGE_OPS } = queueBridgeModule;

const DIR = ".obsidian/plugins/cancip/bridge";
const QUEUE_PATH = `${DIR}/queue.jsonl`;
const RESULT_PATH = `${DIR}/result.jsonl`;
const HEARTBEAT_PATH = `${DIR}/heartbeat.json`;

/** An in-memory stand-in for the vault: a flat store plus an abstract-file tree. */
function createHarness(settingsOverride = {}) {
  const store = new Map();
  const folders = new Set();
  const commandsRun = [];
  const renameCalls = [];
  const trashCalls = [];
  const notices = [];
  const settings = { enabled: true, dir: DIR, ...settingsOverride };

  const adapter = {
    async exists(path) {
      return store.has(path) || folders.has(path);
    },
    async read(path) {
      if (!store.has(path)) throw new Error(`no such file: ${path}`);
      return store.get(path);
    },
    async write(path, data) {
      store.set(path, String(data));
    },
    async append(path, data) {
      store.set(path, `${store.get(path) ?? ""}${String(data)}`);
    },
    async remove(path) {
      store.delete(path);
    },
    async rmdir(path) {
      for (const key of [...store.keys()]) if (key === path || key.startsWith(`${path}/`)) store.delete(key);
      for (const key of [...folders]) if (key === path || key.startsWith(`${path}/`)) folders.delete(key);
    }
  };

  const files = [
    { path: "A.md", stat: { size: 2, mtime: 1000 } },
    { path: "Folder/B.md", stat: { size: 3, mtime: 2000 } }
  ];
  const abstract = new Map(files.map((file) => [file.path, file]));
  abstract.set("Folder", { path: "Folder", children: [] });

  const vault = {
    adapter,
    getName: () => "TestVault",
    getFiles: () => files.slice(),
    getAbstractFileByPath: (path) => abstract.get(path) ?? null,
    async create(path, data) {
      const entry = { path, stat: { size: String(data).length, mtime: Date.now() } };
      files.push(entry);
      abstract.set(path, entry);
      store.set(path, String(data));
      return entry;
    },
    async createFolder(path) {
      folders.add(path);
      abstract.set(path, { path, children: [] });
      return abstract.get(path);
    }
  };

  const app = {
    vault,
    commands: {
      commands: { "app:reload": {}, "workspace:split": {}, "remotely-save:start-sync": {} },
      executeCommandById(id) {
        commandsRun.push(id);
        return Boolean(app.commands.commands[id]);
      }
    },
    fileManager: {
      async renameFile(file, to) {
        const from = typeof file === "string" ? file : file.path;
        store.set(to, store.get(from) ?? "");
        store.delete(from);
        renameCalls.push([from, to]);
      },
      async trashFile(file) {
        trashCalls.push(file.path);
      }
    }
  };

  const handlers = {
    status: () => ({ accessMode: "confirmation", agentBrainEnabled: false }),
    capabilities: async () => ({ protocolVersion: 1, routes: ["search", "read", "open", "prompt", "action", "agent.run"] }),
    search: async (input) => ({ searched: input.query, scope: input.scope }),
    read: async (input) => ({ readPath: input.path, query: input.query ?? "" }),
    open: async (input) => ({ opened: input.path, targetKind: input.targetKind }),
    prompt: async (input) => ({ sessionId: "s1", status: "done", answer: `echo:${input.prompt}` }),
    action: async (input) => ({ status: "executed", runs: input.actions ?? [] }),
    agentRun: async (input) => ({ provider: input.provider, text: input.prompt }),
    notice: (text) => {
      notices.push(text);
    },
    evalCode: async (code) => ({ evaluated: code })
  };

  return { store, folders, commandsRun, renameCalls, trashCalls, notices, settings, app, handlers };
}

function makeBridge(harness) {
  return new CancipQueueBridge(harness.app, () => harness.settings, harness.handlers, pluginVersion);
}

async function enqueue(harness, commands) {
  harness.store.set(QUEUE_PATH, `${commands.map((command) => JSON.stringify(command)).join("\n")}\n`);
}

function readResults(harness) {
  const raw = harness.store.get(RESULT_PATH) ?? "";
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/** Run one command through a fresh queue entry and return its result envelope. */
async function runOne(op, payload = {}, settingsOverride = {}) {
  const harness = createHarness(settingsOverride);
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "t-1", op, ...payload }]);
  await bridge.tick();
  const [result] = readResults(harness);
  assert.ok(result, `no result was written for op ${op}`);
  return { result, harness };
}

// --------------------------------------------------------------- wire contract
check("the three minis-bridge file names are unchanged", () => {
  assert.equal(queueBridgeModule.QUEUE_BRIDGE_QUEUE_FILE, "queue.jsonl");
  assert.equal(queueBridgeModule.QUEUE_BRIDGE_RESULT_FILE, "result.jsonl");
  assert.equal(queueBridgeModule.QUEUE_BRIDGE_HEARTBEAT_FILE, "heartbeat.json");
});

check("QUEUE_BRIDGE_OPS covers every minis-bridge op plus Cancip's semantic ops", () => {
  const ops = [...QUEUE_BRIDGE_OPS];
  for (const op of ["ping", "list", "stat", "read", "write", "mkdir", "move", "delete", "cmds", "cmd", "sync", "open", "eval", "notice"]) {
    assert.ok(ops.includes(op), `minis-bridge op missing: ${op}`);
  }
  for (const op of ["status", "capabilities", "search", "prompt", "action", "agent.run"]) {
    assert.ok(ops.includes(op), `Cancip semantic op missing: ${op}`);
  }
});

await checkAsync("the result envelope matches minis-bridge (id/op/ts/ok/result/ms)", async () => {
  const { result } = await runOne("ping");
  assert.equal(result.id, "t-1");
  assert.equal(result.op, "ping");
  assert.equal(result.ok, true);
  assert.equal(typeof result.ts, "number");
  assert.equal(typeof result.ms, "number");
  assert.equal(typeof result.result, "object");
});

// ------------------------------------------------------------------ every op
await checkAsync("ping reports the bridge identity, protocol, vault and queue dir", async () => {
  const { result } = await runOne("ping");
  assert.equal(result.result.pong, true);
  assert.equal(result.result.bridge, "Cancip Queue Bridge");
  assert.equal(result.result.protocol, 1);
  assert.equal(result.result.vault, "TestVault");
  assert.equal(result.result.files, 2);
  assert.equal(result.result.dir, DIR);
  assert.equal(result.result.v, pluginVersion);
});

await checkAsync("list returns {p,s,m} rows and honours prefix", async () => {
  const { result } = await runOne("list");
  assert.equal(result.result.count, 2);
  assert.deepEqual(result.result.files[0], { p: "A.md", s: 2, m: 1000 });
  const scoped = await runOne("list", { prefix: "Folder/" });
  assert.equal(scoped.result.result.count, 1);
  assert.equal(scoped.result.result.files[0].p, "Folder/B.md");
});

await checkAsync("list with out= writes the listing to a file instead of inlining it", async () => {
  const { result, harness } = await runOne("list", { out: "listing.json" });
  assert.equal(result.result.out, "listing.json");
  assert.equal(harness.store.has("listing.json"), true);
  assert.equal(JSON.parse(harness.store.get("listing.json")).length, 2);
});

await checkAsync("stat reports folder-ness and missing paths distinctly", async () => {
  const file = await runOne("stat", { path: "A.md" });
  assert.equal(file.result.result.exists, true);
  assert.equal(file.result.result.folder, false);
  assert.equal(file.result.result.size, 2);
  const folder = await runOne("stat", { path: "Folder" });
  assert.equal(folder.result.result.folder, true);
  const missing = await runOne("stat", { path: "Nope.md" });
  assert.equal(missing.result.result.exists, false);
});

await checkAsync("read forwards to Cancip's rich reader and keeps out= working", async () => {
  const rich = await runOne("read", { path: "A.md", query: "hello" });
  assert.equal(rich.result.result.readPath, "A.md");
  assert.equal(rich.result.result.query, "hello");
  const harness = createHarness();
  harness.store.set("Doc.md", "file body");
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "t-1", op: "read", path: "Doc.md", out: "copy.md" }]);
  await bridge.tick();
  const [result] = readResults(harness);
  assert.equal(result.result.out, "copy.md");
  assert.equal(harness.store.get("copy.md"), "file body");
  const missing = await runOne("read", { path: "Gone.md", out: "copy.md" });
  assert.equal(missing.result.result.missing, "Gone.md");
});

await checkAsync("write creates a missing file and overwrites an existing one", async () => {
  const created = await runOne("write", { path: "New.md", data: "hello" });
  assert.equal(created.result.result.written, "New.md");
  assert.equal(created.result.result.bytes, 5);
  const harness = createHarness();
  harness.store.set("A.md", "old");
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "t-1", op: "write", path: "A.md", data: "new" }]);
  await bridge.tick();
  assert.equal(harness.store.get("A.md"), "new");
});

await checkAsync("mkdir creates the folder only once", async () => {
  const { result, harness } = await runOne("mkdir", { path: "Archive" });
  assert.equal(result.result.dir, "Archive");
  assert.equal(harness.folders.has("Archive"), true);
});

await checkAsync("move renames through Obsidian's file manager", async () => {
  const { result, harness } = await runOne("move", { from: "A.md", to: "Moved.md" });
  assert.equal(result.result.to, "Moved.md");
  assert.deepEqual(harness.renameCalls, [["A.md", "Moved.md"]]);
});

await checkAsync("delete trashes by default, hard-removes on request, and reports misses", async () => {
  const trashed = await runOne("delete", { paths: ["A.md", "Nope.md"] });
  assert.equal(trashed.result.result.total, 2);
  assert.equal(trashed.result.result.trashed, 1);
  assert.deepEqual(trashed.result.result.missing, ["Nope.md"]);
  assert.deepEqual(trashed.harness.trashCalls, ["A.md"]);
  const hard = await runOne("delete", { paths: ["Folder/B.md"], hard: true });
  assert.equal(hard.result.result.hard, 1);
  assert.equal(hard.harness.store.has("Folder/B.md"), false);
});

await checkAsync("cmds lists and filters real Obsidian command ids", async () => {
  const all = await runOne("cmds");
  assert.deepEqual(all.result.result.ids, ["app:reload", "remotely-save:start-sync", "workspace:split"]);
  const filtered = await runOne("cmds", { filter: "workspace" });
  assert.deepEqual(filtered.result.result.ids, ["workspace:split"]);
});

await checkAsync("cmd executes a command and reports whether it existed", async () => {
  const hit = await runOne("cmd", { command: "app:reload" });
  assert.equal(hit.result.result.executed, true);
  assert.deepEqual(hit.harness.commandsRun, ["app:reload"]);
  const miss = await runOne("cmd", { command: "nope:missing" });
  assert.equal(miss.result.result.executed, false);
});

await checkAsync("sync defaults to the Remotely Save sync command", async () => {
  const { result, harness } = await runOne("sync");
  assert.equal(result.result.command, "remotely-save:start-sync");
  assert.deepEqual(harness.commandsRun, ["remotely-save:start-sync"]);
});

await checkAsync("open forwards to the Cancip open handler with targetKind", async () => {
  const { result } = await runOne("open", { path: "A.md", targetKind: "file" });
  assert.equal(result.result.opened, "A.md");
  assert.equal(result.result.targetKind, "file");
});

await checkAsync("notice reaches the host notice channel", async () => {
  const { result, harness } = await runOne("notice", { text: "queued hello" });
  assert.equal(result.result.shown, true);
  assert.deepEqual(harness.notices, ["queued hello"]);
});

await checkAsync("eval forwards code to the host obsidian.eval route", async () => {
  const { result } = await runOne("eval", { code: "1 + 1" });
  assert.equal(result.result.evaluated, "1 + 1");
});

await checkAsync("search/prompt/action/agent.run share the HTTP bridge's handlers", async () => {
  const search = await runOne("search", { query: "todo", scope: "both" });
  assert.equal(search.result.result.searched, "todo");
  const prompt = await runOne("prompt", { prompt: "summarize" });
  assert.equal(prompt.result.result.answer, "echo:summarize");
  const action = await runOne("action", { actions: [{ type: "read", path: "A.md" }] });
  assert.equal(action.result.result.runs.length, 1);
  const agent = await runOne("agent.run", { prompt: "hi", provider: "codex" });
  assert.equal(agent.result.result.provider, "codex");
});

await checkAsync("status merges the queue statistics with the host status", async () => {
  const { result } = await runOne("status");
  assert.equal(result.result.transport, "queue");
  assert.equal(result.result.accessMode, "confirmation");
  assert.equal(typeof result.result.ticks, "number");
});

await checkAsync("capabilities is served from the shared handler", async () => {
  const { result } = await runOne("capabilities");
  assert.equal(result.result.protocolVersion, 1);
});

// -------------------------------------------------------------- error handling
await checkAsync("an unknown op fails the one command without killing the batch", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await enqueue(harness, [
    { id: "a", op: "definitely-not-an-op" },
    { id: "b", op: "ping" }
  ]);
  await bridge.tick();
  const [first, second] = readResults(harness);
  assert.equal(first.ok, false);
  assert.match(first.error, /unknown op/);
  assert.equal(second.ok, true, "a failed command must not stop the ones after it");
});

await checkAsync("a malformed line is reported and the good lines still run", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  harness.store.set(QUEUE_PATH, `{not json\n${JSON.stringify({ id: "ok", op: "ping" })}\n`);
  await bridge.tick();
  const [first, second] = readResults(harness);
  assert.equal(first.ok, false);
  assert.equal(first.id, null);
  assert.match(first.error, /bad json/);
  assert.equal(second.ok, true);
});

await checkAsync("a missing required argument fails with a clear message", async () => {
  const { result } = await runOne("write", {});
  assert.equal(result.ok, false);
  assert.match(result.error, /requires a path/);
});

// -------------------------------------------------------- queue semantics
await checkAsync("the queue is cleared before execution so a command never replays", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "once", op: "ping" }]);
  await bridge.tick();
  assert.equal(harness.store.get(QUEUE_PATH), "");
  await bridge.tick();
  assert.equal(readResults(harness).length, 1, "the same command must not be executed twice");
});

await checkAsync("a second tick consumes only what the next batch wrote", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "first", op: "ping" }]);
  await bridge.tick();
  harness.store.set(QUEUE_PATH, `${JSON.stringify({ id: "second", op: "ping" })}\n`);
  await bridge.tick();
  const ids = readResults(harness).map((entry) => entry.id);
  assert.deepEqual(ids, ["first", "second"]);
});

await checkAsync("a disabled bridge ignores the queue entirely", async () => {
  const harness = createHarness({ enabled: false });
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "ignored", op: "ping" }]);
  const handled = await bridge.tick();
  assert.equal(handled, 0);
  assert.equal(harness.store.has(RESULT_PATH), false);
});

await checkAsync("concurrent ticks do not double-execute (busy guard)", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "race", op: "ping" }]);
  await Promise.all([bridge.tick(), bridge.tick(), bridge.tick()]);
  assert.equal(readResults(harness).length, 1);
});

// ------------------------------------------------------------------ heartbeat
await checkAsync("beat writes the heartbeat an outside caller polls for liveness", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await bridge.beat();
  const heartbeat = JSON.parse(harness.store.get(HEARTBEAT_PATH));
  assert.equal(heartbeat.bridge, "Cancip Queue Bridge");
  assert.equal(heartbeat.protocol, 1);
  assert.equal(heartbeat.v, pluginVersion);
  assert.equal(heartbeat.dir, DIR);
  assert.equal(typeof heartbeat.ts, "number");
  assert.equal(heartbeat.ops.includes("eval"), true);
});

await checkAsync("ensureDir creates the bridge folder when it is missing", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await bridge.ensureDir();
  assert.equal(harness.folders.has(DIR), true);
});

// ----------------------------------------------------------------- statistics
await checkAsync("stats() reports ticks, executed and failures", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await enqueue(harness, [
    { id: "a", op: "ping" },
    { id: "b", op: "nope" }
  ]);
  await bridge.tick();
  const stats = bridge.stats();
  assert.equal(stats.ticks, 1);
  assert.equal(stats.executed, 1);
  assert.equal(stats.failures, 1);
  assert.equal(stats.dir, DIR);
});

await rm(temp, { recursive: true, force: true });

for (const [status, name] of results) {
  if (status === "FAIL") console.error(`${status}  ${name}`);
  else console.log(`${status}  ${name}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
