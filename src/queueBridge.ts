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

/**
 * The minis-bridge wire contract. Deliberately still 1: the queue file names,
 * op names, argument names and the result envelope are unchanged, so a caller
 * written against `arias007/minis-bridge` keeps working without a rewrite. New
 * capability is advertised through {@link QUEUE_BRIDGE_REPLY_VERSION} instead of
 * by breaking this number.
 */
export const QUEUE_BRIDGE_PROTOCOL_VERSION = 1;
/**
 * Version of the reply channel. 1 was the single append-only `result.jsonl`; 2
 * adds `result/<id>.json`, one file per identified result, so a caller reads
 * exactly its own answer instead of scanning a log that grows with every call
 * ever made. Additive on purpose: the legacy log is still written (bounded), so
 * a protocol-1 caller is unaffected and only has to be told the new field
 * exists. Reported as `heartbeat.replyProtocol`.
 */
export const QUEUE_BRIDGE_REPLY_VERSION = 2;
export const QUEUE_BRIDGE_QUEUE_FILE = "queue.jsonl";
/**
 * Legacy single-log result channel, kept because it *is* the minis-bridge wire
 * contract. It no longer carries the weight: an identified result is also
 * written to `result/<id>.json`, and this file is trimmed to a short rolling
 * tail so it cannot grow into the ~700 KB scan liability that made every lookup
 * O(n) in the length of the plugin's entire history.
 */
export const QUEUE_BRIDGE_RESULT_FILE = "result.jsonl";
/** One file per result, named by the command's `id`. */
export const QUEUE_BRIDGE_RESULT_DIR = "result";
/**
 * Queue file mid-swap. The queue is renamed to this before execution, so a
 * command appended while a batch is running lands in a fresh queue.jsonl
 * instead of being wiped by the clearing write, and a crash mid-batch leaves the
 * work here to be replayed instead of disappearing.
 */
export const QUEUE_BRIDGE_PROCESSING_FILE = "queue.processing.jsonl";
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
  "view",
  // Cancip semantic operations (shared with the HTTP bridge)
  "status",
  "capabilities",
  "search",
  "prompt",
  "action",
  "agent.run"
] as const;

/**
 * One authoritative description of what this bridge can actually do right now.
 *
 * There used to be three lists that disagreed: `heartbeat.ops` named every op
 * including the ones a policy refuses, `capabilities.routes` named only the
 * semantic surface, and `capabilities.actionTypes` named a third set. A caller
 * could only find out by trial and error. Everything now reads this catalogue:
 * each op states which group it belongs to, whether it needs Obsidian in the
 * foreground, whether it is currently enabled, and why not when it is disabled.
 */
export type QueueBridgeOpInfo = {
  op: string;
  /** "file" for minis-bridge compatible verbs, "semantic" for Cancip's own. */
  group: "file" | "semantic";
  /**
   * True when the op only does something visible: it opens a view, shows a
   * notice, or drives UI. Off-foreground these are not executed at all — they
   * stay in the queue and run when Obsidian comes back — because running them
   * against a hidden window either no-ops silently or acts on the wrong leaf.
   */
  requiresForeground: boolean;
  enabled: boolean;
  /** Present only when `enabled` is false. */
  reason?: string;
};

/** Ops that only do something when a window is actually visible. */
const FOREGROUND_ONLY_OPS = new Set(["open", "notice", "cmd", "sync"]);
/** Ops belonging to Cancip's own semantic surface rather than the minis-bridge set. */
const SEMANTIC_OPS = new Set(["status", "capabilities", "search", "prompt", "action", "agent.run"]);

/**
 * Whether a queued line names an op that needs a visible window. Used to decide
 * between running a command now and holding it until Obsidian comes back.
 */
function lineNeedsForeground(line: string): boolean {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown> | null;
    return FOREGROUND_ONLY_OPS.has(commandString(parsed?.op).toLowerCase());
  } catch {
    return false;
  }
}

/** Filesystem-safe file name for one identified result. */
function resultFileName(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return `${safe || "result"}.json`;
}

export function queueBridgeOpCatalog(options: { evalEnabled?: boolean; viewEnabled?: boolean } = {}): QueueBridgeOpInfo[] {
  const evalEnabled = options.evalEnabled !== false;
  const viewEnabled = options.viewEnabled !== false;
  return QUEUE_BRIDGE_OPS.map((op) => {
    const info: QueueBridgeOpInfo = {
      op,
      group: SEMANTIC_OPS.has(op) ? "semantic" : "file",
      requiresForeground: FOREGROUND_ONLY_OPS.has(op),
      enabled: true
    };
    if (op === "eval" && !evalEnabled) {
      info.enabled = false;
      info.reason = "The Obsidian JavaScript bridge is disabled by the current access policy or settings.";
    }
    if (op === "view" && !viewEnabled) {
      info.enabled = false;
      info.reason = "This host does not expose a live view snapshot; read the active file with op=read instead.";
    }
    return info;
  });
}

/**
 * The legacy tail only needs to carry anonymous results and a recent slice for
 * diagnostic reading. Identified results live in their own files now, so this
 * budget is deliberately far below the 4 MB it was once allowed to reach — that
 * ceiling is why the file sat at ~700 KB and every lookup still scanned it.
 */
const RESULT_MAX_BYTES = 256 * 1024;
const RESULT_KEEP_LINES = 100;
/** Result files kept under result/ before the oldest are removed. */
const RESULT_KEEP_FILES = 100;
const MAX_COMMANDS_PER_TICK = 800;
const MISSING_REPORT_LIMIT = 200;
const ERROR_REPORT_LIMIT = 100;
const YIELD_EVERY = 50;

/**
 * An operation failure that carries its own machine-readable cause, so a caller
 * can branch on the reason instead of matching an error string.
 */
export class QueueBridgeOpError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "QueueBridgeOpError";
  }
}

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
  /**
   * Structured snapshot of the live view. The action surface answers with a
   * rendered markdown report, which left callers extracting fields with regular
   * expressions — and an empty field next to another field is not reliably
   * delimited, which made the `selection` field unparseable in practice. This
   * returns the fields as fields.
   *
   * Optional: a host without a live view simply does not answer `op=view`, and
   * the op catalogue reports it as disabled rather than the caller finding out
   * by receiving a success envelope with nothing in it.
   */
  view?(): Promise<QueueBridgeViewSnapshot>;
  /**
   * Whether Obsidian currently has a visible window. Ops marked
   * `requiresForeground` are not executed while this is false: they stay in the
   * queue and run when the app comes back, instead of silently acting on a
   * hidden window. Everything else runs either way, so a caller that only needs
   * file or vault work is never blocked by the app sitting in the background.
   *
   * Optional and defaults to *foreground*, so a host that has not been taught to
   * report visibility behaves exactly as it did before this existed. Getting
   * this wrong the other way would hold every command forever on such a host.
   */
  isForeground?(): boolean;
  /**
   * Whether the `eval` op is currently permitted. Reported in the op catalogue
   * so a caller can see that `eval` is refused instead of discovering it by being
   * rejected — or worse, by reading a success envelope with no effect in it.
   */
  evalEnabled?(): boolean;
};

/** Fields a structured view query answers with. */
export type QueueBridgeViewSnapshot = {
  activeFile: string | null;
  viewType: string;
  /** The visible text of the focused view, truncated by the host. */
  displayText: string;
  /** Current editor selection, empty when the view has none. */
  selection: string;
  /** Human-readable mode/label of the active leaf, when the host knows one. */
  mode: string;
  area: string;
  tabs: Array<{ title: string; viewType: string; area: string; path: string | null; pinned: boolean; active: boolean }>;
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
  /**
   * Used to swap the queue aside before executing it. Without this the clearing
   * write raced the caller's append: a command appended between the read and the
   * clear was wiped without ever running.
   */
  rename?(oldPath: string, newPath: string): Promise<void>;
  /** Used to enumerate result/ for retention. */
  list?(path: string): Promise<{ files: string[]; folders: string[] }>;
  stat?(path: string): Promise<{ size: number; mtime: number; type: string } | null>;
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
  if (!value) {
    throw new QueueBridgeOpError("MISSING_ARGUMENT", `${commandString(command.op) || "command"} requires a ${key}.`);
  }
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
  private recoveredResidue = false;
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
          // How replies are delivered. 2 means "identified results also land in
          // result/<id>.json, so read that file instead of scanning result.jsonl".
          // A separate field so the minis-bridge wire number above stays 1.
          replyProtocol: QUEUE_BRIDGE_REPLY_VERSION,
          resultDir: QUEUE_BRIDGE_RESULT_DIR,
          v: this.pluginVersion,
          dir: this.dir(),
          ticks: this.ticks,
          done: this.executed,
          failed: this.failures,
          uptime: Math.round((Date.now() - this.startedAt) / 1000),
          files: this.app.vault.getFiles().length,
          vault: this.app.vault.getName(),
          // One authoritative catalogue, shared with capabilities. It states per
          // op whether it can run right now, so a caller never has to learn the
          // truth by trying and failing.
          foreground: this.handlers.isForeground?.() ?? true,
          ops: [...QUEUE_BRIDGE_OPS],
          opCatalog: queueBridgeOpCatalog({
            evalEnabled: this.handlers.evalEnabled?.() !== false,
            viewEnabled: typeof this.handlers.view === "function"
          })
        })
      );
    } catch {
      // Heartbeats are advisory. A write failure must never break the poll loop.
    }
  }

  /**
   * Consume the queue once. Returns how many commands were executed.
   *
   * Delivery note: the queue is *swapped aside* to {@link QUEUE_BRIDGE_PROCESSING_FILE}
   * before a batch runs, never cleared in place. The old clear-first write raced
   * the caller: a command appended between the read and the clear was wiped
   * without ever running and produced no result, so the caller saw a timeout for
   * work that had silently vanished. With the swap, such a command lands in a
   * fresh queue.jsonl and runs on the next tick. If the plugin dies mid-batch,
   * the batch is still in the processing file and is replayed once on the next
   * start.
   *
   * Off-foreground behaviour: commands whose op needs a visible window are put
   * back into the queue instead of being run against a hidden one, so they
   * execute when Obsidian comes back rather than silently doing nothing. Every
   * other command is executed immediately, which is what lets an outside caller
   * keep working while the app sits in the background.
   */
  async tick(): Promise<number> {
    if (!this.getSettings().enabled || this.busy) return 0;
    this.busy = true;
    this.ticks += 1;
    const adapter = this.app.vault.adapter;
    const queuePath = this.filePath(QUEUE_BRIDGE_QUEUE_FILE);
    const processingPath = this.filePath(QUEUE_BRIDGE_PROCESSING_FILE);
    const resultPath = this.filePath(QUEUE_BRIDGE_RESULT_FILE);
    try {
      if (!this.recoveredResidue) {
        this.recoveredResidue = true;
        await this.replayResidue(queuePath, processingPath);
      }
      if (!(await adapter.exists(queuePath))) return 0;
      const raw = await adapter.read(queuePath);
      if (!raw.trim()) return 0;
      await this.swapQueueAside(queuePath, processingPath);
      const lines = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const overflow = lines.length > MAX_COMMANDS_PER_TICK ? lines.slice(MAX_COMMANDS_PER_TICK) : [];
      const batch = lines.slice(0, MAX_COMMANDS_PER_TICK);
      // Absent means "no visibility reporting on this host" and is treated as
      // foreground, which is the pre-existing behaviour: nothing is ever held.
      const foreground = this.handlers.isForeground?.() ?? true;
      const identified: Array<{ id: string; envelope: Record<string, unknown> }> = [];
      // Envelopes in arrival order, for the legacy log. Built separately from
      // `identified` so a batch mixing identified and malformed lines keeps its
      // sequence: the legacy channel is read positionally by older callers.
      const logLines: string[] = [];
      const heldForForeground: string[] = [];
      let executed = 0;
      for (let index = 0; index < batch.length; index += 1) {
        if (!foreground && lineNeedsForeground(batch[index])) {
          heldForForeground.push(batch[index]);
          continue;
        }
        const result = await this.runParsed(batch[index]);
        if (result.ok === true) this.executed += 1;
        else this.failures += 1;
        executed += 1;
        const serialised = JSON.stringify(result);
        logLines.push(serialised);
        const id = typeof result.id === "string" && result.id ? result.id : "";
        // Dual delivery: the indexed file is the authority for a caller that
        // knows its id, the log keeps the minis-bridge contract intact.
        if (id) identified.push({ id, envelope: result });
        if (index % YIELD_EVERY === YIELD_EVERY - 1) {
          // Yield so a large batch can never freeze the Obsidian UI thread.
          await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 0);
          });
        }
      }
      for (const entry of identified) await this.writeResultFile(entry.id, entry.envelope);
      if (logLines.length) {
        await adapter.append(resultPath, `${logLines.join("\n")}\n`);
        await this.trimResults(resultPath);
      }
      if (identified.length) await this.trimResultFiles();
      // Held commands go back to the queue ahead of the overflow, so the oldest
      // work keeps its place instead of being starved by new arrivals.
      const requeued = [...heldForForeground, ...overflow];
      if (requeued.length) await adapter.append(queuePath, `${requeued.join("\n")}\n`);
      await adapter.remove(processingPath);
      return executed;
    } catch {
      return 0;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Replay a batch left behind by a crash, once per plugin start. The residue is
   * prepended so the older commands keep their original order ahead of anything
   * that arrived since.
   */
  private async replayResidue(queuePath: string, processingPath: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    try {
      if (!(await adapter.exists(processingPath))) return;
      const residue = await adapter.read(processingPath);
      if (residue.trim()) {
        const pending = (await adapter.exists(queuePath)) ? await adapter.read(queuePath) : "";
        await adapter.write(queuePath, `${residue.trimEnd()}\n${pending.replace(/^\s+/, "")}`);
      }
      await adapter.remove(processingPath);
    } catch {
      // Recovery is best effort; the next start tries again.
    }
  }

  /**
   * Move queue.jsonl aside so the executing batch and newly appended commands
   * cannot overwrite each other. Falls back to copy-then-clear on an adapter
   * without rename, which still survives a crash (the copy exists) even though it
   * cannot be made fully race-free.
   */
  private async swapQueueAside(queuePath: string, processingPath: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (adapter.rename) {
      try {
        await adapter.rename(queuePath, processingPath);
        return;
      } catch {
        // Fall through to the portable path below.
      }
    }
    const raw = await adapter.read(queuePath);
    await adapter.write(processingPath, raw);
    await adapter.write(queuePath, "");
  }

  /**
   * One file per identified result, so a caller reads exactly its own answer
   * instead of scanning a log that grows with every call ever made.
   */
  private async writeResultFile(id: string, envelope: Record<string, unknown>): Promise<void> {
    const adapter = this.app.vault.adapter;
    const dir = this.filePath(QUEUE_BRIDGE_RESULT_DIR);
    try {
      if (!(await adapter.exists(dir))) {
        try {
          await this.app.vault.createFolder(dir);
        } catch {
          // A concurrent create is not a failure.
        }
      }
      await adapter.write(`${dir}/${resultFileName(id)}`, JSON.stringify(envelope));
    } catch {
      // A result that cannot be filed also goes to the log, so the caller is
      // never left waiting on an answer that was produced but not stored.
      try {
        await adapter.append(this.filePath(QUEUE_BRIDGE_RESULT_FILE), `${JSON.stringify(envelope)}\n`);
      } catch {
        // Nothing further to do; the caller will time out and retry.
      }
    }
  }

  /** Keep only the newest {@link RESULT_KEEP_FILES} result files. */
  private async trimResultFiles(): Promise<void> {
    const adapter = this.app.vault.adapter;
    const dir = this.filePath(QUEUE_BRIDGE_RESULT_DIR);
    if (!adapter.list) return;
    try {
      const listed = await adapter.list(dir);
      const names = (listed?.files ?? []).filter((path) => path.endsWith(".json"));
      if (names.length <= RESULT_KEEP_FILES) return;
      const stamped: Array<{ path: string; mtime: number }> = [];
      for (const path of names) {
        const stat = adapter.stat ? await adapter.stat(path) : null;
        stamped.push({ path, mtime: stat?.mtime ?? 0 });
      }
      stamped.sort((left, right) => right.mtime - left.mtime);
      for (const entry of stamped.slice(RESULT_KEEP_FILES)) {
        try {
          await adapter.remove(entry.path);
        } catch {
          // Retention is housekeeping; the next tick retries.
        }
      }
    } catch {
      // Same: retention must never break the poll loop.
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
        // The machine-readable cause rides next to the human message. Without it
        // a caller could not tell "the command does not exist" from "the plugin
        // refused" without matching on English text.
        code: error instanceof QueueBridgeOpError ? error.code : "OP_FAILED",
        error: error instanceof Error ? error.message : String(error),
        ms: Date.now() - startedAt
      };
    }
  }

  private async execute(command: Record<string, unknown>, op: string): Promise<unknown> {
    return await executeVaultOp(command, op, {
      app: this.app,
      handlers: this.handlers,
      pluginVersion: this.pluginVersion,
      dir: () => this.dir(),
      ticks: () => this.ticks,
      executed: () => this.executed,
      stats: () => this.stats()
    });
  }
}

/**
 * Injection surface for the shared vault-operation executor.
 *
 * The HTTP Agent Bridge and the file-queue bridge both call executeVaultOp,
 * so an outside caller gets the same operation surface on either leg: the
 * queue keeps working on mobile, and the HTTP leg keeps working while
 * Obsidian sits in the background (its timers are throttled, HTTP is not).
 */
export type VaultOpsContext = {
  app: QueueBridgeAppLike;
  handlers: QueueBridgeHandlers;
  pluginVersion: string;
  dir(): string;
  ticks(): number;
  executed(): number;
  stats(): Record<string, unknown>;
};

export async function executeVaultOp(rawCommand: Record<string, unknown>, op: string, ctx: VaultOpsContext): Promise<unknown> {
  // The generic HTTP leg addresses operations as `{op, ...payload}`, so the
  // verb rides along inside the body. It is routing metadata, never an
  // argument: drop it here so handlers (and the actions they build) only ever
  // see real inputs. It used to leak into stored actions as `{"op":"eval",…}`.
  const command: Record<string, unknown> = { ...rawCommand };
  delete command.op;
  const vault = ctx.app.vault;
  const adapter = vault.adapter;
  switch (op) {
    case "ping":
      return {
        pong: true,
        bridge: "Cancip Queue Bridge",
        protocol: QUEUE_BRIDGE_PROTOCOL_VERSION,
        v: ctx.pluginVersion,
        vault: vault.getName(),
        files: vault.getFiles().length,
        dir: ctx.dir(),
        ticks: ctx.ticks(),
        done: ctx.executed()
      };

    case "status":
      return { transport: "queue", ...ctx.stats(), ...ctx.handlers.status() };

    case "capabilities":
      return await ctx.handlers.capabilities();

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
      return await ctx.handlers.read({
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
      else {
        // A write that targets a missing folder creates it instead of failing
        // with a confusing ENOENT — mkdir-then-write is what callers expect.
        const parent = path.split("/").slice(0, -1).join("/");
        if (parent && !(await adapter.exists(parent))) await vault.createFolder(parent);
        await vault.create(path, data);
      }
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
      if (!to) throw new QueueBridgeOpError("MISSING_ARGUMENT", "move requires a to.");
      const source = vault.getAbstractFileByPath(from);
      if (!source) throw new QueueBridgeOpError("NOT_FOUND", `not found: ${from}`);
      await ctx.app.fileManager.renameFile(source, to);
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
            await ctx.app.fileManager.trashFile(file);
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
      const ids = Object.keys(ctx.app.commands.commands).sort();
      const matched = filter ? ids.filter((id) => id.includes(filter)) : ids;
      return { count: matched.length, ids: matched };
    }

    case "cmd":
    case "sync": {
      const fallback = op === "sync" ? "remotely-save:start-sync" : "";
      const commandId = commandString(command.command) || commandString(command.name) || fallback;
      if (!commandId) throw new QueueBridgeOpError("MISSING_ARGUMENT", `${op} requires a command.`);
      const executed = ctx.app.commands.executeCommandById(commandId);
      if (!executed) {
        // `executeCommandById` answers false for an id nobody registered. This
        // used to be returned inside a success envelope as `{executed:false}`, so
        // a typo, a missing plugin and a real success were indistinguishable from
        // the outside — the single most misleading answer this bridge gave.
        throw new QueueBridgeOpError(
          "UNKNOWN_COMMAND",
          `${op}: no Obsidian command with id "${commandId}" is registered in this vault. ` +
            "Run op=cmds (cancip cmds) to list the command ids that exist here."
        );
      }
      return { command: commandId, executed: true };
    }

    case "notice": {
      const text = commandString(command.text);
      ctx.handlers.notice(text);
      return { shown: true, text };
    }

    case "open": {
      const path = requirePath(command);
      return await ctx.handlers.open({
        path,
        query: commandString(command.query),
        targetKind: commandString(command.targetKind) || "file"
      });
    }

    case "view":
    case "currentview":
      // Structured live-view answer. Asking for the same thing through `action`
      // returned a rendered markdown report with the fields buried inside
      // `<!-- cancip-process-message -->` and `<details>` blocks, which callers
      // could only read back with regular expressions.
      if (typeof ctx.handlers.view !== "function") {
        throw new QueueBridgeOpError(
          "UNSUPPORTED_OP",
          "view: this host does not expose a live view snapshot. Ask op=view on a desktop bridge, or read the active file with op=read."
        );
      }
      return await ctx.handlers.view();

    case "eval": {
      const code = commandString(command.code);
      if (!code.trim()) throw new QueueBridgeOpError("MISSING_ARGUMENT", "eval requires code.");
      return await ctx.handlers.evalCode(code, command);
    }

    case "search":
      return await ctx.handlers.search({
        query: commandString(command.query),
        limit: command.limit,
        scope: commandString(command.scope),
        includeConfigs: command.includeConfigs === true,
        includeArchived: command.includeArchived === true
      });

    case "prompt": {
      const prompt = commandString(command.prompt) || commandString(command.text);
      if (!prompt.trim()) throw new QueueBridgeOpError("MISSING_ARGUMENT", "prompt requires a prompt.");
      return await ctx.handlers.prompt({ prompt });
    }

    case "action": {
      const batch = Array.isArray(command.actions) ? command.actions : command.action ? [command.action] : [];
      if (!batch.length) throw new QueueBridgeOpError("MISSING_ARGUMENT", "action requires action or actions.");
      return await ctx.handlers.action({ actions: batch });
    }

    case "agent.run":
    case "agentrun":
      return await ctx.handlers.agentRun({
        provider: commandString(command.provider) || "auto",
        model: commandString(command.model),
        system: commandString(command.system),
        prompt: commandString(command.prompt)
      });

    default:
      throw new QueueBridgeOpError(
        "UNKNOWN_OP",
        `unknown op: ${op}. Run op=capabilities or read heartbeat.json's opCatalog for the ops this bridge accepts.`
      );
  }

}
