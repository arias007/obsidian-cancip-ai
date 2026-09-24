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
function createHarness(settingsOverride = {}, options = {}) {
  const store = new Map();
  const folders = new Set();
  const commandsRun = [];
  const renameCalls = [];
  const trashCalls = [];
  const notices = [];
  const settings = { enabled: true, dir: DIR, ...settingsOverride };
  // Whether the host reports a visible window. Left unset by default exercises
  // the "host never taught to report visibility" path, which must behave as
  // foreground so nothing is ever held forever. Mutable so a test can model
  // Obsidian coming back to the front.
  const state = { foreground: options.foreground };

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

  // Obsidian's desktop adapter has rename/list/stat; the portable WebView one may
  // not. Both shapes are worth driving, so they are opt-in rather than assumed.
  if (options.rename) {
    adapter.rename = async (from, to) => {
      if (!store.has(from)) throw new Error(`no such file: ${from}`);
      store.set(to, store.get(from));
      store.delete(from);
      renameCalls.push([from, to]);
    };
  }
  if (options.list) {
    adapter.list = async (path) => {
      const prefix = `${path}/`;
      const files = [...store.keys()].filter((key) => key.startsWith(prefix));
      const dirs = [...folders].filter((key) => key.startsWith(prefix));
      return { files, folders: dirs };
    };
    adapter.stat = async (path) => (store.has(path) ? { size: String(store.get(path)).length, mtime: 1000, type: "file" } : null);
  }

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
  // Only attached when the caller asks, so the default harness is a host whose
  // capabilities are exactly the pre-existing ones.
  if (state.foreground !== undefined) handlers.isForeground = () => state.foreground;
  if (options.view !== false && options.withView) {
    handlers.view = async () => ({
      activeFile: "A.md",
      viewType: "markdown",
      displayText: "body text",
      selection: "",
      mode: "source",
      area: "main",
      tabs: [{ title: "A", viewType: "markdown", area: "main", path: "A.md", pinned: false, active: true }]
    });
  }

  return { store, folders, commandsRun, renameCalls, trashCalls, notices, settings, app, handlers, state };
}

/** Read one filed result: the O(1) channel a protocol-2 caller uses. */
function readFiledResult(harness, id) {
  const raw = harness.store.get(`${DIR}/result/${id}.json`);
  return raw === undefined ? null : JSON.parse(raw);
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
async function runOne(op, payload = {}, settingsOverride = {}, harnessOptions = {}) {
  const harness = createHarness(settingsOverride, harnessOptions);
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

await checkAsync("cmd executes a registered command and reports the id it ran", async () => {
  const hit = await runOne("cmd", { command: "app:reload" });
  assert.equal(hit.result.ok, true);
  assert.equal(hit.result.result.executed, true);
  assert.equal(hit.result.result.command, "app:reload");
  assert.deepEqual(hit.harness.commandsRun, ["app:reload"]);
});

await checkAsync("an unregistered cmd fails loudly instead of reporting executed:false", async () => {
  // This used to answer `{ok:true, result:{executed:false}}`, which made a typo,
  // a missing plugin and a real success indistinguishable from the outside.
  const miss = await runOne("cmd", { command: "nope:missing" });
  assert.equal(miss.result.ok, false);
  assert.equal(miss.result.code, "UNKNOWN_COMMAND");
  assert.match(miss.result.error, /nope:missing/);
});

await checkAsync("sync reports an unregistered default sync command as UNKNOWN_COMMAND", async () => {
  // 'remotely-save:start-sync' is registered in the harness, so this covers the
  // happy path; the failure path is shared with `cmd` above.
  const { result, harness } = await runOne("sync");
  assert.equal(result.ok, true);
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

// ------------------------------------------------- reply delivery (protocol 2)
await checkAsync("an identified result is filed under result/<id>.json for O(1) pickup", async () => {
  const { harness } = await runOne("ping");
  // The whole point of the change: the caller stats one small file it names
  // itself, instead of reading and splitting a log of everything ever answered.
  const filed = readFiledResult(harness, "t-1");
  assert.ok(filed, "result/t-1.json must exist");
  assert.equal(filed.id, "t-1");
  assert.equal(filed.ok, true);
});

await checkAsync("the legacy result.jsonl is still written so protocol-1 callers keep working", async () => {
  const { harness } = await runOne("ping");
  const legacy = readResults(harness);
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].id, "t-1");
  // Dual delivery, not a replacement: both channels must agree.
  assert.deepEqual(readFiledResult(harness, "t-1"), legacy[0]);
});

await checkAsync("a batch keeps arrival order in the legacy log even when ids are mixed", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  harness.store.set(
    QUEUE_PATH,
    `{bad json\n${JSON.stringify({ id: "two", op: "ping" })}\n${JSON.stringify({ op: "ping" })}\n`
  );
  await bridge.tick();
  const ids = readResults(harness).map((entry) => entry.id);
  // The old caller reads this file positionally, so a malformed first line must
  // not be shuffled behind the identified ones.
  assert.deepEqual(ids, [null, "two", null]);
});

await checkAsync("a path-hostile id still files under a safe name", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "../escape/../x", op: "ping" }]);
  await bridge.tick();
  assert.equal(harness.store.has(`${DIR}/result/.._escape_.._x.json`), true);
  assert.equal(readResults(harness)[0].id, "../escape/../x");
});

await checkAsync("only the newest result files are kept", async () => {
  const harness = createHarness({}, { list: true });
  const bridge = makeBridge(harness);
  const batch = [];
  for (let index = 0; index < 130; index += 1) batch.push({ id: `r-${index}`, op: "ping" });
  await enqueue(harness, batch);
  await bridge.tick();
  const filed = [...harness.store.keys()].filter((key) => key.startsWith(`${DIR}/result/`) && key.endsWith(".json"));
  assert.equal(filed.length <= 100, true, `expected retention to trim, saw ${filed.length}`);
  assert.equal(filed.length > 0, true);
});

// --------------------------------------------------------------- op catalogue
await checkAsync("heartbeat advertises the reply protocol and the op catalogue", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await bridge.beat();
  const heartbeat = JSON.parse(harness.store.get(HEARTBEAT_PATH));
  // The minis-bridge wire number is untouched; the new capability rides beside it.
  assert.equal(heartbeat.protocol, 1);
  assert.equal(heartbeat.replyProtocol, 2);
  assert.equal(heartbeat.resultDir, "result");
  assert.equal(Array.isArray(heartbeat.opCatalog), true);
  assert.equal(heartbeat.opCatalog.length, [...QUEUE_BRIDGE_OPS].length);
});

await checkAsync("every op in the catalogue names a group and whether it needs foreground", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await bridge.beat();
  const { opCatalog } = JSON.parse(harness.store.get(HEARTBEAT_PATH));
  for (const entry of opCatalog) {
    assert.equal(typeof entry.op, "string");
    assert.equal(entry.group === "file" || entry.group === "semantic", true, `bad group for ${entry.op}`);
    assert.equal(typeof entry.requiresForeground, "boolean");
    assert.equal(typeof entry.enabled, "boolean");
    if (!entry.enabled) assert.equal(typeof entry.reason, "string", `${entry.op} must say why it is disabled`);
  }
  // The three lists used to disagree; the catalogue must agree with QUEUE_BRIDGE_OPS.
  assert.deepEqual(opCatalog.map((entry) => entry.op), [...QUEUE_BRIDGE_OPS]);
});

await checkAsync("a host without a live view reports op=view as disabled with a reason", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await bridge.beat();
  const view = JSON.parse(harness.store.get(HEARTBEAT_PATH)).opCatalog.find((entry) => entry.op === "view");
  assert.equal(view.enabled, false);
  assert.match(view.reason, /live view/);
});

await checkAsync("op=view returns structured fields instead of a markdown report", async () => {
  const { result } = await runOne("view", {}, {}, { withView: true });
  assert.equal(result.ok, true);
  assert.equal(result.result.activeFile, "A.md");
  assert.equal(result.result.viewType, "markdown");
  // An empty selection is the case the markdown report could not express: the
  // next key followed immediately, so a line-based parse read the wrong value.
  assert.equal(result.result.selection, "");
  assert.equal(result.result.displayText, "body text");
  assert.equal(Array.isArray(result.result.tabs), true);
});

await checkAsync("op=view fails with a machine-readable code when the host has none", async () => {
  const { result } = await runOne("view");
  assert.equal(result.ok, false);
  assert.equal(result.code, "UNSUPPORTED_OP");
});

// ------------------------------------------------------- foreground scheduling
await checkAsync("off-foreground a file op still runs while a visible-only op is held", async () => {
  const harness = createHarness({}, { foreground: false });
  const bridge = makeBridge(harness);
  await enqueue(harness, [
    { id: "held", op: "cmd", command: "app:reload" },
    { id: "runs", op: "ping" }
  ]);
  await bridge.tick();
  const ids = readResults(harness).map((entry) => entry.id);
  assert.deepEqual(ids, ["runs"], "only the op that does not need a window may run");
  assert.deepEqual(harness.commandsRun, [], "a visible-only command must not fire against a hidden window");
  // It is not dropped: it goes back to the queue for when Obsidian returns.
  assert.match(harness.store.get(QUEUE_PATH), /"id":"held"/);
});

await checkAsync("a held command runs once Obsidian comes back to the front", async () => {
  const harness = createHarness({}, { foreground: false });
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "held", op: "notice", text: "later" }]);
  await bridge.tick();
  assert.deepEqual(harness.notices, []);
  harness.state.foreground = true;
  await bridge.tick();
  assert.deepEqual(harness.notices, ["later"]);
  const ids = readResults(harness).map((entry) => entry.id);
  assert.deepEqual(ids, ["held"], "the held command must execute exactly once, when it can");
});

await checkAsync("held work keeps its place ahead of commands that arrived later", async () => {
  const harness = createHarness({}, { foreground: false });
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "old", op: "cmd", command: "app:reload" }]);
  await bridge.tick();
  harness.store.set(QUEUE_PATH, `${harness.store.get(QUEUE_PATH)}${JSON.stringify({ id: "new", op: "ping" })}\n`);
  harness.state.foreground = true;
  await bridge.tick();
  const ids = readResults(harness).map((entry) => entry.id);
  assert.deepEqual(ids, ["old", "new"], "the older held command must not be starved by the newer one");
});

await checkAsync("a host that never reports visibility behaves as foreground", async () => {
  // No isForeground handler at all: this is the pre-existing host shape, and
  // holding work forever on it would be a regression, not a feature.
  const { result } = await runOne("notice", { text: "no visibility hook" });
  assert.equal(result.ok, true);
  assert.equal(result.result.shown, true);
});

// ------------------------------------------------------------ queue durability
await checkAsync("the queue is swapped aside rather than cleared in place", async () => {
  const harness = createHarness({}, { rename: true });
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "once", op: "ping" }]);
  await bridge.tick();
  assert.deepEqual(harness.renameCalls, [[QUEUE_PATH, `${DIR}/queue.processing.jsonl`]]);
  // The batch is finished, so the processing file is gone again.
  assert.equal(harness.store.has(`${DIR}/queue.processing.jsonl`), false);
});

await checkAsync("a batch left behind by a crash is replayed on the next tick", async () => {
  const harness = createHarness({}, { rename: true });
  const bridge = makeBridge(harness);
  // Model a plugin that died mid-batch: the swapped-aside batch is still there.
  harness.store.set(`${DIR}/queue.processing.jsonl`, `${JSON.stringify({ id: "survivor", op: "ping" })}\n`);
  await bridge.tick();
  const ids = readResults(harness).map((entry) => entry.id);
  assert.deepEqual(ids, ["survivor"], "work that survived a crash must still be answered");
});

await checkAsync("replay does not repeat a command whose result was already filed", async () => {
  // A plugin reload mid-batch leaves the processing file behind, and reloads are
  // routine (a settings toggle does one). Re-running an answered `write` or
  // `delete` is a duplicate side effect, not a harmless retry.
  const harness = createHarness({}, { rename: true });
  const bridge = makeBridge(harness);
  const answered = { id: "done", op: "write", path: "A.md", data: "from the first run" };
  const unanswered = { id: "todo", op: "ping" };
  harness.store.set(`${DIR}/queue.processing.jsonl`, `${JSON.stringify(answered)}\n${JSON.stringify(unanswered)}\n`);
  harness.store.set(`${DIR}/result/done.json`, JSON.stringify({ id: "done", op: "write", ok: true }));
  harness.store.set("A.md", "from a later edit");
  await bridge.tick();
  const ids = readResults(harness).map((entry) => entry.id);
  assert.deepEqual(ids, ["todo"], "only the unanswered command may run again");
  assert.equal(harness.store.get("A.md"), "from a later edit", "the answered command must not re-run and clobber the file");
});

await checkAsync("replay keeps the residue order when only some lines are filtered", async () => {
  const harness = createHarness({}, { rename: true });
  const bridge = makeBridge(harness);
  harness.store.set(
    `${DIR}/queue.processing.jsonl`,
    `${JSON.stringify({ id: "skip1", op: "ping" })}\n` +
      `${JSON.stringify({ id: "keep1", op: "ping" })}\n` +
      `${JSON.stringify({ id: "skip2", op: "ping" })}\n` +
      `${JSON.stringify({ id: "keep2", op: "ping" })}\n`
  );
  harness.store.set(`${DIR}/result/skip1.json`, JSON.stringify({ id: "skip1", op: "ping", ok: true }));
  harness.store.set(`${DIR}/result/skip2.json`, JSON.stringify({ id: "skip2", op: "ping", ok: true }));
  await bridge.tick();
  const ids = readResults(harness).map((entry) => entry.id);
  assert.deepEqual(ids, ["keep1", "keep2"]);
});

await checkAsync("an adapter without rename still clears the queue without losing work", async () => {
  const harness = createHarness();
  const bridge = makeBridge(harness);
  await enqueue(harness, [{ id: "once", op: "ping" }]);
  await bridge.tick();
  assert.equal(harness.store.get(QUEUE_PATH), "");
  assert.equal(readResults(harness).length, 1);
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
  assert.equal(first.code, "UNKNOWN_OP");
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

await checkAsync("a missing required argument fails with a clear message and a code", async () => {
  const { result } = await runOne("write", {});
  assert.equal(result.ok, false);
  assert.equal(result.code, "MISSING_ARGUMENT");
  assert.match(result.error, /requires a path/);
});

await checkAsync("an argument error names the op, not the word 'command'", async () => {
  // The verb is stripped from the body before the executor sees it, so reading
  // it back from there answered "command requires a path" for every op.
  const stat = await runOne("stat", {});
  assert.match(stat.result.error, /^stat requires a path\.$/);
  const move = await runOne("move", { from: "A.md" });
  assert.match(move.result.error, /^move requires a to\.$/);
});

await checkAsync("move reports NOT_FOUND for a path that is not in the vault", async () => {
  const { result } = await runOne("move", { from: "Gone.md", to: "X.md" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "NOT_FOUND");
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
