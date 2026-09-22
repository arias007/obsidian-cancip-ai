/**
 * End-to-end gate for the CLI's two-channel routing.
 *
 * Why this exists
 * ---------------
 * `verify-queue-bridge.mjs` proves the plugin side of the file queue. This gate
 * proves the *caller* side: that `cli/cancip-cli.mjs` writes a well-formed
 * command, waits for the matching result by id, fails loudly instead of hanging
 * when the plugin is not there, and refuses to send a queue-only operation down
 * the HTTP leg.
 *
 * It stands up a throwaway vault plus a mock consumer in a child process, then
 * runs the real CLI against it. No Obsidian instance is required, so this keeps
 * working on CI.
 *
 * Run this file with `--consume <dir>` to act as the mock plugin consumer; that
 * is how the test drives its own counterpart, which keeps everything in one
 * file with no interdependency.
 */

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliPath = join(root, "cli", "cancip-cli.mjs");

// ------------------------------------------------------------------ consumer
// Stands in for the plugin: drains queue.jsonl and answers in result.jsonl,
// using the same envelope the real bridge writes.
function runConsumer(dir) {
  const queuePath = join(dir, "queue.jsonl");
  const resultPath = join(dir, "result.jsonl");
  const timer = setInterval(() => {
    try {
      if (!existsSync(queuePath)) return;
      const raw = readFileSync(queuePath, "utf8");
      if (!raw.trim()) return;
      writeFileSync(queuePath, "");
      const out = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let command = null;
        try {
          command = JSON.parse(trimmed);
        } catch {
          out.push({ id: null, op: null, ts: Date.now(), ok: false, error: "bad json", ms: 0 });
          continue;
        }
        const ts = Date.now();
        if (command.op === "eval" && command.code === "throw") {
          out.push({ id: command.id, op: command.op, ts, ok: false, error: "mock failure: cannot explode politely", ms: 1 });
          continue;
        }
        const table = {
          ping: { pong: true, bridge: "Cancip Queue Bridge", vault: "MockVault", files: 3, dir },
          status: { transport: "queue", accessMode: "confirmation", ticks: 1, executed: 0, failures: 0 },
          list: { count: 1, files: [{ p: "A.md", s: 1, m: 1 }] },
          stat: { exists: true, path: command.path, folder: false, size: 1, mtime: 1 },
          read: { readPath: command.path, query: command.query ?? "" },
          write: { written: command.path, bytes: String(command.data ?? "").length },
          mkdir: { dir: command.path },
          move: { from: command.from, to: command.to },
          delete: { total: 1, trashed: 1, hard: 0, missing: [], errors: [] },
          cmds: { count: 1, ids: ["app:reload"] },
          cmd: { command: command.command, executed: true },
          sync: { command: command.command || "remotely-save:start-sync", executed: true },
          open: { opened: command.path },
          notice: { shown: true, text: command.text },
          eval: { evaluated: command.code }
        };
        out.push({ id: command.id, op: command.op, ts, ok: true, result: table[command.op] ?? { op: command.op }, ms: 1 });
      }
      appendFileSync(resultPath, `${out.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    } catch {
      // The test kills this process; a read racing the kill is expected.
    }
  }, 60);
  process.on("SIGTERM", () => {
    clearInterval(timer);
    process.exit(0);
  });
}

if (process.argv[2] === "--consume") {
  runConsumer(process.argv[3]);
} else {
  await runTests();
}

// --------------------------------------------------------------------- tests
async function runTests() {
  const TEMP_ROOT = await mkdtemp(join(tmpdir(), "cancip-cli-queue-"));
  const vault = join(TEMP_ROOT, "vault");
  const pluginDir = join(vault, ".obsidian", "plugins", "cancip");
  const bridgeDir = join(pluginDir, "bridge");

  let consumer = null;
  let pass = 0;
  let fail = 0;
  const results = [];
  async function check(name, fn) {
    try {
      await fn();
      pass += 1;
      results.push(["PASS", name]);
    } catch (error) {
      fail += 1;
      results.push(["FAIL", `${name} :: ${error && error.message}`]);
    }
  }

  function runCli(args, options = {}) {
    return spawnSync(process.execPath, [cliPath, "--vault", vault, ...args], {
      encoding: "utf8",
      shell: false,
      timeout: 60_000,
      ...options
    });
  }

  async function writeHeartbeat(ageMs = 0) {
    await writeFile(
      join(bridgeDir, "heartbeat.json"),
      JSON.stringify({ ts: Date.now() - ageMs, bridge: "Cancip Queue Bridge", protocol: 1, v: "3.5.0", dir: bridgeDir })
    );
  }

  function resetTransport() {
    for (const file of ["queue.jsonl", "result.jsonl"]) {
      const path = join(bridgeDir, file);
      if (existsSync(path)) writeFileSync(path, "");
    }
  }

  await mkdir(bridgeDir, { recursive: true });
  await writeFile(join(pluginDir, "manifest.json"), JSON.stringify({ id: "cancip", version: "3.5.0" }));
  await writeHeartbeat(0);

  consumer = spawn(process.execPath, [fileURLToPath(import.meta.url), "--consume", bridgeDir], { stdio: "ignore" });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));

  try {
    await check("ping works over the queue channel", () => {
      resetTransport();
      const result = runCli(["--transport", "queue", "--wait-ms", "15000", "ping"]);
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.pong, true);
      assert.equal(parsed.vault, "MockVault");
    });

    await check("a queue-only command works under --transport auto without an HTTP bridge", () => {
      resetTransport();
      const result = runCli(["--wait-ms", "15000", "list"]);
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.count, 1);
      assert.equal(parsed.files[0].p, "A.md");
    });

    await check("write sends the payload and reports the byte count", () => {
      resetTransport();
      const result = runCli(["--transport", "queue", "--wait-ms", "15000", "write", "Inbox/note.md", "--data", "hello"]);
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.written, "Inbox/note.md");
      assert.equal(parsed.bytes, 5);
    });

    await check("--json stays machine-readable for queue commands", () => {
      resetTransport();
      const result = runCli(["--transport", "queue", "--wait-ms", "15000", "--json", "stat", "A.md"]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout.trim()).exists, true);
    });

    await check("the queue channel maps every file-level command onto its op", () => {
      resetTransport();
      const cases = [
        [["mkdir", "Archive"], "dir", "Archive"],
        [["mv", "A.md", "B.md"], "to", "B.md"],
        [["cmds"], "count", 1],
        [["cmd", "app:reload"], "executed", true],
        [["notice", "hello"], "shown", true],
        [["eval", "1 + 1"], "evaluated", "1 + 1"]
      ];
      for (const [args, key, expected] of cases) {
        const result = runCli(["--transport", "queue", "--wait-ms", "15000", ...args]);
        assert.equal(result.status, 0, `${args.join(" ")} -> ${result.stderr}`);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed[key], expected, `${args.join(" ")} -> ${JSON.stringify(parsed)}`);
      }
    });

    await check("a failed queue command exits non-zero and surfaces the plugin's error", () => {
      resetTransport();
      const result = runCli(["--transport", "queue", "--wait-ms", "15000", "eval", "throw"]);
      assert.notEqual(result.status, 0, `expected failure, got ${result.status} / ${result.stdout}`);
      assert.match(
        result.stderr,
        /mock failure/,
        `status=${result.status} stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)} error=${String(result.error)}`
      );
    });

    await check("--transport http refuses an operation only the queue can run", () => {
      const result = runCli(["--transport", "http", "ping"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /file-queue channel/);
    });

    await check("a missing heartbeat fails fast with an actionable message", async () => {
      const path = join(bridgeDir, "heartbeat.json");
      const saved = readFileSync(path, "utf8");
      writeFileSync(path, "");
      await rm(path, { force: true });
      const result = runCli(["--transport", "queue", "ping"]);
      writeFileSync(path, saved);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /file-queue channel is not ready/);
    });

    await check("a stale heartbeat is reported instead of hanging until timeout", async () => {
      await writeHeartbeat(10 * 60_000);
      const result = runCli(["--transport", "queue", "ping"]);
      await writeHeartbeat(0);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /heartbeat is stale/);
    });

    await check("--wait-ms bounds how long a silent plugin is waited for", async () => {
      const stopped = consumer;
      consumer = null;
      stopped.kill("SIGTERM");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
      const started = Date.now();
      const result = runCli(["--transport", "queue", "--wait-ms", "1200", "ping"]);
      const elapsed = Date.now() - started;
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /did not answer within/);
      assert.ok(elapsed < 20_000, `the CLI should give up near the timeout, took ${elapsed}ms`);
    });

    await check("doctor reports both legs and names the queue directory", async () => {
      resetTransport();
      const result = runCli(["--transport", "queue", "--wait-ms", "15000", "doctor"]);
      assert.equal(result.status, 0, result.stderr);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.cliVersion, "3.5.0");
      assert.equal(parsed.transports.queue.available, true);
      assert.equal(parsed.transports.http.available, false);
      assert.equal(parsed.transports.queue.dir, bridgeDir);
    });

    await check("help documents the transport switch", () => {
      const result = runCli(["help"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /--transport auto\|http\|queue/);
      assert.match(result.stdout, /minis-bridge/);
    });
  } finally {
    if (consumer) consumer.kill("SIGTERM");
    await rm(TEMP_ROOT, { recursive: true, force: true });
  }

  for (const [status, name] of results) {
    if (status === "FAIL") console.error(`${status}  ${name}`);
    else console.log(`${status}  ${name}`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}
