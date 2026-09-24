#!/usr/bin/env node
/*
 * Cancip CLI
 *
 * One command-line surface for driving Obsidian through Cancip, over whichever
 * local channel the machine can actually offer:
 *
 *   http   the Agent Bridge — a listener on 127.0.0.1 with a private Bearer
 *          credential. Fast and synchronous, but it needs Node's node:http, so
 *          it only exists on desktop.
 *   queue  the file-queue bridge — commands appended to `bridge/queue.jsonl`
 *          inside the vault, answers read back from `bridge/result.jsonl`. No
 *          socket and no Node runtime on Obsidian's side, so it also works on
 *          mobile and inside sandboxes that can only reach the vault directory.
 *
 * Both channels reach the same handler set inside the plugin, so an agent sees
 * one operation surface. `--transport auto` (the default) prefers the HTTP leg
 * and falls back to the queue; operations that only the queue can perform
 * (file writes, command execution, Obsidian-side evaluation) select it directly.
 *
 * The queue protocol is item-for-item compatible with arias007/minis-bridge.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const CLI_VERSION = "3.5.34";
const BRIDGE_PORT = 43172;
const PORT_FALLBACK_COUNT = 8;
const REQUEST_TIMEOUT_MS = 10 * 60_000;
const PLUGIN_IDS = ["cancip"];
const MCP_PROTOCOL_VERSION = "2024-11-05";

// ---------------------------------------------------------------- queue channel
const QUEUE_SUBDIR = "bridge";
const QUEUE_FILE = "queue.jsonl";
const QUEUE_RESULT_FILE = "result.jsonl";
/** One file per identified result, named by the command id. Reply protocol 2+. */
const QUEUE_RESULT_DIR = "result";
/**
 * Reply-protocol version at which results moved out of the single log. Read from
 * `heartbeat.replyProtocol`, which the plugin keeps separate from `protocol` so
 * the minis-bridge wire number stays at 1 while the reply channel can advance.
 */
const QUEUE_FILED_RESULT_PROTOCOL = 2;
const QUEUE_HEARTBEAT_FILE = "heartbeat.json";
const QUEUE_POLL_MS = 120;
const QUEUE_DEFAULT_WAIT_MS = 90_000;
const QUEUE_HEARTBEAT_STALE_MS = 60_000;
const TRANSPORTS = ["auto", "http", "queue"];

/**
 * Verbs without a dedicated HTTP endpoint. They are not queue-only any more:
 * `callCancip` sends them to the generic `/v1/op` leg and keeps the queue as the
 * fallback for older plugins and for mobile, where no HTTP port exists.
 */
const GENERIC_OP_VERBS = new Set([
  "ping", "list", "stat", "write", "mkdir", "move", "delete", "cmds", "cmd", "sync", "notice", "eval"
]);

const HTTP_ROUTES = {
  status: { method: "GET", path: "/v1/status" },
  capabilities: { method: "GET", path: "/v1/capabilities" },
  search: { method: "POST", path: "/v1/search" },
  read: { method: "POST", path: "/v1/read" },
  open: { method: "POST", path: "/v1/open" },
  prompt: { method: "POST", path: "/v1/prompt" },
  action: { method: "POST", path: "/v1/action" },
  "agent.run": { method: "POST", path: "/v1/agent/run" }
};

/**
 * Flags that never take a value. Without this list `--json stat A.md` would
 * consume "stat" as the value of --json and leave "A.md" as the command name.
 */
const BOOLEAN_OPTIONS = new Set(["json", "help", "force", "hard", "version"]);

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equal = arg.indexOf("=");
    if (equal > 2) {
      options[arg.slice(2, equal)] = arg.slice(equal + 1);
      continue;
    }
    const key = arg.slice(2);
    if (BOOLEAN_OPTIONS.has(key)) {
      options[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { options, positionals };
}

function asInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonIfPresent(path) {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function obsidianConfigCandidates() {
  if (process.platform === "win32") {
    return [join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "obsidian", "obsidian.json")];
  }
  if (process.platform === "darwin") {
    return [join(homedir(), "Library", "Application Support", "obsidian", "obsidian.json")];
  }
  return [
    join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "obsidian", "obsidian.json"),
    join(homedir(), ".config", "obsidian", "obsidian.json")
  ];
}

/**
 * Locate an installed Cancip inside a vault.
 *
 * `manifest.json` is the only hard requirement: the queue channel needs no
 * credential at all, so a vault that has Cancip installed but has never written
 * `data.json` must still be discoverable.
 */
function pluginDataForVault(vaultPath) {
  for (const pluginId of PLUGIN_IDS) {
    const pluginDir = join(vaultPath, ".obsidian", "plugins", pluginId);
    const manifestPath = join(pluginDir, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = readJson(manifestPath);
    } catch {
      continue;
    }
    const data = readJsonIfPresent(join(pluginDir, "data.json")) ?? {};
    const token = typeof data.agentBridgeToken === "string" ? data.agentBridgeToken.trim() : "";
    const port = asInt(data.agentBridgePort, BRIDGE_PORT, 1024, 65535);
    return { vaultPath, pluginDir, manifest, data, token, port };
  }
  return null;
}

function discoverVaults(explicitVault) {
  const candidates = [];
  const preferred = explicitVault || process.env.CANCIP_VAULT || "";
  if (preferred) candidates.push({ path: resolve(preferred), open: true, explicit: true });
  for (const configPath of obsidianConfigCandidates()) {
    if (!existsSync(configPath)) continue;
    try {
      const config = readJson(configPath);
      for (const entry of Object.values(config.vaults || {})) {
        if (!entry || typeof entry !== "object" || typeof entry.path !== "string") continue;
        candidates.push({ path: resolve(entry.path), open: entry.open === true, explicit: false });
      }
    } catch {
      // A malformed Obsidian registry must not block an explicit vault.
    }
  }
  const unique = new Map();
  for (const candidate of candidates) {
    const key = process.platform === "win32" ? candidate.path.toLowerCase() : candidate.path;
    const previous = unique.get(key);
    if (!previous || candidate.explicit || (candidate.open && !previous.open)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((left, right) => Number(right.explicit) - Number(left.explicit) || Number(right.open) - Number(left.open));
}

function resolveCancip(options) {
  for (const candidate of discoverVaults(typeof options.vault === "string" ? options.vault : "")) {
    const found = pluginDataForVault(candidate.path);
    if (found) return found;
  }
  throw new Error("No Obsidian vault with an installed Cancip plugin was found. Open the vault or pass --vault <path>.");
}

// ---------------------------------------------------------------- http channel

async function probePort(context, port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      signal: controller.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${context.token}` }
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.name === "Cancip Agent Bridge" ? { port, status: body } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveBridge(context) {
  if (!context.token) throw new Error("Cancip Agent Bridge token is not initialized. Reload Cancip in Obsidian once.");
  const explicitPort = process.env.CANCIP_PORT ? asInt(process.env.CANCIP_PORT, context.port, 1024, 65535) : 0;
  const candidates = explicitPort
    ? [explicitPort]
    : Array.from({ length: PORT_FALLBACK_COUNT + 1 }, (_, offset) => context.port + offset);
  for (const port of candidates) {
    const probe = await probePort(context, port);
    if (probe) return probe;
  }
  throw new Error("Cancip Agent Bridge is not reachable. Open Obsidian, enable Cancip Agent Bridge, then reload the plugin.");
}

async function httpBridgeOrNull(context) {
  try {
    return await resolveBridge(context);
  } catch {
    return null;
  }
}

async function bridgeRequestOn(context, bridge, method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${context.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) {
      const message = payload?.error?.message || `Bridge request failed with HTTP ${response.status}.`;
      const error = new Error(message);
      error.code = payload?.error?.code || "bridge_request_failed";
      throw error;
    }
    return payload.result ?? payload;
  } finally {
    clearTimeout(timer);
  }
}

async function bridgeRequest(context, method, path, body) {
  return await bridgeRequestOn(context, await resolveBridge(context), method, path, body);
}

// --------------------------------------------------------------- queue channel

function queueDir(context) {
  return join(context.pluginDir, QUEUE_SUBDIR);
}

function appendQueueLine(dir, line) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, QUEUE_FILE), line, "utf8");
}

/** File name the plugin files one identified result under. Same rule as its side. */
function filedResultName(id) {
  const safe = String(id).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return `${safe || "result"}.json`;
}

/**
 * Read this command's own answer.
 *
 * Plugin protocol 2 files each identified result under `result/<id>.json`, so the
 * normal path is one small read. `legacyScan` is only true against an older
 * plugin; without it the growing result log is never opened, which is what kept
 * every poll proportional to the number of calls ever made.
 */
function findQueueResult(dir, id, legacyScan = true) {
  try {
    const filed = JSON.parse(readFileSync(join(dir, QUEUE_RESULT_DIR, filedResultName(id)), "utf8"));
    if (filed && filed.id === id) return filed;
  } catch {
    // Not filed yet (still in flight), or an older plugin. Fall through.
  }
  if (!legacyScan) return null;
  let raw = "";
  try {
    raw = readFileSync(join(dir, QUEUE_RESULT_FILE), "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(id)) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.id === id) return parsed;
    } catch {
      // A partially written line is expected while the plugin is appending;
      // it parses on a later poll.
    }
  }
  return null;
}

/**
 * Whether the queue still holds this command, which means it has not run at all.
 *
 * Distinguishes "waiting its turn" from "left the queue and is being executed":
 * the plugin only removes a command once it has been picked up.
 */
function queueHoldsId(dir, id) {
  try {
    const raw = readFileSync(join(dir, QUEUE_FILE), "utf8");
    return raw.split("\n").some((line) => {
      if (!line.trim()) return false;
      try {
        return JSON.parse(line).id === id;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Send one command through the file queue and wait for its result.
 *
 * The heartbeat is checked first so a caller gets "Cancip is not running"
 * instead of a silent timeout. Note the delivery contract inherited from
 * minis-bridge: the plugin clears the queue before executing it, so a command
 * that has left the queue but has no result yet is "in flight", not lost.
 */
async function queueRequest(context, op, payload, options) {
  const dir = queueDir(context);
  const heartbeat = readJsonIfPresent(join(dir, QUEUE_HEARTBEAT_FILE));
  if (!heartbeat) {
    throw new Error(
      `Cancip's file-queue channel is not ready: no ${QUEUE_HEARTBEAT_FILE} in ${dir}. ` +
        "Open the vault in Obsidian with Cancip enabled, and turn on the file-queue channel in Cancip settings."
    );
  }
  const beatAge = Date.now() - Number(heartbeat.ts || 0);
  if (!Number.isFinite(beatAge) || beatAge > QUEUE_HEARTBEAT_STALE_MS) {
    throw new Error(
      `Cancip's file-queue heartbeat is stale (${Number.isFinite(beatAge) ? Math.round(beatAge / 1000) : "?"}s old). ` +
        "Obsidian is probably closed, or its timers are frozen while the app sits in the background. " +
        "Bring Obsidian to the foreground and retry."
    );
  }
  const id = `cancip-cli-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  appendQueueLine(dir, `${JSON.stringify({ ...payload, id, op })}\n`);
  const waitMs = asInt(options["wait-ms"], QUEUE_DEFAULT_WAIT_MS, 1000, 600_000);
  const deadline = Date.now() + waitMs;
  // Only an older plugin needs the growing shared log searched; from reply
  // protocol 2 the answer is filed under its own id and the log is never opened.
  // `replyProtocol` is the dedicated field; `protocol` is the fallback so a build
  // that folded both into one number still reads correctly.
  const replyProtocol = Number(heartbeat.replyProtocol ?? heartbeat.protocol ?? 1);
  const legacyScan = !(Number.isFinite(replyProtocol) && replyProtocol >= QUEUE_FILED_RESULT_PROTOCOL);
  while (Date.now() < deadline) {
    const result = findQueueResult(dir, id, legacyScan);
    if (result) {
      if (result.ok === true) return result.result ?? null;
      const error = new Error(result.error || "Cancip queue command failed.");
      // Keep the plugin's own cause. Flattening every failure into one code is
      // what made "command does not exist" indistinguishable from a refusal.
      error.code = result.code || "queue_command_failed";
      throw error;
    }
    await sleep(QUEUE_POLL_MS);
  }
  // A timeout has three very different causes and the caller cannot act without
  // knowing which one it is. The one this bridge creates itself: an op that needs
  // a visible window is deliberately held while Obsidian sits in the background,
  // so the command is queued and healthy, just not run yet.
  if (queueHoldsId(dir, id)) {
    const info = Array.isArray(heartbeat.opCatalog)
      ? heartbeat.opCatalog.find((entry) => entry && entry.op === op)
      : null;
    if (info && info.requiresForeground && heartbeat.foreground === false) {
      const error = new Error(
        `${op} needs Obsidian in the foreground, and Obsidian is in the background, so the command is ` +
          `still queued and has not run. Bring Obsidian to the front and it will run within about a second. ` +
          `Verbs that do not need the window (read, view, ls, stat, write, search, …) work right now.`
      );
      error.code = "HELD_FOREGROUND";
      throw error;
    }
    const error = new Error(
      `Cancip has not picked up the ${op} command after ${waitMs}ms: it is still in ${join(dir, QUEUE_FILE)}. ` +
        "Either the plugin's poll timer is frozen (Obsidian in the background on some platforms) or the channel is off."
    );
    error.code = "QUEUED_NOT_RUN";
    throw error;
  }
  throw new Error(
    `Cancip did not answer within ${waitMs}ms. The command may still be running; ` +
      `check Obsidian, or read ${join(dir, QUEUE_RESULT_FILE)} directly.`
  );
}

function requestedTransport(options) {
  const raw = String(options.transport || process.env.CANCIP_TRANSPORT || "auto").trim().toLowerCase();
  return TRANSPORTS.includes(raw) ? raw : "auto";
}

/**
 * Single entry point for every operation, on either channel.
 *
 * `auto` prefers HTTP for *every* verb: routes with no dedicated endpoint go
 * through the generic /v1/op leg, which runs the same executor the queue uses.
 * HTTP is synchronous and keeps answering while Obsidian sits in the background
 * (queue polling stops when Chromium throttles the plugin's timers there). The
 * queue stays as the fallback: it is the only leg that works on mobile, and it
 * is what an older plugin without /v1/op still answers on.
 */
async function callCancip(context, op, payload, options) {
  const transport = requestedTransport(options);
  const route = HTTP_ROUTES[op];
  const generic = !route || GENERIC_OP_VERBS.has(op);
  const genericBody = () => ({ op, ...payload });
  if (transport === "queue") return await queueRequest(context, op, payload, options);
  if (transport === "http") {
    return generic
      ? await bridgeRequest(context, "POST", "/v1/op", genericBody())
      : await bridgeRequest(context, route.method, route.path, route.method === "GET" ? undefined : payload);
  }
  const bridge = await httpBridgeOrNull(context);
  if (bridge) {
    try {
      return generic
        ? await bridgeRequestOn(context, bridge, "POST", "/v1/op", genericBody())
        : await bridgeRequestOn(context, bridge, route.method, route.path, route.method === "GET" ? undefined : payload);
    } catch (error) {
      // A plugin that predates the generic leg answers 404 here; the queue is
      // then the only channel that can run this verb, so fall through to it.
      if (error?.code !== "not_found") throw error;
    }
  }
  return await queueRequest(context, op, payload, options);
}

// ------------------------------------------------------------------- output

function human(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function output(value, options) {
  if (options.json === true || options.output === "json") {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  process.stdout.write(`${human(value)}\n`);
}

async function stdinText() {
  if (process.stdin.isTTY) return "";
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text.trim();
}

// -------------------------------------------------------------- agent linking

function commandCandidate(provider) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  if (process.platform === "win32") {
    const packageRoot = join(
      process.env.APPDATA || "",
      "npm",
      "node_modules",
      provider === "codex" ? "@openai" : "@anthropic-ai",
      provider === "codex" ? "codex" : "claude-code"
    );
    const nativeModule = provider === "claude" ? join(packageRoot, "bin", "claude.exe") : "";
    if (nativeModule && existsSync(nativeModule)) return { command: nativeModule, prefix: [] };
    const nodeModule = provider === "codex" ? join(packageRoot, "bin", "codex.js") : join(packageRoot, "cli.js");
    if (existsSync(nodeModule)) return { command: process.execPath, prefix: [nodeModule] };
  }
  const name = process.platform === "win32" ? `${provider}.exe` : provider;
  const located = spawnSync(locator, [name], { encoding: "utf8", windowsHide: true, shell: false });
  const executable = String(located.stdout || "").split(/\r?\n/).map((item) => item.trim()).find((item) => item && existsSync(item));
  return executable && !/\.(?:cmd|bat)$/i.test(executable) ? { command: executable, prefix: [] } : null;
}

function runAgentCli(provider, args) {
  const candidate = commandCandidate(provider);
  if (!candidate) throw new Error(`${provider} CLI was not found.`);
  return spawnSync(candidate.command, [...candidate.prefix, ...args], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 30_000
  });
}

function mcpConnectionState(provider) {
  if (!commandCandidate(provider)) {
    return { provider, available: false, linked: false, status: "unavailable", detail: `${provider} CLI was not found.` };
  }
  const current = runAgentCli(provider, ["mcp", "get", "cancip"]);
  return current.status === 0
    ? { provider, available: true, linked: true, status: "linked", detail: "Cancip MCP is configured." }
    : { provider, available: true, linked: false, status: "not-linked", detail: "Cancip MCP is not configured yet." };
}

function registerMcp(context, provider, force) {
  const state = mcpConnectionState(provider);
  if (!state.available) return state;
  const current = runAgentCli(provider, ["mcp", "get", "cancip"]);
  if (current.status === 0 && !force) {
    return { provider, available: true, linked: true, status: "already-configured", detail: "Cancip MCP is already available to this agent. Use --force only to replace it." };
  }
  if (current.status === 0 && force) runAgentCli(provider, ["mcp", "remove", ...(provider === "claude" ? ["-s", "user"] : []), "cancip"]);
  const cliPath = fileURLToPath(import.meta.url);
  const mcpCommand = [process.execPath, cliPath, "mcp", "--vault", context.vaultPath];
  const args = provider === "codex"
    ? ["mcp", "add", "cancip", "--", ...mcpCommand]
    : ["mcp", "add", "-s", "user", "cancip", "--", ...mcpCommand];
  const added = runAgentCli(provider, args);
  if (added.status !== 0) {
    const detail = added.error?.message || String(added.stderr || added.stdout || "unknown error").trim();
    throw new Error(`${provider} MCP registration failed: ${detail}`);
  }
  return { provider, available: true, linked: true, status: "linked", detail: "Cancip MCP tools are now available to this agent." };
}

function requestedLinkProviders(words) {
  const normalized = words.map((word) => String(word).trim().toLowerCase()).filter(Boolean);
  if (normalized.includes("codex")) return ["codex"];
  if (normalized.includes("claude") || normalized.includes("claudecode") || normalized.includes("claude-code")) return ["claude"];
  if (normalized.includes("all")) return ["codex", "claude"];
  if (normalized.includes("auto") || normalized.includes("obsidian") || normalized.includes("cancip")) {
    const available = ["codex", "claude"].filter((provider) => commandCandidate(provider));
    return available.length ? available : ["codex", "claude"];
  }
  return [];
}

// ---------------------------------------------------------------------- MCP

const MCP_TOOLS = [
  {
    name: "cancip_status",
    description: "Check the local Cancip/Obsidian bridge and its permission mode.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "cancip_ping",
    description: "Probe the file-queue channel: returns plugin version, vault name, file count and queue statistics.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "cancip_search",
    description: "Search the active Obsidian Vault through Cancip's indexed content and attachment search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
        scope: { type: "string", enum: ["filename", "content", "both"] },
        includeConfigs: { type: "boolean" },
        includeArchived: { type: "boolean" }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "cancip_ls",
    description: "List files in the Vault, optionally filtered by path prefix.",
    inputSchema: {
      type: "object",
      properties: { prefix: { type: "string" } },
      additionalProperties: false
    }
  },
  {
    name: "cancip_stat",
    description: "Report whether a Vault path exists, and its kind, size and modification time.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }
  },
  {
    name: "cancip_read",
    description: "Read a Vault-relative file, folder, PDF, Office document, archive, or other Cancip-supported attachment.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        query: { type: "string" },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
        maxChars: { type: "integer", minimum: 500, maximum: 30000 }
      },
      required: ["path"],
      additionalProperties: false
    }
  },
  {
    name: "cancip_write",
    description: "Write a Vault file, creating it when missing.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, data: { type: "string" } },
      required: ["path", "data"],
      additionalProperties: false
    }
  },
  {
    name: "cancip_mkdir",
    description: "Create a Vault folder.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }
  },
  {
    name: "cancip_move",
    description: "Move or rename a Vault path.",
    inputSchema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"],
      additionalProperties: false
    }
  },
  {
    name: "cancip_delete",
    description: "Delete Vault paths. Defaults to the Obsidian trash; `hard` removes them permanently.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        paths: { type: "array", items: { type: "string" }, maxItems: 200 },
        hard: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "cancip_cmds",
    description: "List Obsidian command ids, optionally filtered by substring.",
    inputSchema: { type: "object", properties: { filter: { type: "string" } }, additionalProperties: false }
  },
  {
    name: "cancip_cmd",
    description: "Execute an Obsidian command by id.",
    inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"], additionalProperties: false }
  },
  {
    name: "cancip_open",
    description: "Open a Vault file or folder in Obsidian using Cancip's verified target route.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, query: { type: "string" }, targetKind: { type: "string" } },
      additionalProperties: false
    }
  },
  {
    name: "cancip_notice",
    description: "Show an Obsidian notice in the running app.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }
  },
  {
    name: "cancip_eval",
    description: "Run Obsidian-side JavaScript through Cancip's obsidian.eval route. Honours the Execute Obsidian commands setting.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" }, timeoutMs: { type: "integer", minimum: 200, maximum: 15000 } },
      required: ["code"],
      additionalProperties: false
    }
  },
  {
    name: "cancip_send",
    description: "Send a task into Cancip's normal side-panel agent loop. Cancip retains its UI, context, steps, approvals, review, and final answer.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
      additionalProperties: false
    }
  },
  {
    name: "cancip_action",
    description: "Run one or more existing cancip-action objects. Read-only actions run immediately; writes queue for approval unless Cancip is in Full access.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "object" },
        actions: { type: "array", items: { type: "object" }, minItems: 1, maxItems: 20 }
      },
      additionalProperties: false
    }
  }
];

async function mcpToolCall(context, name, args) {
  if (name === "cancip_status") return await callCancip(context, "status", {}, {});
  if (name === "cancip_ping") return await callCancip(context, "ping", {}, {});
  if (name === "cancip_search") return await callCancip(context, "search", args, {});
  if (name === "cancip_ls") return await callCancip(context, "list", { prefix: args.prefix ?? "" }, {});
  if (name === "cancip_stat") return await callCancip(context, "stat", { path: args.path }, {});
  if (name === "cancip_read") return await callCancip(context, "read", args, {});
  if (name === "cancip_write") return await callCancip(context, "write", { path: args.path, data: args.data ?? "" }, {});
  if (name === "cancip_mkdir") return await callCancip(context, "mkdir", { path: args.path }, {});
  if (name === "cancip_move") return await callCancip(context, "move", { from: args.from, to: args.to }, {});
  if (name === "cancip_delete") return await callCancip(context, "delete", args, {});
  if (name === "cancip_cmds") return await callCancip(context, "cmds", { filter: args.filter ?? "" }, {});
  if (name === "cancip_cmd") return await callCancip(context, "cmd", { command: args.command }, {});
  if (name === "cancip_open") return await callCancip(context, "open", args, {});
  if (name === "cancip_notice") return await callCancip(context, "notice", { text: args.text }, {});
  if (name === "cancip_eval") return await callCancip(context, "eval", args, {});
  if (name === "cancip_send") return await callCancip(context, "prompt", { prompt: args.prompt }, {});
  if (name === "cancip_action") return await callCancip(context, "action", args, {});
  throw new Error(`Unknown Cancip MCP tool: ${name}`);
}

async function runMcp(context) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(request, "id")) continue;
    try {
      let result;
      if (request.method === "initialize") {
        result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "cancip", version: CLI_VERSION },
          instructions: "Use Cancip for Obsidian Vault search, reads, file operations, UI opens, and permission-aware actions. Cancip selects the HTTP or file-queue channel automatically."
        };
      } else if (request.method === "ping") {
        result = {};
      } else if (request.method === "tools/list") {
        result = { tools: MCP_TOOLS };
      } else if (request.method === "tools/call") {
        const name = request.params?.name;
        const args = request.params?.arguments && typeof request.params.arguments === "object" ? request.params.arguments : {};
        try {
          const value = await mcpToolCall(context, name, args);
          result = { content: [{ type: "text", text: human(value) }], structuredContent: value };
        } catch (error) {
          result = { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true };
        }
      } else {
        throw Object.assign(new Error("Method not found"), { rpcCode: -32601 });
      }
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: error.rpcCode || -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
    }
  }
}

// -------------------------------------------------------------------- usage

function usage() {
  return `Cancip CLI ${CLI_VERSION}

Usage:
  cancip status [--vault <path>] [--json]
  cancip capabilities
  cancip ping
  cancip doctor
  cancip search <query> [--limit 12] [--scope both]
  cancip read <vault-path> [--query <text>] [--max-chars 12000]
  cancip ls [prefix] [--limit 200]
  cancip stat <vault-path>
  cancip write <vault-path> [--data <text>|stdin]
  cancip mkdir <vault-path>
  cancip mv <from> <to>
  cancip rm <path...> [--hard]
  cancip cmds [filter]
  cancip cmd <command-id>
  cancip sync [command-id]
  cancip open <vault-path>
  cancip view                          structured live view (file, mode, selection, tabs)
  cancip notice <text>
  cancip eval <code>
  cancip send <prompt>
  cancip action '<cancip-action JSON>'
  cancip agent run <prompt> [--agent auto|codex|claude] [--model <model>]
  cancip connect [codex|claude|all] [--force]
  cancip link [obsidian cancip|codex|claude|all] [--force]
  cancip mcp

Channel options:
  --transport auto|http|queue   Which local channel to use (default: auto)
  --wait-ms <ms>                Queue-channel answer timeout (default: 90000)
  --json                        Machine-readable output

  http   listens on 127.0.0.1 with a private credential; desktop only. Runs every
         verb (the ones without a dedicated endpoint go through /v1/op) and keeps
         answering while Obsidian sits in the background.
  queue  appends to bridge/queue.jsonl inside the vault; works on mobile and in
         sandboxes that can only reach the vault directory. Operation names and
         file formats match arias007/minis-bridge. Verbs that need a visible
         window (open, notice, cmd, sync) are held while Obsidian is in the
         background and run when it comes forward; every other verb runs right
         away. A held command is reported as held, not as a failure.

The CLI discovers the open Obsidian Vault and never prints the bridge token.`;
}

// --------------------------------------------------------------------- main

async function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  const rawCommand = positionals.shift();
  // `--version` must be answered before the implicit "no command means help"
  // default, otherwise a harmless `--vault X --version` degrades into the banner.
  const wantsVersion = rawCommand === "version" || rawCommand === "--version" || options.version === true;
  const wantsHelp =
    rawCommand === "help" || rawCommand === "--help" || options.help === true || (!rawCommand && !wantsVersion);
  if (wantsVersion && rawCommand !== "help" && rawCommand !== "--help" && options.help !== true) {
    output(CLI_VERSION, options);
    return;
  }
  if (wantsHelp) {
    output(usage(), options);
    return;
  }
  const command = rawCommand;
  const context = resolveCancip(options);
  if (command === "mcp") {
    await runMcp(context);
    return;
  }
  if (command === "status") {
    const bridge = requestedTransport(options) === "http" ? await resolveBridge(context) : await httpBridgeOrNull(context);
    if (bridge) {
      output({ connected: true, transport: "http", vault: basename(context.vaultPath), pluginVersion: context.manifest.version, port: bridge.port, ...bridge.status }, options);
      return;
    }
    output({ connected: true, transport: "queue", vault: basename(context.vaultPath), ...(await callCancip(context, "status", {}, options)) }, options);
    return;
  }
  if (command === "ping") {
    output(await callCancip(context, "ping", {}, options), options);
    return;
  }
  if (command === "capabilities") {
    output(await callCancip(context, "capabilities", {}, options), options);
    return;
  }
  if (command === "search") {
    const query = positionals.join(" ").trim() || String(options.query || "").trim();
    if (!query) throw new Error("search requires a query.");
    output(await callCancip(context, "search", {
      query,
      limit: asInt(options.limit, 12, 1, 50),
      scope: options.scope || "both",
      includeConfigs: options["include-configs"] === true,
      includeArchived: options["include-archived"] === true
    }, options), options);
    return;
  }
  if (command === "read") {
    const path = positionals.join(" ").trim() || String(options.path || "").trim();
    if (!path) throw new Error("read requires a Vault-relative path.");
    output(await callCancip(context, "read", {
      path,
      query: options.query || "",
      startLine: options["start-line"],
      endLine: options["end-line"],
      maxChars: asInt(options["max-chars"], 12000, 500, 30000)
    }, options), options);
    return;
  }
  if (command === "ls" || command === "list") {
    const prefix = positionals.join(" ").trim() || String(options.prefix || "").trim();
    const listed = await callCancip(context, "list", { prefix }, options);
    const limit = asInt(options.limit, 200, 1, 20_000);
    if (listed && Array.isArray(listed.files) && listed.files.length > limit) {
      output({ count: listed.count, shown: limit, files: listed.files.slice(0, limit) }, options);
      return;
    }
    output(listed, options);
    return;
  }
  if (command === "stat") {
    const path = positionals.join(" ").trim() || String(options.path || "").trim();
    if (!path) throw new Error("stat requires a Vault-relative path.");
    output(await callCancip(context, "stat", { path }, options), options);
    return;
  }
  if (command === "write") {
    const path = positionals.join(" ").trim() || String(options.path || "").trim();
    if (!path) throw new Error("write requires a Vault-relative path.");
    const data = typeof options.data === "string" ? options.data : await stdinText();
    output(await callCancip(context, "write", { path, data }, options), options);
    return;
  }
  if (command === "mkdir") {
    const path = positionals.join(" ").trim() || String(options.path || "").trim();
    if (!path) throw new Error("mkdir requires a Vault-relative path.");
    output(await callCancip(context, "mkdir", { path }, options), options);
    return;
  }
  if (command === "mv" || command === "move") {
    const from = positionals[0] || String(options.from || "").trim();
    const to = positionals[1] || String(options.to || "").trim();
    if (!from || !to) throw new Error("mv requires <from> and <to>.");
    output(await callCancip(context, "move", { from, to }, options), options);
    return;
  }
  if (command === "rm" || command === "delete") {
    const paths = positionals.filter(Boolean);
    if (!paths.length) throw new Error("rm requires at least one Vault path.");
    output(await callCancip(context, "delete", { paths, hard: options.hard === true }, options), options);
    return;
  }
  if (command === "cmds") {
    const filter = positionals.join(" ").trim() || String(options.filter || "").trim();
    output(await callCancip(context, "cmds", { filter }, options), options);
    return;
  }
  if (command === "cmd") {
    const id = positionals.join(" ").trim() || String(options.command || "").trim();
    if (!id) throw new Error("cmd requires a command id.");
    output(await callCancip(context, "cmd", { command: id }, options), options);
    return;
  }
  if (command === "sync") {
    const id = positionals.join(" ").trim() || String(options.command || "").trim();
    output(await callCancip(context, "sync", { command: id }, options), options);
    return;
  }
  if (command === "open") {
    const path = positionals.join(" ").trim() || String(options.path || "").trim();
    if (!path) throw new Error("open requires a Vault-relative path.");
    output(await callCancip(context, "open", { path }, options), options);
    return;
  }
  if (command === "view" || command === "currentView" || command === "current-view") {
    // Structured live-view answer: activeFile / viewType / displayText /
    // selection / mode / area / tabs. Asking through `action` returned a rendered
    // report with those fields buried in markdown.
    output(await callCancip(context, "view", {}, options), options);
    return;
  }
  if (command === "notice") {
    const text = positionals.join(" ").trim() || String(options.text || "").trim();
    if (!text) throw new Error("notice requires text.");
    output(await callCancip(context, "notice", { text }, options), options);
    return;
  }
  if (command === "eval") {
    const code = positionals.join(" ").trim() || await stdinText();
    if (!code) throw new Error("eval requires code.");
    output(await callCancip(context, "eval", { code, timeoutMs: asInt(options["timeout-ms"], 2500, 200, 15000) }, options), options);
    return;
  }
  if (command === "send") {
    const prompt = positionals.join(" ").trim() || await stdinText();
    if (!prompt) throw new Error("send requires a prompt.");
    output(await callCancip(context, "prompt", { prompt }, options), options);
    return;
  }
  if (command === "action") {
    const raw = positionals.join(" ").trim() || await stdinText();
    if (!raw) throw new Error("action requires a JSON action object or actions array.");
    const parsed = JSON.parse(raw);
    const body = Array.isArray(parsed) ? { actions: parsed } : parsed?.actions ? parsed : { action: parsed };
    output(await callCancip(context, "action", body, options), options);
    return;
  }
  if (command === "agent" && positionals.shift() === "run") {
    const prompt = positionals.join(" ").trim() || await stdinText();
    if (!prompt) throw new Error("agent run requires a prompt.");
    output(await callCancip(context, "agent.run", {
      prompt,
      provider: options.agent || "auto",
      model: options.model || "",
      system: options.system || ""
    }, options), options);
    return;
  }
  if (command === "link" || command === "connect") {
    await resolveBridge(context);
    const providers = requestedLinkProviders(positionals);
    if (!providers.length) {
      output({
        connected: true,
        vault: basename(context.vaultPath),
        agents: ["codex", "claude"].map((provider) => mcpConnectionState(provider)),
        next: ["cancip connect codex", "cancip connect claude", "cancip link obsidian cancip"]
      }, options);
      return;
    }
    output(providers.map((item) => registerMcp(context, item, options.force === true)), options);
    return;
  }
  if (command === "doctor") {
    const httpBridge = await httpBridgeOrNull(context);
    const dir = queueDir(context);
    const heartbeat = readJsonIfPresent(join(dir, QUEUE_HEARTBEAT_FILE));
    const beatAge = heartbeat ? Date.now() - Number(heartbeat.ts || 0) : null;
    output({
      cliVersion: CLI_VERSION,
      node: process.version,
      platform: process.platform,
      vault: basename(context.vaultPath),
      pluginVersion: context.manifest.version,
      tokenInitialized: Boolean(context.token),
      transports: {
        http: httpBridge
          ? { available: true, port: httpBridge.port, status: httpBridge.status }
          : { available: false, detail: "Agent Bridge not reachable (desktop only)." },
        queue: {
          available: Boolean(heartbeat),
          dir,
          stale: beatAge === null ? null : beatAge > QUEUE_HEARTBEAT_STALE_MS,
          heartbeat
        }
      },
      agents: ["codex", "claude"].map((provider) => mcpConnectionState(provider)),
      connect: {
        automatic: "cancip link obsidian cancip",
        codex: "cancip connect codex",
        claude: "cancip connect claude",
        genericMcp: `${process.execPath} ${fileURLToPath(import.meta.url)} mcp --vault ${context.vaultPath}`
      }
    }, options);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  const payload = { ok: false, error: { code: error?.code || "cli_error", message: error instanceof Error ? error.message : String(error) } };
  const jsonOutput = process.argv.includes("--json") || process.argv.includes("--output=json");
  process.stderr.write(`${jsonOutput ? JSON.stringify(payload) : payload.error.message}\n`);
  process.exitCode = 1;
});
