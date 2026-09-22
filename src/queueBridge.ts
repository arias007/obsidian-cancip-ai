/**
 * Cancip Queue Bridge
 *
 * Why this module exists
 * ----------------------
 * `src/agentBridge.ts` exposes Cancip's operation surface over an HTTP listener
 * bound to 127.0.0.1 and protected by a Bearer credential. That transport is
 * fast and authenticated, but it needs `node:http`; Obsidian mobile runs inside
 * a Capacitor WebView with no Node runtime, which is exactly why the HTTP bridge
 * is desktop-only.
 *
 * This module supplies the missing leg with a *file queue*. An outside program
 * appends one JSON command per line to `queue.jsonl`, the plugin executes each
 * command through its own vault adapter, and the plugin appends one JSON result
 * per line to `result.jsonl`. There is no socket, no port and no network call,
 * so the very same channel works on desktop and on mobile.
 *
 * Wire compatibility with minis-bridge
 * ------------------------------------
 * File names, `op` names, argument names and the result envelope stay
 * item-for-item compatible with `arias007/minis-bridge`, so an existing caller
 * can point at Cancip without rewriting a single command. On top of that set,
 * Cancip's own semantic operations (`status`, `capabilities`, `search`,
 * `prompt`, `action`, `agent.run`) are exposed through the same queue and
 * forwarded to the host handlers that the HTTP bridge already uses, so both
 * transports drive one operation surface.
 *
 * The one deliberate departure from minis-bridge: this bridge assumes no Node
 * globals at all. Everything that touches the host — the vault, the adapter,
 * notifications and code evaluation — arrives as a supplied callback or a
 * structural interface. That is what makes the module safe to run inside the
 * mobile WebView, and it keeps the file free of `obsidian` imports.
 */

import type { AgentBridgeHandlers } from "./agentBridge";

export const QUEUE_BRIDGE_PROTOCOL_VERSION = 1;
export const QUEUE_BRIDGE_QUEUE_FILE = "queue.jsonl";
export const QUEUE_BRIDGE_RESULT_FILE = "result.jsonl";
export const QUEUE_BRIDGE_HEARTBEAT_FILE = "heartbeat.json";
export const QUEUE_BRIDGE_POLL_MS = 1000;
export const QUEUE_BRIDGE_HEARTBEAT_MS = 10_000;

/**
 * Every `op` this bridge accepts. The first group is item-for-item compatible
 * with minis-bridge; the second group is Cancip's semantic surface, forwarded to
 * the same handlers the HTTP bridge uses.
 */
export const QUEUE_BRIDGE_OPS = [
  // minis-bridge compatible file/command operations
  "ping",
  "list",
  "stat",
  "read",
  "write",
  "mkdir",
  "move",
  "delete",
  "cmds",
  "cmd",
  "sync",
  "open",
  "eval",
  "notice",
  // Cancip semantic operations (shared with the HTTP bridge)
  "status",
  "capabilities",
  "search",
  "prompt",
  "action",
  "agent.run"
] as const;

const RESULT_MAX_BYTES = 4 * 1024 * 1024;
const RESULT_KEEP_LINES = 200;
const MAX_COMMANDS_PER_TICK = 800;
const MISSING_REPORT_LIMIT = 200;
const ERROR_REPORT_LIMIT = 100;
const YIELD_EVERY = 50;

export type QueueBridgeRuntimeSettings = {
  enabled: boolean;
  /** Vault-relative directory holding queue.jsonl, result.jsonl and heartbeat.json. */
  dir: string;
};

/**
 * The host supplies the same handlers the HTTP bridge uses, plus the two
 * abilities that would otherwise force an `obsidian` import here.
 */
export type QueueBridgeHandlers = AgentBridgeHandlers & {
  /** Show an Obsidian notice. */
  notice(text: string): void;
  /** Run Obsidian-side JavaScript through Cancip's existing obsidian.eval path. */
  evalCode(code: string, args: Record<string, unknown>): Promise<unknown>;
};

export type QueueBridgeAbstractFile = {
  path: string;
  children?: unknown;
  stat?: { size: number; mtime: number };
};

export type QueueBridgeAdapterLike = {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  append(path: string, data: string): Promise<void>;
  remove(path: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
};

export type QueueBridgeVaultLike = {
  adapter: QueueBridgeAdapterLike;
  getName(): string;
  getFiles(): Array<{ path: string; stat?: { size: number; mtime: number } }>;
  getAbstractFileByPath(path: string): QueueBridgeAbstractFile | null;
  create(path: string, data: string): Promise<unknown>;
  createFolder(path: string): Promise<unknown>;
};

export type QueueBridgeAppLike = {
  vault: QueueBridgeVaultLike;
  commands: {
    commands: Record<string, unknown>;
    executeCommandById(id: string): boolean;
  };
  fileManager: {
    renameFile(file: QueueBridgeAbstractFile, path: string): Promise<void>;
    trashFile(file: QueueBridgeAbstractFile): Promise<void>;
  };
};

export type QueueBridgeStats = {
  dir: string;
  ticks: number;
  executed: number;
  failures: number;
  pending: number;
};

function commandString(value: unknown, max = 200_000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function requirePath(command: Record<string, unknown>, key = "path"): string {
  const value = commandString(command[key]).trim();
  if (!value) throw new Error(`${commandString(command.op) || "command"} requires a ${key}.`);
  return value;
}

function isFolderLike(file: QueueBridgeAbstractFile): boolean {
  return Array.isArray(file.children);
}

/**
 * Polls a vault-relative directory and executes whatever lands in the queue.
 *
 * The class owns no timers: the host drives it with its own registered
 * intervals, so Obsidian's plugin lifecycle tears the loop down for free.
 */
export class CancipQueueBridge {
  private busy = false;
  private ticks = 0;
  private executed = 0;
  private failures = 0;
  private readonly startedAt = Date.now();

  constructor(
    private readonly app: QueueBridgeAppLike,
    private readonly getSettings: () => QueueBridgeRuntimeSettings,
    private readonly handlers: QueueBridgeHandlers,
    private readonly pluginVersion: string
  ) {}

  /** Vault-relative bridge directory, normalised to have no trailing slash. */
  dir(): string {
    return this.getSettings().dir.replace(/\/+$/, "");
  }

  /** Path of one bridge file inside {@link dir}. */
  filePath(name: string): string {
    return `${this.dir()}/${name}`;
  }

  stats(): QueueBridgeStats {
    return { dir: this.dir(), ticks: this.ticks, executed: this.executed, failures: this.failures, pending: 0 };
  }

  /** Create the bridge directory when it is missing. */
  async ensureDir(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(this.dir())) return;
    try {
      await this.app.vault.createFolder(this.dir());
    } catch {
      // A concurrent create is not a failure: the directory exists either way.
    }
  }

  /**
   * Publish heartbeat.json so an outside caller can tell whether a live plugin
   * is consuming the queue, and how far behind it is.
   */
  async beat(): Promise<void> {
    if (!this.getSettings().enabled) return;
    try {
      await this.ensureDir();
      await this.app.vault.adapter.write(
        this.filePath(QUEUE_BRIDGE_HEARTBEAT_FILE),
        JSON.stringify({
          ts: Date.now(),
          iso: new Date().toISOString(),
          bridge: "Cancip Queue Bridge",
          protocol: QUEUE_BRIDGE_PROTOCOL_VERSION,
          v: this.pluginVersion,
          dir: this.dir(),
          ticks: this.ticks,
          done: this.executed,
          failed: this.failures,
          uptime: Math.round((Date.now() - this.startedAt) / 1000),
          files: this.app.vault.getFiles().length,
          vault: this.app.vault.getName(),
          ops: [...QUEUE_BRIDGE_OPS]
        })
      );
    } catch {
      // Heartbeats are advisory. A write failure must never break the poll loop.
    }
  }

  /**
   * Consume the queue once. Returns how many commands were handled.
   *
   * Ordering note: the queue file is cleared *before* execution, so a command
   * that throws halfway is never replayed on the next tick. Callers that need
   * at-least-once delivery must match on `id` and retry themselves.
   */
  async tick(): Promise<number> {
    if (!this.getSettings().enabled || this.busy) return 0;
    this.busy = true;
    this.ticks += 1;
    const adapter = this.app.vault.adapter;
    const queuePath = this.filePath(QUEUE_BRIDGE_QUEUE_FILE);
    const resultPath = this.filePath(QUEUE_BRIDGE_RESULT_FILE);
    try {
      if (!(await adapter.exists(queuePath))) return 0;
      const raw = await adapter.read(queuePath);
      if (!raw.trim()) return 0;
      await adapter.write(queuePath, "");
      const lines = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const deferred = lines.length > MAX_COMMANDS_PER_TICK ? lines.slice(MAX_COMMANDS_PER_TICK) : [];
      const batch = lines.slice(0, MAX_COMMANDS_PER_TICK);
      const results: string[] = [];
      for (let index = 0; index < batch.length; index += 1) {
        const result = await this.runParsed(batch[index]);
        if (result.ok === true) this.executed += 1;
        else this.failures += 1;
        results.push(JSON.stringify(result));
        if (index % YIELD_EVERY === YIELD_EVERY - 1) {
          // Yield so a large batch can never freeze the Obsidian UI thread.
          await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 0);
          });
        }
      }
      if (results.length) {
        await adapter.append(resultPath, `${results.join("\n")}\n`);
        await this.trimResults(resultPath);
      }
      if (deferred.length) await adapter.append(queuePath, `${deferred.join("\n")}\n`);
      return batch.length;
    } catch {
      return 0;
    } finally {
      this.busy = false;
    }
  }

  /** Keep result.jsonl bounded so it never grows into a sync liability. */
  private async trimResults(resultPath: string): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      const raw = await adapter.read(resultPath);
      if (raw.length <= RESULT_MAX_BYTES) return;
      const lines = raw.split("\n").filter(Boolean);
      await adapter.write(resultPath, `${lines.slice(-RESULT_KEEP_LINES).join("\n")}\n`);
    } catch {
      // Trimming is housekeeping; the next tick retries it.
    }
  }

  private async runParsed(line: string): Promise<Record<string, unknown>> {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { id: null, op: null, ts: Date.now(), ok: false, error: `bad json: ${line.slice(0, 120)}`, ms: 0 };
    }
    return await this.run(parsed as Record<string, unknown>);
  }

  /** Execute one command and wrap the outcome in the shared result envelope. */
  private async run(command: Record<string, unknown>): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const id = command.id === undefined || command.id === null ? null : command.id;
    const op = commandString(command.op).toLowerCase();
    try {
      const result = await this.execute(command, op);
      return { id, op, ts: startedAt, ok: true, result: result === undefined ? null : result, ms: Date.now() - startedAt };
    } catch (error) {
      return {
        id,
        op,
        ts: startedAt,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        ms: Date.now() - startedAt
      };
    }
  }

  private async execute(command: Record<string, unknown>, op: string): Promise<unknown> {
    const vault = this.app.vault;
    const adapter = vault.adapter;
    switch (op) {
      case "ping":
        return {
          pong: true,
          bridge: "Cancip Queue Bridge",
          protocol: QUEUE_BRIDGE_PROTOCOL_VERSION,
          v: this.pluginVersion,
          vault: vault.getName(),
          files: vault.getFiles().length,
          dir: this.dir(),
          ticks: this.ticks,
          done: this.executed
        };

      case "status":
        return { transport: "queue", ...this.stats(), ...this.handlers.status() };

      case "capabilities":
        return await this.handlers.capabilities();

      case "list": {
        const prefix = commandString(command.prefix);
        let files = vault.getFiles().map((file) => ({ p: file.path, s: file.stat?.size ?? 0, m: file.stat?.mtime ?? 0 }));
        if (prefix) files = files.filter((entry) => entry.p.startsWith(prefix));
        const out = commandString(command.out);
        if (out) {
          await adapter.write(out, JSON.stringify(files));
          return { count: files.length, out };
        }
        return { count: files.length, files };
      }

      case "stat": {
        const path = requirePath(command);
        const file = vault.getAbstractFileByPath(path);
        if (!file) return { exists: false, path };
        return {
          exists: true,
          path,
          folder: isFolderLike(file),
          size: file.stat?.size ?? null,
          mtime: file.stat?.mtime ?? null
        };
      }

      case "read": {
        const path = requirePath(command);
        const out = commandString(command.out);
        if (out) {
          if (!(await adapter.exists(path))) return { missing: path };
          const data = await adapter.read(path);
          await adapter.write(out, data);
          return { path, out, bytes: data.length };
        }
        // Without an `out` target this is Cancip's richer read: it understands
        // `query`, `startLine`, `endLine` and `maxChars`, and falls back to a
        // plain file read when only `path` was supplied.
        return await this.handlers.read({
          path,
          query: commandString(command.query),
          startLine: command.startLine,
          endLine: command.endLine,
          maxChars: command.maxChars
        });
      }

      case "write": {
        const path = requirePath(command);
        const data = typeof command.data === "string" ? command.data : "";
        if (await adapter.exists(path)) await adapter.write(path, data);
        else await vault.create(path, data);
        return { written: path, bytes: data.length };
      }

      case "mkdir": {
        const path = requirePath(command);
        if (!(await adapter.exists(path))) await vault.createFolder(path);
        return { dir: path };
      }

      case "move": {
        const from = requirePath(command, "from");
        const to = commandString(command.to).trim();
        if (!to) throw new Error("move requires a to.");
        const source = vault.getAbstractFileByPath(from);
        if (!source) throw new Error(`not found: ${from}`);
        await this.app.fileManager.renameFile(source, to);
        return { from, to };
      }

      case "delete": {
        const requested = Array.isArray(command.paths) ? command.paths : [];
        const paths: string[] = requested.filter((value): value is string => typeof value === "string");
        const single = commandString(command.path);
        if (single) paths.push(single);
        const hard = command.hard === true;
        const report = { total: paths.length, trashed: 0, hard: 0, missing: [] as string[], errors: [] as string[] };
        for (let index = 0; index < paths.length; index += 1) {
          const path = paths[index];
          try {
            const file = vault.getAbstractFileByPath(path);
            if (!file) {
              if (report.missing.length < MISSING_REPORT_LIMIT) report.missing.push(path);
              continue;
            }
            if (hard) {
              if (isFolderLike(file)) await adapter.rmdir(path, true);
              else await adapter.remove(path);
              report.hard += 1;
            } else {
              await this.app.fileManager.trashFile(file);
              report.trashed += 1;
            }
          } catch (error) {
            if (report.errors.length < ERROR_REPORT_LIMIT) {
              report.errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          if (index % YIELD_EVERY === YIELD_EVERY - 1) {
            await new Promise<void>((resolve) => {
              setTimeout(() => resolve(), 0);
            });
          }
        }
        return report;
      }

      case "cmds": {
        const filter = commandString(command.filter);
        const ids = Object.keys(this.app.commands.commands).sort();
        const matched = filter ? ids.filter((id) => id.includes(filter)) : ids;
        return { count: matched.length, ids: matched };
      }

      case "cmd":
      case "sync": {
        const fallback = op === "sync" ? "remotely-save:start-sync" : "";
        const commandId = commandString(command.command) || commandString(command.name) || fallback;
        if (!commandId) throw new Error(`${op} requires a command.`);
        return { command: commandId, executed: this.app.commands.executeCommandById(commandId) };
      }

      case "notice": {
        const text = commandString(command.text);
        this.handlers.notice(text);
        return { shown: true, text };
      }

      case "open": {
        const path = requirePath(command);
        return await this.handlers.open({
          path,
          query: commandString(command.query),
          targetKind: commandString(command.targetKind) || "file"
        });
      }

      case "eval": {
        const code = commandString(command.code);
        if (!code.trim()) throw new Error("eval requires code.");
        return await this.handlers.evalCode(code, command);
      }

      case "search":
        return await this.handlers.search({
          query: commandString(command.query),
          limit: command.limit,
          scope: commandString(command.scope),
          includeConfigs: command.includeConfigs === true,
          includeArchived: command.includeArchived === true
        });

      case "prompt": {
        const prompt = commandString(command.prompt) || commandString(command.text);
        if (!prompt.trim()) throw new Error("prompt requires a prompt.");
        return await this.handlers.prompt({ prompt });
      }

      case "action": {
        const batch = Array.isArray(command.actions) ? command.actions : command.action ? [command.action] : [];
        if (!batch.length) throw new Error("action requires action or actions.");
        return await this.handlers.action({ actions: batch });
      }

      case "agent.run":
      case "agentrun":
        return await this.handlers.agentRun({
          provider: commandString(command.provider) || "auto",
          model: commandString(command.model),
          system: commandString(command.system),
          prompt: commandString(command.prompt)
        });

      default:
        throw new Error(`unknown op: ${op}`);
    }
  }
}
