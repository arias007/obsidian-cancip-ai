/*
 * Cancip office — extracted from src/main.ts by scripts/extract-main-modules.mjs.
 * Declarations here were proven to reference nothing left behind in main.ts, so this
 * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.
 */
import { strFromU8, strToU8, zipSync } from "fflate";
import { App, type DataAdapter, normalizePath, TFile } from "obsidian";
import { childElementsByLocalName, decodeXmlEntities, descendantsByLocalName, escapeHtml, escapeHtmlAttribute, escapeMarkdownText, extractCompatibleStreamDelta, extractDocxText, extractPdfText, extractPptxText, extractResponsesStreamDelta, extractXlsxText, extractXmlTextRuns, extractZipEntryText, extractZipText, findZipEntry, firstDescendantByLocalName, naturalNameNumber, normalizeExtractedText, officeAttribute, parseOfficeXml, readZipEntries, resolveZipTarget, safeJsonishDisplay } from "./model-api";
import { sha256ArrayBuffer, sha256Text, stableTextHash, uniqueStrings } from "./search";
import { CancipAction, ConfigBackupEntry, ConfigBackupIndex, DocumentArchiveFormat, DocumentDrawingAnchor, DocumentDrawingPoint, DocumentFormatKind, DocumentPreviewSourceLocator, DocumentTextEncoding, DocumentWorkbenchMode, ModelCallAudit, OcrIndexEntry, OcrLayoutBlock, OfficeContextualTextAnchor, ParsedAttachmentResult, SessionHistoryEntry, ZipEntry, officePreviewLocatorKey, safeVaultFileName } from "./types-1";
import { normalizeActionPath } from "./ui";
import { canonicalJsonValue, hasCjkText, isPdfPath, isRecord, promptNeedsCurrentFileContext, redactSensitiveText, sleep, stableCacheKey, vaultPathParent } from "./vault-2";

export async function copyApprovedReviewPath(adapter: DataAdapter, sourcePath: string, newPath: string): Promise<void> {
  const stat = await adapter.stat(sourcePath);
  if (stat?.type === "folder") {
    await ensureFolder(adapter, newPath);
    const entries = await adapter.list(sourcePath);
    for (const folder of entries.folders) {
      const childName = folder.slice(sourcePath.length).replace(/^\/+/, "");
      if (!childName) continue;
      await copyApprovedReviewPath(adapter, folder, `${newPath}/${childName}`);
    }
    for (const file of entries.files) {
      const childName = file.slice(sourcePath.length).replace(/^\/+/, "");
      if (!childName) continue;
      await ensureParentFolder(adapter, `${newPath}/${childName}`);
      await adapter.copy(file, `${newPath}/${childName}`);
    }
    return;
  }
  await adapter.copy(sourcePath, newPath);
}

export async function ensureParentFolder(adapter: DataAdapter, path: string): Promise<void> {
  const parent = path.split("/").slice(0, -1).join("/");
  if (parent) await ensureFolder(adapter, parent);
}

export type CancipStorageMigrationStats = {
  sourceFiles: number;
  sourceFolders: number;
  copiedFiles: number;
  preservedTargetFiles: number;
  targetConflicts: number;
};

export function sessionHistoryContentSummary(entry: SessionHistoryEntry): string {
  return trimContext((entry.summary || entry.title || "").replace(/\s+/g, " ").trim(), 96);
}

export async function cancipStorageFileHash(adapter: DataAdapter, path: string): Promise<string> {
  return await sha256ArrayBuffer(await adapter.readBinary(path));
}

export async function ensureFolder(adapter: DataAdapter, folderPath: string): Promise<void> {
  const folder = normalizeActionPath(folderPath);
  const parts = folder.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const stat = await adapter.stat(current);
    if (stat?.type === "file") throw new Error(`Path is a file: ${current}`);
    if (!stat) await adapter.mkdir(current);
  }
}

export async function safeConfigBackupPathKey(path: string): Promise<string> {
  const normalized = normalizePath(path);
  const slug = normalized.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "config";
  const hash = (await sha256Text(normalized)).slice(0, 12);
  return `${slug}-${hash}`;
}

export function configBackupEntry(index: ConfigBackupIndex, path: string): ConfigBackupEntry {
  const normalized = normalizePath(path);
  const existing = index.entries[normalized];
  if (existing) {
    existing.backups = Array.isArray(existing.backups) ? existing.backups : [];
    return existing;
  }
  const entry: ConfigBackupEntry = { backups: [] };
  index.entries[normalized] = entry;
  return entry;
}

export async function readTextIfExists(adapter: DataAdapter, path: string, fallback = ""): Promise<string> {
  return await adapter.exists(path) ? await adapter.read(path) : fallback;
}

export function normalizeStringChunks(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const chunks = raw.filter((item): item is string => typeof item === "string");
  return chunks.length === raw.length && chunks.length ? chunks : undefined;
}

export function textWriteActionContent(action: Extract<CancipAction, { type: "write" | "append" }>): string {
  if (Array.isArray(action.chunks)) return action.chunks.join("");
  if (typeof action.content === "string") return action.content;
  throw new Error(`${action.type} action requires content or chunks`);
}

export function splitTextChunks(content: string, chunkSize: number): string[] {
  if (!content.length) return [""];
  if (content.length <= chunkSize) return [content];
  const chunks: string[] = [];
  for (let index = 0; index < content.length; index += chunkSize) {
    chunks.push(content.slice(index, index + chunkSize));
  }
  return chunks;
}

export function normalizeTextForVerification(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function textWriteVerificationMatches(actual: string, expected: string): boolean {
  return actual === expected || normalizeTextForVerification(actual) === normalizeTextForVerification(expected);
}

export async function readTextWithRetry(adapter: DataAdapter, path: string, attempts = 4): Promise<string> {
  let lastError: unknown = null;
  for (let index = 0; index < Math.max(1, attempts); index += 1) {
    if (index > 0) await sleep([80, 180, 360, 720][Math.min(index - 1, 3)] ?? 720);
    try {
      return await adapter.read(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? `read failed: ${path}`));
}

export async function verifyTextReadback(adapter: DataAdapter, path: string, expected: string): Promise<{ matched: boolean; actual: string }> {
  let actual = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    actual = await readTextWithRetry(adapter, path, 2);
    if (textWriteVerificationMatches(actual, expected)) {
      return { matched: true, actual };
    }
    await sleep([80, 180, 360][Math.min(attempt, 2)] ?? 360);
  }
  return { matched: textWriteVerificationMatches(actual, expected), actual };
}

export async function textReadbackFailureMessage(mode: "write" | "append" | "patch", path: string, expected: string, actual: string): Promise<string> {
  const normalizedExpected = normalizeTextForVerification(expected);
  const normalizedActual = normalizeTextForVerification(actual);
  const [expectedHash, actualHash] = await Promise.all([sha256Text(normalizedExpected), sha256Text(normalizedActual)]);
  return [
    `${mode} verification failed: ${path}`,
    `expectedChars=${expected.length}, actualChars=${actual.length}`,
    `expectedHash=${expectedHash.slice(0, 12)}, actualHash=${actualHash.slice(0, 12)}`
  ].join("\n");
}

export function makeExcerpt(content: string, tokens: string[]): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const firstHit = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (firstHit ?? 0) - 80);
  return normalized.slice(start, start + 320);
}

export function compactComposerStatusText(content: string): string {
  const normalized = redactSensitiveText(content)
    .replace(/^(?:status|progress|状态|进度|提示)\s*[:：]\s*/i, "")
    .replace(/(?:正在处理工具输出|根据工具结果继续|核对结果并推进)[…\.。\s]*/gi, "")
    .replace(/(?:^|\s)(?:```|~~~)[\s\S]*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= 84) return normalized;
  return `${normalized.slice(0, 81).trimEnd()}...`;
}

export function compactModelStreamRawText(content: string): string {
  const deltas: string[] = [];
  let sseEvents = 0;
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    sseEvents += 1;
    try {
      const parsed = JSON.parse(payload) as unknown;
      const delta = extractCompatibleStreamDelta(parsed) || extractResponsesStreamDelta(parsed);
      if (delta) deltas.push(delta);
    } catch {
      // Preserve non-JSON provider events in the fallback below.
    }
  }
  if (sseEvents > 0 && deltas.length) return deltas.join("");

  const output: string[] = [];
  const seenEmptyEvents = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (output.length && output[output.length - 1] !== "") output.push("");
      continue;
    }
    if (/^(?:OPENROUTER\s+PROCESSING|: ?keep-?alive)$/i.test(trimmed)) {
      const key = trimmed.toLocaleLowerCase();
      if (seenEmptyEvents.has(key)) continue;
      seenEmptyEvents.add(key);
      output.push(line);
      continue;
    }
    if (trimmed.startsWith("data:")) {
      const payload = trimmed.slice(5).trim();
      if (payload && payload !== "[DONE]") {
        try {
          const parsed = JSON.parse(payload) as unknown;
          const hasDelta = Boolean(extractCompatibleStreamDelta(parsed) || extractResponsesStreamDelta(parsed));
          if (!hasDelta && isRecord(parsed)) {
            const key = stableTextHash(safeJsonishDisplay(parsed));
            if (seenEmptyEvents.has(key)) continue;
            seenEmptyEvents.add(key);
          }
        } catch {
          // Keep non-JSON provider events exactly as received.
        }
      }
    }
    output.push(line);
  }
  while (output[output.length - 1] === "") output.pop();
  return output.join("\n");
}

export function modelReceivedDisplayText(audit: ModelCallAudit): string {
  const source = audit.responseDisplayText ?? audit.responseText ?? "";
  if (/^\s*(?:data|event)\s*:/im.test(source) && audit.extractedText?.trim()) {
    return audit.extractedText.trim();
  }
  return compactModelStreamRawText(source);
}

export function middleEllipsisByChars(value: string, maxChars = 18): string {
  const chars = Array.from(value);
  if (chars.length <= maxChars) return value;
  const visible = Math.max(2, maxChars - 1);
  const left = Math.ceil(visible / 2);
  const right = Math.max(1, visible - left);
  return `${chars.slice(0, left).join("")}…${chars.slice(-right).join("")}`;
}

/**
 * Adds a single delegated pressed-state interaction to a Cancip surface.
 * Keeping this on the surface (instead of each button) gives touch users an
 * immediate visual acknowledgement without adding hundreds of listeners or
 * doing any layout work during a click.
 */
export function installButtonInteractionFeedback(surface: HTMLElement): void {
  const pressed = new Set<HTMLButtonElement>();
  const resolveButton = (target: EventTarget | null): HTMLButtonElement | null => {
    if (!(target instanceof HTMLElement)) return null;
    const button = target.closest("button");
    if (!(button instanceof HTMLButtonElement) || button.disabled || button.getAttribute("aria-disabled") === "true") return null;
    return button;
  };
  const clearButton = (button: HTMLButtonElement | null): void => {
    if (!button) return;
    pressed.delete(button);
    button.removeClass("is-pressed");
  };
  const clearAll = (): void => {
    for (const button of pressed) button.removeClass("is-pressed");
    pressed.clear();
  };

  surface.addEventListener("pointerdown", (event) => {
    const button = resolveButton(event.target);
    if (!button) return;
    pressed.add(button);
    button.addClass("is-pressed");
    // A lost pointerup (for example when the native mobile surface takes
    // focus) must not leave a button visually stuck.
    window.setTimeout(() => clearButton(button), 220);
  });
  surface.addEventListener("pointerup", (event) => clearButton(resolveButton(event.target)));
  surface.addEventListener("pointercancel", (event) => clearButton(resolveButton(event.target)));
  surface.addEventListener("pointerleave", clearAll);
}

export function trimContext(content: string, maxLength: number): string {
  return trimContextWithRecovery(content, maxLength, "");
}

export function trimPromptPayload(content: string, maxLength: number): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const suffix = "\n...[truncated]";
  return `${trimmed.slice(0, Math.max(0, maxLength - suffix.length)).trimEnd()}${suffix}`;
}

export function packPromptContext(parts: string[], maxLength: number, prompt = ""): string {
  const separator = "\n\n---\n\n";
  const unique = new Map<string, { text: string; priority: number; order: number }>();
  for (const [order, raw] of parts.entries()) {
    const text = raw.trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, " ").toLowerCase();
    if (unique.has(key)) continue;
    unique.set(key, { text, priority: promptContextSectionPriority(text, prompt), order });
  }
  const sections = [...unique.values()].sort((a, b) => b.priority - a.priority || a.order - b.order);
  if (!sections.length) return "";
  const separatorChars = separator.length * Math.max(0, sections.length - 1);
  const available = Math.max(0, maxLength - separatorChars);
  const base = Math.min(220, Math.max(40, Math.floor(available / sections.length)));
  const budgets = sections.map((section) => Math.min(section.text.length, base));
  let remaining = Math.max(0, available - budgets.reduce((sum, value) => sum + value, 0));
  for (const [index, section] of sections.entries()) {
    if (remaining <= 0) break;
    const preferred = section.priority >= 95 ? 1800 : section.priority >= 80 ? 1100 : section.priority >= 65 ? 760 : 520;
    const extra = Math.min(remaining, Math.max(0, Math.min(section.text.length, preferred) - budgets[index]));
    budgets[index] += extra;
    remaining -= extra;
  }
  const packed = sections.map((section, index) => trimContext(section.text, budgets[index])).join(separator);
  return trimPromptPayload(packed, maxLength);
}

export function promptContextSectionPriority(section: string, prompt = ""): number {
  const heading = section.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  let priority = 65;
  if (/^##\s+@/.test(heading)) priority = 110;
  else if (/active skills?|已启用\s*skill|启用.*skill|激活.*skill|当前.*skill|经验.*skill/.test(heading)) priority = 105;
  else if (/current file|当前文件|光标|选择内容|selection|cursor/.test(heading)) priority = 100;
  else if (/task experience|任务经验|执行经验|经验/.test(heading)) priority = 90;
  else if (/plugin|obsidian command|插件|命令|detailed.*rules|详细.*规则/.test(heading)) priority = 80;
  else if (/project|codex memory|项目|偏好/.test(heading)) priority = 70;
  else if (/memory router|core memory|记忆.*索引|核心记忆/.test(heading)) priority = 60;

  const query = prompt.toLocaleLowerCase();
  const memoryTask = /(?:我的|关于我|偏好|习惯|记忆|规则|以前|之前|remember|memory|preference|profile|habit)/i.test(query);
  const pluginTask = /(?:obsidian|插件|命令|plugin|command|api|notedraw|pdftion|spaced\s*repetition)/i.test(query);
  const experienceTask = /(?:skill|经验|流程|步骤|成功路线|失败原因|workflow|recipe|experience)/i.test(query);
  const currentFileTask = promptNeedsCurrentFileContext(prompt);
  if (memoryTask && /memory router|core memory|记忆.*索引|核心记忆|project|codex memory|项目|偏好/.test(heading)) priority += 65;
  if (memoryTask && /task experience|任务经验|执行经验/.test(heading) && !experienceTask) priority -= 35;
  if (pluginTask && /plugin|obsidian command|插件|命令|detailed.*rules|详细.*规则/.test(heading)) priority += 45;
  if (experienceTask && /active skills?|skill|task experience|任务经验|执行经验|经验/.test(heading)) priority += 45;
  if (currentFileTask && /current file|当前文件|光标|选择内容|selection|cursor/.test(heading)) priority += 45;
  if (/全局硬搜索结果|universal hard-search results/.test(heading) && /(?:搜索|查找|找出|search|find)/i.test(query)) priority += 35;
  return priority;
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, base));
}

export function normalizeDocumentDrawingAnchor(value: unknown): DocumentDrawingAnchor | undefined {
  if (!isRecord(value) || value.basis !== "note-content-v1") return undefined;
  const line = Number(value.line);
  const lineConfidence = Number(value.lineConfidence);
  return {
    v: 1,
    basis: "note-content-v1",
    x: clampNumber(value.x, 0, -1, 2),
    y: clampNumber(value.y, 0, 0, 1),
    path: typeof value.path === "string" ? normalizePath(value.path) : "",
    line: Number.isFinite(line) && line >= 0 ? line : null,
    lineConfidence: Number.isFinite(lineConfidence) ? clampNumber(lineConfidence, 0, 0, 1) : null
  };
}

export function normalizeAnnotationPoints(value: unknown): DocumentDrawingPoint[] {
  const now = Date.now();
  const raw = Array.isArray(value) ? value : [];
  const points = raw
    .filter((point): point is Record<string, unknown> => isRecord(point))
    .map((point, index) => {
      const anchor = normalizeDocumentDrawingAnchor(point.anchor);
      return {
        x: clampNumber(point.x, index === 0 ? 0.15 : 0.85, 0, 1),
        y: clampNumber(point.y, 0.35, 0, 1),
        t: clampNumber(point.t, now + index * 16, 0, Number.MAX_SAFE_INTEGER),
        ...(anchor ? { anchor } : {})
      };
    });
  if (points.length >= 1) {
    if (points.length === 1) {
      const x = Math.min(1, points[0].x + 0.01);
      points.push({
        x,
        y: points[0].y,
        t: points[0].t + 16,
        ...(points[0].anchor ? { anchor: { ...points[0].anchor, x } } : {})
      });
    }
    return points;
  }
  return [
    { x: 0.15, y: 0.35, t: now },
    { x: 0.85, y: 0.35, t: now + 16 }
  ];
}

export function trimContextWithRecovery(content: string, maxLength: number, recoveryHint = ""): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const head = trimmed.slice(0, maxLength);
  const suffix = recoveryHint ? `\n${recoveryHint}` : "";
  return `${head}\n\n...[truncated: ${trimmed.length - maxLength} chars omitted]${suffix}`;
}

export function readRecoveryHint(path: string, nextLine: number, totalLines: number, maxChars: number): string {
  if (!path || nextLine > totalLines) return "";
  const payload = { type: "read", path: normalizePath(path), startLine: nextLine, maxChars: Math.min(12000, Math.max(4000, maxChars)) };
  return `cancip-recovery-read: ${JSON.stringify(payload)}`;
}

export function lineRangeFromStart(content: string, maxChars: number): { startLine: number; endLine: number; text: string } {
  const lines = content.split(/\r?\n/);
  let used = 0;
  let endLine = 0;
  const kept: string[] = [];
  const budget = Math.max(200, maxChars - 220);
  for (const line of lines) {
    const next = used + line.length + 1;
    if (kept.length && next > budget) break;
    kept.push(`${kept.length + 1}: ${line}`);
    used = next;
    endLine += 1;
  }
  return { startLine: 1, endLine: Math.max(1, endLine), text: kept.join("\n") };
}

export function uniqueActions(actions: CancipAction[]): CancipAction[] {
  const seen = new Set<string>();
  const output: CancipAction[] = [];
  for (const action of actions) {
    const key = stableCacheKey(canonicalJsonValue(action));
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(action);
  }
  return output;
}

export function isTextAttachmentFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith("text/")) return true;
  if (
    [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/typescript",
      "application/x-javascript",
      "application/x-typescript",
      "application/x-yaml",
      "application/yaml",
      "application/toml",
      "application/x-ndjson"
    ].includes(type)
  ) {
    return true;
  }
  const name = file.name.toLowerCase();
  return /\.(md|markdown|txt|log|json|jsonl|ndjson|csv|tsv|yaml|yml|toml|xml|html?|css|scss|sass|less|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|kt|kts|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|ps1|bat|cmd|sql|ini|conf|cfg|env|gitignore|dockerfile)$/i.test(name);
}

export function isImageAttachmentFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

export async function parseBinaryAttachment(file: File, maxChars: number): Promise<ParsedAttachmentResult> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const warnings: string[] = [];
  const safeMax = Math.max(1200, Math.min(30000, maxChars));
  try {
    if (type === "application/pdf" || name.endsWith(".pdf")) {
      return { kind: "pdf/best-effort-text", text: await extractPdfText(file, safeMax, warnings), warnings };
    }
    if (/\.(docx|xlsx|pptx|zip)$/i.test(file.name) || /zip|officedocument|spreadsheet|presentation|wordprocessingml/i.test(type)) {
      const buffer = await file.arrayBuffer();
      const entries = readZipEntries(new Uint8Array(buffer), warnings);
      if (!entries.length) {
        warnings.push("ZIP central directory was not found or no supported entries were present.");
        return { kind: "zip", text: "", warnings };
      }
      if (name.endsWith(".xlsx") || /spreadsheet/i.test(type)) {
        return { kind: "xlsx/xml", text: await extractXlsxText(entries, new Uint8Array(buffer), safeMax, warnings), warnings };
      }
      if (name.endsWith(".docx") || /wordprocessingml/i.test(type)) {
        return { kind: "docx/xml", text: await extractDocxText(entries, new Uint8Array(buffer), safeMax, warnings), warnings };
      }
      if (name.endsWith(".pptx") || /presentationml/i.test(type)) {
        return { kind: "pptx/xml", text: await extractPptxText(entries, new Uint8Array(buffer), safeMax, warnings), warnings };
      }
      return { kind: "zip/xml-text", text: await extractZipText(entries, new Uint8Array(buffer), safeMax, warnings), warnings };
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }
  return { kind: type || "binary", text: "", warnings };
}

export function ocrPdfCacheCoversLimit(entry: OcrIndexEntry, requestedPages: number): boolean {
  const indexedPages = entry.pages?.length ?? 0;
  if (indexedPages >= requestedPages) return true;
  const totals = entry.description.match(/PDF pages OCR-indexed:\s*(\d+)\s*\/\s*(\d+)/i);
  const totalPages = totals ? Number.parseInt(totals[2], 10) : Number.NaN;
  return Number.isFinite(totalPages) && indexedPages >= totalPages;
}

export function normalizeOcrIndexEntry(raw: unknown): OcrIndexEntry | null {
  if (!isRecord(raw) || (raw.source !== "vault" && raw.source !== "remote") || typeof raw.sourceKey !== "string") return null;
  const blocks: OcrLayoutBlock[] = Array.isArray(raw.blocks) ? raw.blocks.filter(isRecord).map((block) => {
    const page = Math.floor(finiteNumber(block.page));
    return {
      text: typeof block.text === "string" ? trimContext(block.text, 300) : "",
      confidence: finiteNumber(block.confidence),
      x: clampUnit(finiteNumber(block.x)),
      y: clampUnit(finiteNumber(block.y)),
      width: clampUnit(finiteNumber(block.width)),
      height: clampUnit(finiteNumber(block.height)),
      ...(page > 0 ? { page } : {})
    };
  }).filter((block) => block.text).slice(0, 240) : [];
  const pages = Array.isArray(raw.pages) ? raw.pages.filter(isRecord).map((page) => ({
    page: Math.max(1, Math.floor(finiteNumber(page.page, 1))),
    text: typeof page.text === "string" ? trimContext(page.text, 30000) : "",
    description: typeof page.description === "string" ? trimContext(page.description, 1200) : "",
    confidence: finiteNumber(page.confidence),
    semanticTags: Array.isArray(page.semanticTags)
      ? uniqueStrings(page.semanticTags.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))).slice(0, 80)
      : []
  })) : undefined;
  return {
    schemaVersion: Math.max(0, Math.floor(finiteNumber(raw.schemaVersion))),
    engineVersion: typeof raw.engineVersion === "string" ? raw.engineVersion : "",
    source: raw.source,
    path: typeof raw.path === "string" ? raw.path : "",
    sourceKey: raw.sourceKey,
    mtime: finiteNumber(raw.mtime),
    size: finiteNumber(raw.size),
    indexedAt: typeof raw.indexedAt === "string" ? raw.indexedAt : "",
    languages: typeof raw.languages === "string" ? raw.languages : "",
    confidence: finiteNumber(raw.confidence),
    width: finiteNumber(raw.width),
    height: finiteNumber(raw.height),
    text: typeof raw.text === "string" ? trimContext(raw.text, 30000) : "",
    description: typeof raw.description === "string" ? trimContext(raw.description, 5000) : "",
    semanticTags: Array.isArray(raw.semanticTags)
      ? uniqueStrings(raw.semanticTags.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))).slice(0, 80)
      : [],
    blocks,
    ...(pages?.length ? { pages } : {})
  };
}

export function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function isOcrSupportedPath(path: string): boolean {
  return isPdfPath(path) || /\.(?:png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(path.replace(/[?#].*$/, ""));
}

export function isSafeRemoteOcrUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isPublicRemoteOcrHostname(parsed.hostname) && isOcrSupportedPath(parsed.pathname);
  } catch {
    return false;
  }
}

export function isPublicRemoteOcrHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host === "::" || host === "::1" || /^f[cd][0-9a-f:]*$/i.test(host) || /^fe[89ab][0-9a-f:]*$/i.test(host)) return false;
  const octets = host.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return !(a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224);
}

export function extractRemoteOcrUrls(content: string): string[] {
  const matches = content.match(/https:\/\/[^\s<>"')\]]+?(?:\.pdf|\.png|\.jpe?g|\.webp|\.gif|\.bmp|\.svg|\.avif)(?:\?[^\s<>"')\]]*)?/gi) ?? [];
  return uniqueStrings(matches.map((url) => url.replace(/[.,;，。；]+$/, "")).filter(isSafeRemoteOcrUrl)).slice(0, 8);
}

export function remoteOcrFileName(url: string, fallback: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || fallback).slice(-120) || fallback;
  } catch {
    return fallback;
  }
}

export function resourceParentUrl(url: string): string {
  const clean = url.replace(/[?#].*$/, "");
  return clean.slice(0, Math.max(0, clean.lastIndexOf("/")));
}

export function supportsWasmSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

export async function prepareOcrImage(blob: Blob, maxDimension: number): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const largest = Math.max(bitmap.width, bitmap.height);
    if (!largest) return { blob, width: 0, height: 0 };
    const scale = Math.min(1, maxDimension / largest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale >= 0.999) return { blob, width, height };
    const canvas = activeDocument.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return { blob, width: bitmap.width, height: bitmap.height };
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return { blob: await canvasElementToBlob(canvas, "image/jpeg", 0.9), width, height };
  } catch {
    return { blob, width: 0, height: 0 };
  } finally {
    bitmap?.close();
  }
}

export async function canvasElementToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("OCR canvas encoding returned empty data")), type, quality);
  });
}

export function ocrLayoutBlocks(raw: unknown, imageWidth: number, imageHeight: number): OcrLayoutBlock[] {
  const blocks: OcrLayoutBlock[] = [];
  for (const block of Array.isArray(raw) ? raw : []) {
    if (!isRecord(block)) continue;
    const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : [];
    for (const paragraph of paragraphs) {
      if (!isRecord(paragraph)) continue;
      for (const line of Array.isArray(paragraph.lines) ? paragraph.lines : []) {
        if (!isRecord(line) || typeof line.text !== "string" || !line.text.trim()) continue;
        const bbox = isRecord(line.bbox) ? line.bbox : {};
        const x0 = finiteNumber(bbox.x0);
        const y0 = finiteNumber(bbox.y0);
        const x1 = finiteNumber(bbox.x1, x0);
        const y1 = finiteNumber(bbox.y1, y0);
        blocks.push({
          text: trimContext(line.text.replace(/\s+/g, " ").trim(), 300),
          confidence: finiteNumber(line.confidence),
          x: imageWidth ? x0 / imageWidth : x0,
          y: imageHeight ? y0 / imageHeight : y0,
          width: imageWidth ? Math.max(0, x1 - x0) / imageWidth : Math.max(0, x1 - x0),
          height: imageHeight ? Math.max(0, y1 - y0) / imageHeight : Math.max(0, y1 - y0)
        });
      }
    }
  }
  return blocks.slice(0, 240);
}

export function shouldRetryOcrOrientation(data: { text?: string | null; confidence?: number | null }): boolean {
  const text = normalizeExtractedText(data.text ?? "");
  return text.length >= 3 && finiteNumber(data.confidence) < 72;
}

export function ocrRecognitionScore(data: { text?: string | null; confidence?: number | null }): number {
  const text = normalizeExtractedText(data.text ?? "");
  const readable = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return finiteNumber(data.confidence) + Math.min(8, readable / 6);
}

export async function detectBrowserVisualSemanticTags(blob: Blob): Promise<string[]> {
  type Detector = { detect: (source: ImageBitmap) => Promise<unknown[]> };
  type DetectorConstructor = new (options?: Record<string, unknown>) => Detector;
  const browser = globalThis as unknown as {
    FaceDetector?: DetectorConstructor;
    BarcodeDetector?: DetectorConstructor;
  };
  if (!browser.FaceDetector && !browser.BarcodeDetector) return [];
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const tags: string[] = [];
    if (browser.FaceDetector) {
      try {
        const faces = await new browser.FaceDetector({ fastMode: true, maxDetectedFaces: 8 }).detect(bitmap);
        if (faces.length) tags.push("人物", "人脸", "肖像", "person", "face", "portrait");
      } catch {
        // Shape Detection APIs are optional in Obsidian WebView builds.
      }
    }
    if (browser.BarcodeDetector) {
      try {
        const codes = await new browser.BarcodeDetector().detect(bitmap);
        if (codes.length) tags.push("条码", "二维码", "barcode", "QR code");
      } catch {
        // Keep OCR available when the platform detector rejects this image format.
      }
    }
    return uniqueStrings(tags);
  } catch {
    return [];
  } finally {
    bitmap?.close();
  }
}

export function inferOcrSemanticTags(
  text: string,
  sourceKey: string,
  width: number,
  height: number,
  blocks: OcrLayoutBlock[],
  visualTags: string[] = []
): string[] {
  const source = `${sourceKey}\n${text}`.normalize("NFKC");
  const tags = [...visualTags];
  const add = (...values: string[]) => tags.push(...values);
  if (/(?:中华人民共和国\s*居民身份证|居民身份证|公民身份号码|身份证号码|身份证|签发机关[\s\S]{0,80}有效期限|性别[\s\S]{0,30}民族[\s\S]{0,100}(?:出生|住址))/i.test(source)) {
    add("身份证", "居民身份证", "身份证件", "证件", "卡片", "identity card", "ID card", "identity document");
  }
  if (/(?:护照|passport|国籍[\s\S]{0,50}护照号码)/i.test(source)) add("护照", "证件", "passport", "travel document");
  if (/(?:驾驶证|机动车驾驶证|准驾车型|driver'?s? license)/i.test(source)) add("驾驶证", "证件", "车辆", "driver license");
  if (/(?:社会保障卡|社保卡|social security card)/i.test(source)) add("社保卡", "证件", "社会保障", "social security card");
  if (/(?:银行卡|信用卡|借记卡|开户行|bank card|credit card|debit card)/i.test(source)) add("银行卡", "卡片", "金融", "bank card");
  if (/(?:发票|增值税|invoice|税额|购买方|销售方)/i.test(source)) add("发票", "票据", "财务", "invoice", "receipt");
  if (/(?:收据|小票|合计|实付|receipt)/i.test(source)) add("收据", "小票", "票据", "receipt");
  if (/(?:病历|诊断|检查报告|检验报告|医院|medical|patient)/i.test(source)) add("医疗文档", "病历", "检查报告", "medical document");
  if (/(?:名片|职位|手机[:：]|电话[:：]|email[:：]|business card)/i.test(source)) add("名片", "联系方式", "人物", "business card", "contact");
  if (/(?:姓名|name)\s*[:：]?[^\n]{1,24}[\s\S]{0,120}(?:性别|出生|年龄|民族|gender|birth|age)/i.test(source)) {
    add("人物", "个人", "个人资料", "person", "personal information");
  }
  if (/(?:车辆|车牌|机动车|汽车|轿车|vehicle|license plate)/i.test(source)) add("车辆", "汽车", "vehicle", "car");
  if (/(?:菜单|菜品|配料|食品|饮料|menu|ingredients|food)/i.test(source)) add("食品", "菜单", "食物", "food", "menu");
  if (/(?:证书|资格证|毕业证|学位证|certificate|diploma)/i.test(source)) add("证书", "证件", "certificate", "diploma");
  if (/(?:车票|机票|登机牌|火车票|boarding pass|ticket)/i.test(source)) add("票据", "车票", "行程", "ticket", "boarding pass");
  const shortBlocks = blocks.filter((block) => block.text.length <= 24).length;
  const numericBlocks = blocks.filter((block) => /\d/.test(block.text)).length;
  const alignedColumns = new Set(blocks.map((block) => Math.round(block.x * 10))).size;
  if (blocks.length >= 6 && numericBlocks >= 3 && alignedColumns >= 3) add("表格", "表单", "table", "form");
  if (blocks.length >= 8 && shortBlocks / Math.max(1, blocks.length) >= 0.65) add("截图", "界面", "screenshot", "interface");
  if (width > height * 1.35 && blocks.length >= 4 && tags.some((tag) => /证件|card|passport|license/i.test(tag))) add("横向卡片", "card-like image");
  return uniqueStrings(tags.map((tag) => tag.trim()).filter(Boolean)).slice(0, 80);
}

export function describeOcrLayout(width: number, height: number, blocks: OcrLayoutBlock[], text: string, semanticTags: string[] = []): string {
  const orientation = width && height ? (width > height * 1.15 ? "landscape" : height > width * 1.15 ? "portrait" : "square") : "unknown";
  const shortBlocks = blocks.filter((block) => block.text.length <= 24).length;
  const numericBlocks = blocks.filter((block) => /\d/.test(block.text)).length;
  const urlCount = (text.match(/https?:\/\/|www\./gi) ?? []).length;
  const alignedColumns = new Set(blocks.map((block) => Math.round(block.x * 10))).size;
  const likelyTable = blocks.length >= 6 && numericBlocks >= 3 && alignedColumns >= 3;
  const likelyInterface = blocks.length >= 8 && shortBlocks / Math.max(1, blocks.length) >= 0.65;
  const kind = likelyTable ? "table/form-like layout" : likelyInterface ? "screenshot/interface-like layout" : blocks.length >= 8 ? "multi-block document" : blocks.length ? "simple text image" : "image without confident text regions";
  return [
    `Visual layout: ${orientation} ${width || "?"}x${height || "?"}`,
    `Detected structure: ${kind}; text regions=${blocks.length}; short labels=${shortBlocks}; numeric regions=${numericBlocks}`,
    semanticTags.length ? `Detected semantic tags: ${semanticTags.join(", ")}` : "",
    urlCount ? `Detected URL-like text: ${urlCount}` : ""
  ].filter(Boolean).join("\n");
}

export function ocrEntrySearchText(entry: OcrIndexEntry, maxChars: number): string {
  const blocks = entry.blocks.slice(0, 40).map((block, index) => (
    `Region ${index + 1}${block.page ? ` page=${block.page}` : ""} [x=${block.x.toFixed(3)}, y=${block.y.toFixed(3)}, w=${block.width.toFixed(3)}, h=${block.height.toFixed(3)}, confidence=${block.confidence.toFixed(1)}]: ${block.text}`
  ));
  return trimContext([
    `OCR source: ${entry.sourceKey}`,
    `OCR engine: local tesseract.js lite ${entry.engineVersion}; languages=${entry.languages}; confidence=${entry.confidence}`,
    entry.semanticTags.length ? `Semantic tags: ${entry.semanticTags.join(", ")}` : "",
    entry.description,
    ocrEntryFullText(entry),
    blocks.length ? `Layout regions:\n${blocks.join("\n")}` : ""
  ].filter(Boolean).join("\n\n"), maxChars);
}

export function ocrEntryFullText(entry: OcrIndexEntry): string {
  if (entry.pages?.length) return entry.pages.map((page) => `Page ${page.page}\n${page.text}`).join("\n\n");
  return entry.text;
}

export function ocrEntryElementDescription(entry: OcrIndexEntry): string {
  const pages = entry.pages?.map((page) => `Page ${page.page}: ${page.description}`).join("\n") ?? "";
  const regions = entry.blocks.map((block, index) => (
    `Region ${index + 1}${block.page ? ` page=${block.page}` : ""} [x=${block.x.toFixed(3)}, y=${block.y.toFixed(3)}, w=${block.width.toFixed(3)}, h=${block.height.toFixed(3)}, confidence=${block.confidence.toFixed(1)}]: ${block.text}`
  )).join("\n");
  return [entry.description, pages, regions].filter(Boolean).join("\n\n");
}

export function suggestOcrFileBaseName(entry: OcrIndexEntry, fallback: string): string {
  const line = ocrEntryFullText(entry)
    .split(/\r?\n/)
    .map((value) => value.replace(/^Page\s+\d+\s*$/i, "").trim())
    .find((value) => value.length >= 2 && value.length <= 48 && /[\p{L}\p{N}\p{Script=Han}]/u.test(value));
  return safeVaultFileName(line || fallback).replace(/\.[^.]+$/, "").trim() || fallback;
}

export function isDocumentWorkbenchMode(value: unknown): value is DocumentWorkbenchMode {
  return value === "preview" || value === "reading" || value === "markdown" || value === "markdown-reading" || value === "edit";
}

export function normalizeDocumentWorkbenchExtension(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\.+/, "");
  if (normalized === "*") return normalized;
  if (normalized === "md" || normalized === "markdown") return "";
  return /^[a-z0-9][a-z0-9+_-]{0,31}$/.test(normalized) ? normalized : "";
}

export type RawDocumentSource = {
  text: string;
  available: boolean;
  editable: boolean;
  textual: boolean;
  encoding: DocumentTextEncoding;
  hasBom: boolean;
};

export function decodeDocumentText(bytes: Uint8Array, forceText: boolean): RawDocumentSource {
  const empty: RawDocumentSource = {
    text: "",
    available: bytes.byteLength === 0,
    editable: bytes.byteLength === 0,
    textual: bytes.byteLength === 0,
    encoding: "utf-8",
    hasBom: false
  };
  if (!bytes.byteLength) return empty;
  const bomCandidates: Array<{ encoding: DocumentTextEncoding; bom: number[] }> = [
    { encoding: "utf-8", bom: [0xef, 0xbb, 0xbf] },
    { encoding: "utf-16le", bom: [0xff, 0xfe] },
    { encoding: "utf-16be", bom: [0xfe, 0xff] }
  ];
  for (const candidate of bomCandidates) {
    if (!candidate.bom.every((value, index) => bytes[index] === value)) continue;
    const text = decodeDocumentTextCandidate(bytes.subarray(candidate.bom.length), candidate.encoding, false);
    if (text === null) break;
    return { text, available: true, editable: true, textual: true, encoding: candidate.encoding, hasBom: true };
  }

  const sample = bytes.subarray(0, Math.min(bytes.byteLength, 128 * 1024));
  const nulAtEven = countByteAtParity(sample, 0, 0);
  const nulAtOdd = countByteAtParity(sample, 0, 1);
  const pairCount = Math.max(1, Math.floor(sample.byteLength / 2));
  const utf16LeSignal = nulAtOdd / pairCount > 0.18 && nulAtEven / pairCount < 0.08;
  const utf16BeSignal = nulAtEven / pairCount > 0.18 && nulAtOdd / pairCount < 0.08;
  const binaryByteRatio = unreadableByteRatio(sample, utf16LeSignal || utf16BeSignal);
  const candidates: Array<{ encoding: DocumentTextEncoding; text: string; score: number }> = [];
  const addCandidate = (encoding: DocumentTextEncoding, fatal: boolean, bonus = 0): void => {
    const text = decodeDocumentTextCandidate(bytes, encoding, fatal);
    if (text === null) return;
    let score = documentTextQuality(text) + bonus;
    if ((encoding === "gb18030" || encoding === "big5") && hasCjkText(text)) score += 0.04;
    candidates.push({ encoding, text, score });
  };
  addCandidate("utf-8", true, 0.08);
  if (utf16LeSignal) addCandidate("utf-16le", true, 0.12);
  if (utf16BeSignal) addCandidate("utf-16be", true, 0.12);
  addCandidate("gb18030", true, 0.02);
  addCandidate("big5", true, 0.01);
  addCandidate("windows-1252", false, -0.08);
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return empty;
  const textual = forceText || (best.score >= 0.7 && binaryByteRatio < 0.025);
  return {
    text: textual ? best.text : "",
    available: textual,
    editable: textual,
    textual,
    encoding: best.encoding,
    hasBom: false
  };
}

export function decodeDocumentTextCandidate(bytes: Uint8Array, encoding: DocumentTextEncoding, fatal: boolean): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

export function countByteAtParity(bytes: Uint8Array, value: number, parity: 0 | 1): number {
  let count = 0;
  for (let index = parity; index < bytes.byteLength; index += 2) {
    if (bytes[index] === value) count += 1;
  }
  return count;
}

export function unreadableByteRatio(bytes: Uint8Array, allowUtf16Nul: boolean): number {
  if (!bytes.byteLength) return 0;
  let unreadable = 0;
  for (const value of bytes) {
    if ((!allowUtf16Nul && value === 0)
      || (value > 0 && value < 32 && value !== 9 && value !== 10 && value !== 12 && value !== 13)) unreadable += 1;
  }
  return unreadable / bytes.byteLength;
}

export function documentTextQuality(text: string): number {
  if (!text) return 1;
  const sample = text.slice(0, 128 * 1024);
  let unreadable = 0;
  let replacement = 0;
  for (const char of sample) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0xfffd) replacement += 1;
    if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13)) unreadable += 1;
  }
  const length = Math.max(1, [...sample].length);
  const mojibake = (sample.match(/(?:\u00c2|\u00c3|\u00e2[\u0080-\u00bf]|\ufffd)/g) ?? []).length;
  return 1 - unreadable / length * 5 - replacement / length * 8 - mojibake / length * 2;
}

export function encodeDocumentText(text: string, encoding: DocumentTextEncoding, hasBom: boolean): { bytes: Uint8Array; encoding: DocumentTextEncoding } {
  if (encoding === "utf-16le" || encoding === "utf-16be") {
    const bomSize = hasBom ? 2 : 0;
    const bytes = new Uint8Array(bomSize + text.length * 2);
    if (hasBom) {
      bytes[0] = encoding === "utf-16le" ? 0xff : 0xfe;
      bytes[1] = encoding === "utf-16le" ? 0xfe : 0xff;
    }
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      const offset = bomSize + index * 2;
      bytes[offset] = encoding === "utf-16le" ? code & 0xff : code >>> 8;
      bytes[offset + 1] = encoding === "utf-16le" ? code >>> 8 : code & 0xff;
    }
    return { bytes, encoding };
  }
  const utf8 = new TextEncoder().encode(text);
  const preserveUtf8Bom = encoding === "utf-8" && hasBom;
  if (!preserveUtf8Bom) return { bytes: utf8, encoding: "utf-8" };
  const bytes = new Uint8Array(utf8.byteLength + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(utf8, 3);
  return { bytes, encoding: "utf-8" };
}

export function documentArchiveFormat(file: TFile): DocumentArchiveFormat {
  const name = file.name.toLowerCase();
  const extension = file.extension.toLowerCase();
  if (["zip", "epub", "odt", "ods", "odp"].includes(extension)) return "zip";
  if (extension === "tar") return "tar";
  if (extension === "tgz" || name.endsWith(".tar.gz")) return "tar-gzip";
  if (extension === "gz") return "gzip";
  if (extension === "rar") return "rar";
  if (extension === "7z") return "7z";
  return "unsupported";
}

export function documentArchiveCanRebuild(file: TFile): boolean {
  const format = documentArchiveFormat(file);
  if (format === "zip") return file.extension.toLowerCase() === "zip";
  return format === "tar" || format === "tar-gzip" || format === "gzip";
}

export function normalizeDocumentArchiveEntryPath(path: string): string {
  const normalized = normalizePath(path.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || /^[a-zA-Z]:/.test(normalized)) return "";
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return "";
    parts.push(part);
  }
  return parts.join("/");
}

export function replaceUniqueDocumentTextValue(source: string, originalText: string, editedText: string, htmlEntities = false): string | null {
  const candidates = htmlEntities
    ? uniqueStrings([originalText, escapeHtml(originalText)]).filter(Boolean)
    : uniqueStrings([
        originalText,
        originalText.replace(/\r?\n/g, "\r\n"),
        originalText.replace(/\r\n/g, "\n")
      ]).filter(Boolean);
  for (const candidate of candidates) {
    const index = source.indexOf(candidate);
    if (index < 0 || source.indexOf(candidate, index + candidate.length) >= 0) continue;
    const replacement = htmlEntities && candidate !== originalText
      ? escapeHtml(editedText)
      : candidate.includes("\r\n")
        ? editedText.replace(/\r?\n/g, "\r\n")
        : editedText.replace(/\r\n/g, "\n");
    return `${source.slice(0, index)}${replacement}${source.slice(index + candidate.length)}`;
  }
  if (!htmlEntities) {
    const normalizedOriginal = originalText.replace(/\s+/g, " ").trim();
    if (normalizedOriginal) {
      const lines = source.split(/(\r?\n)/);
      for (let index = 0, offset = 0; index < lines.length; index += 2) {
        const line = lines[index] ?? "";
        const heading = line.match(/^(#{1,6}\s+)/);
        if (heading && line.slice(heading[0].length).replace(/\s+/g, " ").trim() === normalizedOriginal) {
          return `${source.slice(0, offset)}${heading[1]}${editedText}${source.slice(offset + line.length)}`;
        }
        offset += line.length + (lines[index + 1]?.length ?? 0);
      }
    }
  }
  return null;
}

export function normalizedDocumentTextValue(value: string): string {
  return decodeXmlEntities(String(value ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_~`#>|[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedDocumentTextIncludes(source: string, value: string): boolean {
  const normalizedValue = normalizedDocumentTextValue(value);
  return Boolean(normalizedValue && normalizedDocumentTextValue(source).includes(normalizedValue));
}

export function escapeOfficeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function officeXmlBlockTags(kind: DocumentFormatKind, path: string): string[] {
  if (kind === "docx" && /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(path)) return ["p"];
  if (kind === "pptx" && /^ppt\/(?:slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/i.test(path)) return ["p"];
  if (kind === "xlsx" && /^xl\/sharedStrings\.xml$/i.test(path)) return ["si"];
  if (kind === "xlsx" && /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)) return ["is"];
  return [];
}

export function officeXmlTextBlockReplacement(
  block: string,
  originalText: string,
  editedText: string,
  contextualAnchor?: OfficeContextualTextAnchor
): string | null {
  const textPattern = /(<(?:(?:[A-Za-z_][\w.-]*):)?t\b[^>]*>)([\s\S]*?)(<\/(?:(?:[A-Za-z_][\w.-]*):)?t\s*>)/gi;
  const parts = [...block.matchAll(textPattern)];
  if (!parts.length) return null;
  const values = parts.map((match) => decodeXmlEntities(match[2] ?? ""));
  const visible = values.join("");
  let from = -1;
  let to = -1;
  if (contextualAnchor) {
    const { contextText, startOffset, endOffset } = contextualAnchor;
    if (
      startOffset < 0
      || endOffset < startOffset
      || endOffset > contextText.length
      || contextText.slice(startOffset, endOffset) !== originalText
    ) return null;
    const contextIndex = visible.indexOf(contextText);
    if (contextIndex < 0 || visible.indexOf(contextText, contextIndex + Math.max(1, contextText.length)) >= 0) return null;
    from = contextIndex + startOffset;
    to = contextIndex + endOffset;
    if (visible.slice(from, to) !== originalText) return null;
  } else {
    const exactIndex = originalText ? visible.indexOf(originalText) : -1;
    if (exactIndex >= 0 && visible.indexOf(originalText, exactIndex + Math.max(1, originalText.length)) < 0) {
      from = exactIndex;
      to = exactIndex + originalText.length;
    } else if (normalizedDocumentTextValue(visible) === normalizedDocumentTextValue(originalText)) {
      from = 0;
      to = visible.length;
    } else {
      return null;
    }
  }
  const nextValues = [...values];
  let cursor = 0;
  let inserted = false;
  if (from === to) {
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      const runEnd = cursor + value.length;
      if (from <= runEnd) {
        const local = Math.max(0, Math.min(value.length, from - cursor));
        nextValues[index] = `${value.slice(0, local)}${editedText}${value.slice(local)}`;
        inserted = true;
        break;
      }
      cursor = runEnd;
    }
  } else {
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      const runStart = cursor;
      const runEnd = runStart + value.length;
      cursor = runEnd;
      if (runEnd <= from || runStart >= to) continue;
      const localStart = Math.max(0, Math.min(value.length, from - runStart));
      const localEnd = Math.max(localStart, Math.min(value.length, to - runStart));
      nextValues[index] = `${value.slice(0, localStart)}${inserted ? "" : editedText}${value.slice(localEnd)}`;
      inserted = true;
    }
  }
  if (!inserted) return null;
  let next = block;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const match = parts[index];
    if (match.index === undefined) continue;
    const open = match[1] ?? "";
    const content = match[2] ?? "";
    const from = match.index + open.length;
    const replacement = escapeOfficeXmlText(nextValues[index]);
    next = `${next.slice(0, from)}${replacement}${next.slice(from + content.length)}`;
  }
  return next;
}

export function officeXmlTextReplacements(
  xml: string,
  tags: string[],
  originalText: string,
  editedText: string,
  contextualAnchor?: OfficeContextualTextAnchor
): Array<{ start: number; end: number; text: string }> {
  if (!tags.length) return [];
  const names = tags.join("|");
  const blockPattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?(${names})\\b[^>]*>[\\s\\S]*?<\\/(?:(?:[A-Za-z_][\\w.-]*):)?\\1\\s*>`, "gi");
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  for (const match of xml.matchAll(blockPattern)) {
    if (match.index === undefined) continue;
    const text = officeXmlTextBlockReplacement(match[0], originalText, editedText, contextualAnchor);
    if (text === null) continue;
    replacements.push({ start: match.index, end: match.index + match[0].length, text });
  }
  return replacements;
}

export function replaceOfficeArchiveVisibleText(
  archive: Record<string, Uint8Array>,
  kind: DocumentFormatKind,
  originalText: string,
  editedText: string,
  contextualAnchor?: OfficeContextualTextAnchor
): { archive: Record<string, Uint8Array>; changed: boolean } {
  const matches: Array<{ path: string; xml: string; replacement: { start: number; end: number; text: string } }> = [];
  for (const [path, bytes] of Object.entries(archive)) {
    const tags = officeXmlBlockTags(kind, path);
    if (!tags.length) continue;
    const xml = strFromU8(bytes);
    for (const replacement of officeXmlTextReplacements(xml, tags, originalText, editedText, contextualAnchor)) {
      matches.push({ path, xml, replacement });
    }
  }
  if (matches.length !== 1) return { archive, changed: false };
  const match = matches[0];
  if (kind === "xlsx" && /^xl\/sharedStrings\.xml$/i.test(match.path)) {
    const sharedIndex = [...match.xml.slice(0, match.replacement.start).matchAll(/<(?:(?:[A-Za-z_][\w.-]*):)?si\b/gi)].length;
    let references = 0;
    for (const [path, bytes] of Object.entries(archive)) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(path)) continue;
      const xml = strFromU8(bytes);
      for (const cell of xml.matchAll(/<(?:(?:[A-Za-z_][\w.-]*):)?c\b([^>]*)>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?c\s*>/gi)) {
        if (!/\bt=["']s["']/i.test(cell[1] ?? "")) continue;
        const value = cell[0].match(/<(?:(?:[A-Za-z_][\w.-]*):)?v\b[^>]*>\s*(\d+)\s*<\/(?:(?:[A-Za-z_][\w.-]*):)?v\s*>/i)?.[1];
        if (Number(value) === sharedIndex) references += 1;
        if (references > 1) return { archive, changed: false };
      }
    }
  }
  const nextXml = `${match.xml.slice(0, match.replacement.start)}${match.replacement.text}${match.xml.slice(match.replacement.end)}`;
  archive[match.path] = strToU8(nextXml);
  return { archive, changed: true };
}

export function officeXmlBlocks(xml: string, tag: string): Array<{ start: number; end: number; text: string }> {
  if (!/^(?:p|tbl|sp|graphicFrame|si|is|anchor)$/i.test(tag)) return [];
  const pattern = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${tag}\\s*>`, "gi");
  return [...xml.matchAll(pattern)].flatMap((match) => match.index === undefined
    ? []
    : [{ start: match.index, end: match.index + match[0].length, text: match[0] }]);
}

export function replaceOfficeArchiveTextAtLocator(
  archive: Record<string, Uint8Array>,
  locator: DocumentPreviewSourceLocator,
  originalText: string,
  editedText: string,
  contextualAnchor?: OfficeContextualTextAnchor
): { archive: Record<string, Uint8Array>; changed: boolean } {
  const path = normalizeDocumentArchiveEntryPath(locator.officePart ?? "");
  const tag = locator.officeTag ?? "";
  const index = Number(locator.officeIndex);
  const key = Object.keys(archive).find((candidate) => normalizeDocumentArchiveEntryPath(candidate) === path);
  if (!key || !Number.isInteger(index) || index < 0) return { archive, changed: false };
  const xml = strFromU8(archive[key]);
  const block = officeXmlBlocks(xml, tag)[index];
  if (!block) return { archive, changed: false };
  const replacement = officeXmlTextBlockReplacement(block.text, originalText, editedText, contextualAnchor);
  if (replacement === null) return { archive, changed: false };
  archive[key] = strToU8(`${xml.slice(0, block.start)}${replacement}${xml.slice(block.end)}`);
  return { archive, changed: true };
}

export function replaceDomElementUniqueText(
  element: Element,
  originalText: string,
  editedText: string,
  contextualAnchor?: OfficeContextualTextAnchor
): boolean {
  const fullText = element.textContent ?? "";
  let start = -1;
  let end = -1;
  if (contextualAnchor) {
    const { contextText, startOffset, endOffset } = contextualAnchor;
    if (startOffset < 0 || endOffset < startOffset || endOffset > contextText.length || contextText.slice(startOffset, endOffset) !== originalText) return false;
    const contextStart = fullText.indexOf(contextText);
    if (contextStart < 0 || fullText.indexOf(contextText, contextStart + Math.max(1, contextText.length)) >= 0) return false;
    start = contextStart + startOffset;
    end = contextStart + endOffset;
    if (fullText.slice(start, end) !== originalText) return false;
  } else {
    start = fullText.indexOf(originalText);
    if (start < 0 || fullText.indexOf(originalText, start + Math.max(1, originalText.length)) >= 0) {
      if (normalizeHtmlPreviewEditText(fullText) !== normalizeHtmlPreviewEditText(originalText)) return false;
      start = 0;
      originalText = fullText;
    }
    end = start + originalText.length;
  }
  const document = element.ownerDocument;
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(element, 4);
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  if (!nodes.length) return false;
  const pointAt = (offset: number): { node: Text; offset: number } => {
    let consumed = 0;
    for (const node of nodes) {
      const nodeEnd = consumed + node.data.length;
      if (offset <= nodeEnd) return { node, offset: Math.max(0, offset - consumed) };
      consumed = nodeEnd;
    }
    const node = nodes[nodes.length - 1];
    return { node, offset: node.data.length };
  };
  const from = pointAt(start);
  const to = pointAt(end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  range.deleteContents();
  if (editedText) range.insertNode(document.createTextNode(editedText));
  return true;
}

export function parsePackagedHtmlSource(source: string): { document: Document; xml: boolean } | null {
  const xml = /^\s*<\?xml\b/i.test(source) || /<html\b[^>]*\bxmlns\s*=/i.test(source);
  if (xml) {
    const document = new DOMParser().parseFromString(source, "application/xhtml+xml");
    if (!document.querySelector("parsererror")) return { document, xml: true };
  }
  const document = new DOMParser().parseFromString(source || "<html><body></body></html>", "text/html");
  return document.documentElement ? { document, xml: false } : null;
}

export function serializePackagedHtmlSource(source: string, parsed: { document: Document; xml: boolean }): string {
  if (parsed.xml) {
    const declaration = source.match(/^\s*(<\?xml[^>]*\?>)/i)?.[1];
    const doctype = source.match(/<!doctype[^>]*>/i)?.[0];
    return [declaration, doctype, new XMLSerializer().serializeToString(parsed.document.documentElement)].filter(Boolean).join("\n");
  }
  const doctype = source.match(/^\s*(<!doctype[^>]*>)/i)?.[1] ?? "<!doctype html>";
  return `${doctype}\n${parsed.document.documentElement.outerHTML}`;
}

export function replaceEpubArchiveTextAtLocator(
  archive: Record<string, Uint8Array>,
  locator: DocumentPreviewSourceLocator,
  originalText: string,
  editedText: string,
  contextualAnchor?: OfficeContextualTextAnchor
): { archive: Record<string, Uint8Array>; changed: boolean } {
  const path = normalizeDocumentArchiveEntryPath(locator.entryPath ?? "");
  const key = Object.keys(archive).find((candidate) => normalizeDocumentArchiveEntryPath(candidate) === path);
  if (!key || !locator.selector) return { archive, changed: false };
  const source = strFromU8(archive[key]);
  const parsed = parsePackagedHtmlSource(source);
  if (!parsed) return { archive, changed: false };
  let element: Element | null = null;
  try {
    element = parsed.document.querySelector(locator.selector);
  } catch {
    return { archive, changed: false };
  }
  if (!element || !replaceDomElementUniqueText(element, originalText, editedText, contextualAnchor)) return { archive, changed: false };
  archive[key] = strToU8(serializePackagedHtmlSource(source, parsed));
  return { archive, changed: true };
}

export function zipEpubArchive(archive: Record<string, Uint8Array>): Uint8Array {
  const mimetypeKey = Object.keys(archive).find((key) => normalizeDocumentArchiveEntryPath(key) === "mimetype");
  const packageEntries: Parameters<typeof zipSync>[0] = {};
  if (mimetypeKey) packageEntries[mimetypeKey] = [archive[mimetypeKey], { level: 0 }];
  for (const [path, data] of Object.entries(archive)) {
    if (path === mimetypeKey) continue;
    packageEntries[path] = data;
  }
  return zipSync(packageEntries, { level: 6 });
}

export function moveHtmlElements(document: Document, movingSelector: string, targetSelector: string, placeAfter: boolean): boolean {
  let moving: Element | null = null;
  let target: Element | null = null;
  try {
    moving = document.querySelector(movingSelector);
    target = document.querySelector(targetSelector);
  } catch {
    return false;
  }
  if (!moving || !target || moving === target || moving.contains(target) || target.contains(moving) || !target.parentElement) return false;
  target.parentElement.insertBefore(moving, placeAfter ? target.nextSibling : target);
  return true;
}

export function moveHtmlDocumentBlock(source: string, movingSelector: string, targetSelector: string, placeAfter: boolean): string | null {
  const parsed = parsePackagedHtmlSource(source);
  if (!parsed || !moveHtmlElements(parsed.document, movingSelector, targetSelector, placeAfter)) return null;
  return serializePackagedHtmlSource(source, parsed);
}

export function moveEpubArchiveBlock(
  archive: Record<string, Uint8Array>,
  moving: DocumentPreviewSourceLocator,
  target: DocumentPreviewSourceLocator,
  placeAfter: boolean
): { archive: Record<string, Uint8Array>; changed: boolean } {
  const movingPath = normalizeDocumentArchiveEntryPath(moving.entryPath ?? "");
  const targetPath = normalizeDocumentArchiveEntryPath(target.entryPath ?? "");
  if (!movingPath || movingPath !== targetPath || !moving.selector || !target.selector) return { archive, changed: false };
  const key = Object.keys(archive).find((candidate) => normalizeDocumentArchiveEntryPath(candidate) === movingPath);
  if (!key) return { archive, changed: false };
  const source = strFromU8(archive[key]);
  const parsed = parsePackagedHtmlSource(source);
  if (!parsed || !moveHtmlElements(parsed.document, moving.selector, target.selector, placeAfter)) return { archive, changed: false };
  archive[key] = strToU8(serializePackagedHtmlSource(source, parsed));
  return { archive, changed: true };
}

export function moveOfficeArchiveBlock(
  archive: Record<string, Uint8Array>,
  kind: "docx" | "pptx",
  moving: DocumentPreviewSourceLocator,
  target: DocumentPreviewSourceLocator,
  placeAfter: boolean
): { archive: Record<string, Uint8Array>; changed: boolean } {
  const path = normalizeDocumentArchiveEntryPath(moving.officePart ?? "");
  if (!path || path !== normalizeDocumentArchiveEntryPath(target.officePart ?? "")) return { archive, changed: false };
  const movingTag = moving.officeMoveTag ?? moving.officeTag ?? "";
  const targetTag = target.officeMoveTag ?? target.officeTag ?? "";
  const movingIndex = Number(moving.officeMoveIndex ?? moving.officeIndex);
  const targetIndex = Number(target.officeMoveIndex ?? target.officeIndex);
  const key = Object.keys(archive).find((candidate) => normalizeDocumentArchiveEntryPath(candidate) === path);
  if (!key || !Number.isInteger(movingIndex) || !Number.isInteger(targetIndex)) return { archive, changed: false };
  const xml = strFromU8(archive[key]);
  const movingBlock = officeXmlBlocks(xml, movingTag)[movingIndex];
  const targetBlock = officeXmlBlocks(xml, targetTag)[targetIndex];
  if (!movingBlock || !targetBlock || movingBlock.start === targetBlock.start) return { archive, changed: false };

  if (kind === "pptx" && movingTag === "sp" && targetTag === "sp") {
    const offsetPattern = /<(?:(?:[A-Za-z_][\w.-]*):)?off\b[^>]*\bx=["']-?\d+["'][^>]*\by=["']-?\d+["'][^>]*\/?\s*>/i;
    const movingOffset = movingBlock.text.match(offsetPattern)?.[0];
    const targetOffset = targetBlock.text.match(offsetPattern)?.[0];
    if (!movingOffset || !targetOffset) return { archive, changed: false };
    const replacements = [
      { start: movingBlock.start, end: movingBlock.end, text: movingBlock.text.replace(movingOffset, targetOffset) },
      { start: targetBlock.start, end: targetBlock.end, text: targetBlock.text.replace(targetOffset, movingOffset) }
    ].sort((left, right) => right.start - left.start);
    let next = xml;
    for (const replacement of replacements) next = `${next.slice(0, replacement.start)}${replacement.text}${next.slice(replacement.end)}`;
    archive[key] = strToU8(next);
    return { archive, changed: true };
  }

  if (kind === "docx" && movingTag === "anchor" && targetTag === "anchor") {
    const positionValue = (block: string, axis: "H" | "V"): string | null => {
      const match = block.match(new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?position${axis}\\b[^>]*>[\\s\\S]*?<(?:(?:[A-Za-z_][\\w.-]*):)?posOffset\\b[^>]*>(-?\\d+)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?posOffset>`, "i"));
      return match?.[1] ?? null;
    };
    const replacePositionValue = (block: string, axis: "H" | "V", value: string): string => block.replace(
      new RegExp(`(<(?:(?:[A-Za-z_][\\w.-]*):)?position${axis}\\b[^>]*>[\\s\\S]*?<(?:(?:[A-Za-z_][\\w.-]*):)?posOffset\\b[^>]*>)-?\\d+(<\\/(?:(?:[A-Za-z_][\\w.-]*):)?posOffset>)`, "i"),
      `$1${value}$2`
    );
    const movingPosition = { x: positionValue(movingBlock.text, "H"), y: positionValue(movingBlock.text, "V") };
    const targetPosition = { x: positionValue(targetBlock.text, "H"), y: positionValue(targetBlock.text, "V") };
    if ([movingPosition.x, movingPosition.y, targetPosition.x, targetPosition.y].some((value) => value === null)) {
      return { archive, changed: false };
    }
    const movedText = replacePositionValue(
      replacePositionValue(movingBlock.text, "H", targetPosition.x!),
      "V",
      targetPosition.y!
    );
    const targetedText = replacePositionValue(
      replacePositionValue(targetBlock.text, "H", movingPosition.x!),
      "V",
      movingPosition.y!
    );
    const replacements = [
      { start: movingBlock.start, end: movingBlock.end, text: movedText },
      { start: targetBlock.start, end: targetBlock.end, text: targetedText }
    ].sort((left, right) => right.start - left.start);
    let next = xml;
    for (const replacement of replacements) next = `${next.slice(0, replacement.start)}${replacement.text}${next.slice(replacement.end)}`;
    archive[key] = strToU8(next);
    return { archive, changed: true };
  }

  const without = `${xml.slice(0, movingBlock.start)}${xml.slice(movingBlock.end)}`;
  let insertion = placeAfter ? targetBlock.end : targetBlock.start;
  if (movingBlock.start < insertion) insertion -= movingBlock.end - movingBlock.start;
  archive[key] = strToU8(`${without.slice(0, insertion)}${movingBlock.text}${without.slice(insertion)}`);
  return { archive, changed: true };
}

export function documentEmbedMarkdown(file: TFile): string {
  return `# ${escapeMarkdownText(file.basename)}\n\n![[${file.path}]]`;
}

export function documentCodeLanguage(extension: string): string {
  const aliases: Record<string, string> = {
    yml: "yaml", htm: "html", mjs: "javascript", cjs: "javascript", js: "javascript", jsx: "jsx", ts: "typescript",
    tsx: "tsx", py: "python", rb: "ruby", sh: "bash", zsh: "bash", ps1: "powershell", bat: "batch", cmd: "batch"
  };
  return aliases[extension] ?? extension.replace(/[^a-z0-9_+-]/gi, "");
}

export function delimitedTextToMarkdown(source: string, delimiter: string, title: string): string {
  const rows = parseDelimitedRows(source, delimiter).slice(0, 500);
  if (!rows.length) return `# ${escapeMarkdownText(title)}`;
  const width = Math.min(80, Math.max(...rows.map((row) => row.length)));
  const normalized = rows.map((row) => Array.from({ length: width }, (_unused, index) => row[index] ?? ""));
  const header = normalized[0].map((cell, index) => cell.trim() || spreadsheetColumnName(index));
  const body = normalized.slice(1);
  return `# ${escapeMarkdownText(title)}\n\n${markdownTable(header, body)}`;
}

export function parseDelimitedRows(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.length)) rows.push(row);
  return rows;
}

export type DocumentTableAlignment = "left" | "center" | "right";

export function markdownTable(header: string[], rows: string[][], alignments: DocumentTableAlignment[] = []): string {
  const safeHeader = header.map(markdownTableCell);
  const lines = [
    `| ${safeHeader.join(" | ")} |`,
    `| ${safeHeader.map((_cell, index) => alignments[index] === "right" ? "---:" : alignments[index] === "center" ? ":---:" : alignments[index] === "left" ? ":---" : "---").join(" | ")} |`
  ];
  for (const row of rows) {
    lines.push(`| ${safeHeader.map((_unused, index) => markdownTableCell(row[index] ?? "")).join(" | ")} |`);
  }
  return lines.join("\n");
}

export function markdownTableCell(value: string): string {
  return normalizeExtractedText(String(value)).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function spreadsheetColumnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + value % 26) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function spreadsheetColumnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let value = 0;
  for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

export function inlineWorkbenchPreviewWithHeightReporter(source: string, token: string, kind: DocumentFormatKind = "binary"): string {
  const spreadsheetMode = kind === "xlsx"
    ? `.cancip-office-preview table{width:max-content!important;min-width:100%!important;max-width:none!important}`
    : "";
  const pptxMode = kind === "pptx"
    ? `.cancip-mpe-office-pages{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;min-height:100%!important;overflow:visible!important;touch-action:pan-y!important}.cancip-mpe-office-page{flex:0 0 auto!important;margin-inline:auto!important}`
    : "";
  const inlineMode = `<meta name="cancip-inline-workbench" content="true"><style data-cancip-inline-scroll>html{height:100%!important;overflow:hidden!important}body{height:100%!important;min-height:100%!important;overflow:auto!important;overscroll-behavior-x:contain!important;overscroll-behavior-y:auto!important;scrollbar-gutter:stable;scrollbar-width:none;touch-action:pan-x pan-y!important;-webkit-overflow-scrolling:touch}body::-webkit-scrollbar{display:none}.cancip-office-preview{overflow:visible!important;overscroll-behavior:auto!important;touch-action:auto!important;-webkit-overflow-scrolling:auto}${spreadsheetMode}${pptxMode}</style>`;
  const closingHead = source.search(/<\/head\s*>/i);
  const markedSource = closingHead >= 0
    ? `${source.slice(0, closingHead)}${inlineMode}${source.slice(closingHead)}`
    : `${inlineMode}${source}`;
  const script = `<script data-cancip-inline-height>(()=>{const channel="cancip-inline-workbench-height-v1",token=${JSON.stringify(token)};let frame=0;const send=()=>{frame=0;const root=document.documentElement,body=document.body,height=Math.max(root?.scrollHeight||0,body?.scrollHeight||0,root?.offsetHeight||0,body?.offsetHeight||0);parent.postMessage({channel,token,height},"*")};const schedule=()=>{if(!frame)frame=requestAnimationFrame(send)};addEventListener("load",schedule);addEventListener("resize",schedule);if(typeof ResizeObserver==="function"){const observer=new ResizeObserver(schedule);observer.observe(document.documentElement)}schedule();setTimeout(schedule,80);setTimeout(schedule,320)})()</script>`;
  const closingBody = markedSource.search(/<\/body\s*>/i);
  return closingBody >= 0
    ? `${markedSource.slice(0, closingBody)}${script}${markedSource.slice(closingBody)}`
    : `${markedSource}${script}`;
}

export function documentMarkdownToPreviewArticle(markdown: string, title: string): string {
  const lines = markdown.split(/\r?\n/);
  const hasDocumentHeading = lines.some((line) => /^#{1,6}\s+/.test(line.trim()));
  const output: string[] = [`<article class="cancip-office-preview">${hasDocumentHeading ? "" : `<h1>${escapeHtml(title)}</h1>`}`];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      index += 1;
      continue;
    }
    if (/^\|/.test(line) && index + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[index + 1].trim())) {
      const rows: string[][] = [];
      let alignments: DocumentTableAlignment[] = [];
      while (index < lines.length && /^\|/.test(lines[index].trim())) {
        const row = lines[index].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim().replace(/\\\|/g, "|"));
        if (row.every((cell) => /^:?-{2,}:?$/.test(cell))) {
          alignments = row.map((cell) => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : "left");
        } else {
          rows.push(row);
        }
        index += 1;
      }
      if (rows.length) {
        const width = Math.max(...rows.map((row) => row.length));
        const cellStyle = (cellIndex: number): string => alignments[cellIndex] && alignments[cellIndex] !== "left" ? ` style="text-align:${alignments[cellIndex]}"` : "";
        output.push(`<table><thead><tr>${Array.from({ length: width }, (_unused, cellIndex) => `<th${cellStyle(cellIndex)}>${renderDocumentMarkdownInline(rows[0][cellIndex] ?? "")}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((row) => `<tr>${Array.from({ length: width }, (_unused, cellIndex) => `<td${cellStyle(cellIndex)}>${renderDocumentMarkdownInline(row[cellIndex] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      }
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      output.push(`<h${level}>${renderDocumentMarkdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        const match = ordered ? current.match(/^\d+[.)]\s+(.+)$/) : current.match(/^[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(`<li>${renderDocumentMarkdownInline(match[1])}</li>`);
        index += 1;
      }
      output.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote>${quote.map(renderDocumentMarkdownInline).join("<br>")}</blockquote>`);
      continue;
    }
    if (/^---+$/.test(line)) {
      output.push("<hr>");
      index += 1;
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|```|\||[-*+]\s+|\d+[.)]\s+|>\s?|---+$)/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p>${paragraph.map(renderDocumentMarkdownInline).join("<br>")}</p>`);
  }
  output.push("</article>");
  return output.join("\n");
}

export function renderDocumentMarkdownInline(value: string): string {
  const links: string[] = [];
  const tokenized = value.replace(/(?<!!)\[([^\]\n]+)\]\(\s*(<[^>\n]+>|[^)\s]+)\s*\)/g, (full, label: string, destination: string) => {
    const href = safeDocumentMarkdownHref(destination);
    if (!href) return full;
    const token = `\uE000CANCIPLINK${links.length}\uE001`;
    links.push(`<a href="${escapeHtmlAttribute(href)}">${renderDocumentMarkdownInlineText(label)}</a>`);
    return token;
  });
  return renderDocumentMarkdownInlineText(tokenized)
    .replace(/\uE000CANCIPLINK(\d+)\uE001/g, (_full, index: string) => links[Number(index)] ?? "");
}

export function renderDocumentMarkdownInlineText(value: string): string {
  return escapeHtml(value)
    .replace(/!\[\[([^\]]+)\]\]/g, "<span class=\"cancip-file-embed\">$1</span>")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_full, target: string, alias?: string) => `<span class="cancip-file-link">${alias || target}</span>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

export function safeDocumentMarkdownHref(value: string): string {
  const href = value.trim().replace(/^<|>$/g, "");
  if (!href || /[\u0000-\u001F\u007F]/.test(href)) return "";
  if (href.startsWith("//")) return `https:${href}`;
  if (/^(?:https?:|mailto:|tel:|sms:|geo:|obsidian:)/i.test(href)) return href;
  return /^[a-z][a-z0-9+.-]*:/i.test(href) ? "" : href;
}

export function decodeUriComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function markdownEmbedLinkpaths(markdown: string): string[] {
  const targets: string[] = [];
  const pattern = /!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(\s*(?:<((?:\\.|[^>])*)>|((?:\\.|[^)\s])+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const raw = (match[1]?.split("|", 1)[0] ?? match[2] ?? match[3] ?? "").trim();
    const target = raw.replace(/\\([\\()[\]<> ])/g, "$1").trim();
    if (target) targets.push(target);
  }
  return targets;
}

export function markdownEmbedResourceCandidates(raw: string, vaultBasePath: string): string[] {
  const original = raw.trim().replace(/^<|>$/g, "");
  if (!original) return [];
  const rawCandidates = [original];
  try {
    const parsed = new URL(original);
    if (/^(?:app|file|capacitor|ionic):$/i.test(parsed.protocol)) {
      rawCandidates.push(parsed.pathname);
      for (const key of ["path", "file"]) {
        const queryPath = parsed.searchParams.get(key);
        if (queryPath) rawCandidates.push(queryPath);
      }
    }
  } catch {
    // Relative Vault paths and Windows drive paths are intentionally not URLs.
  }
  rawCandidates.push(
    original
      .replace(/^app:\/\/(?:local|obsidian\.md)\//i, "")
      .replace(/^file:\/+/i, "/")
      .replace(/^(?:capacitor|ionic):\/\/[^/]+\//i, "/")
  );

  const normalizedBase = decodeUriComponentSafely(vaultBasePath.trim())
    .replace(/\\/g, "/")
    .replace(/^\/+([a-z]:\/)/i, "$1")
    .replace(/\/+$/, "");
  const results: string[] = [];
  const seen = new Set<string>();
  for (const candidate of rawCandidates) {
    let value = decodeUriComponentSafely(candidate.trim().split(/[?#]/, 1)[0] ?? "")
      .replace(/\\/g, "/")
      .replace(/^\/+_capacitor_file_\//i, "/")
      .replace(/^vault:\/+/i, "")
      .replace(/^\/+([a-z]:\/)/i, "$1");
    if (!value) continue;
    if (normalizedBase) {
      const candidateLower = value.toLowerCase();
      const baseLower = normalizedBase.toLowerCase();
      if (candidateLower === baseLower) value = "";
      else if (candidateLower.startsWith(`${baseLower}/`)) value = value.slice(normalizedBase.length + 1);
    }
    value = value.replace(/^\/+/, "");
    if (!value || /^[a-z]:\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) continue;
    if (!seen.has(value)) {
      seen.add(value);
      results.push(value);
    }
  }
  return results;
}

export function normalizeHtmlPreviewVaultPath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return normalizePath(segments.join("/"));
}

export function htmlMiniAppVaultPathAllowed(path: string): boolean {
  const normalized = normalizePath(path.replace(/\\/g, "/")).replace(/^\/+|\/+$/g, "");
  if (!normalized || /^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false;
  const segments = normalized.split("/");
  return !segments.some((segment) => !segment || segment === ".." || segment.startsWith("."));
}

export function htmlMiniAppVaultPath(value: unknown, allowRoot = false): string {
  const raw = typeof value === "string" ? value.trim().replace(/\\/g, "/") : "";
  if (allowRoot && !raw) return "";
  if (!raw || raw.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.split("/").some((segment) => segment === "..")) {
    throw new Error("HTML mini apps require a safe Vault-relative path");
  }
  const normalized = normalizePath(raw).replace(/^\/+|\/+$/g, "");
  if (!htmlMiniAppVaultPathAllowed(normalized)) throw new Error("HTML mini apps cannot access hidden configuration folders");
  return normalized;
}

export function resolveHtmlPreviewVaultPath(sourcePath: string, href: string): string {
  const rawPath = href.trim().split(/[?#]/, 1)[0] ?? "";
  if (!rawPath || /^[a-z][a-z0-9+.-]*:/i.test(rawPath)) return "";
  const decoded = decodeUriComponentSafely(rawPath).replace(/\\/g, "/");
  const combined = decoded.startsWith("/")
    ? decoded.slice(1)
    : `${vaultPathParent(sourcePath)}/${decoded}`;
  return normalizeHtmlPreviewVaultPath(combined);
}

export function obsidianOpenUriFilePath(href: string): string {
  try {
    const url = new URL(href);
    const path = url.searchParams.get("file") || url.searchParams.get("path") || "";
    return path ? normalizeHtmlPreviewVaultPath(decodeUriComponentSafely(path).replace(/^\/+/, "")) : "";
  } catch {
    return "";
  }
}

export function obsidianOpenUriVaultName(href: string): string {
  try {
    return decodeUriComponentSafely(new URL(href).searchParams.get("vault") || "").trim();
  } catch {
    return "";
  }
}

export function resolveHtmlPreviewAssetUrl(app: App, file: TFile, value: string, baseHref = ""): string {
  const raw = value.trim();
  if (!raw || raw.startsWith("#")) return raw;
  if (/^(?:javascript:|file:|data:text\/html)/i.test(raw)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return raw;
  if (/^(?:https?:)?\/\//i.test(baseHref)) {
    try {
      return new URL(raw, baseHref.startsWith("//") ? `https:${baseHref}` : baseHref).href;
    } catch {
      // Fall back to a Vault-relative resource below.
    }
  }
  const match = raw.match(/^([^?#]*)([?#].*)?$/);
  let path = "";
  const localBase = baseHref.trim().split(/[?#]/, 1)[0] ?? "";
  if (localBase && !/^[a-z][a-z0-9+.-]*:/i.test(localBase) && !localBase.startsWith("//")) {
    const basePath = resolveHtmlPreviewVaultPath(file.path, localBase);
    const baseFolder = localBase.endsWith("/") ? basePath : vaultPathParent(basePath);
    const relativePath = decodeUriComponentSafely(match?.[1] ?? raw).replace(/\\/g, "/");
    path = relativePath.startsWith("/")
      ? normalizeHtmlPreviewVaultPath(relativePath.slice(1))
      : normalizeHtmlPreviewVaultPath(`${baseFolder}/${relativePath}`);
  }
  if (!path) path = resolveHtmlPreviewVaultPath(file.path, match?.[1] ?? raw);
  const target = path ? app.vault.getAbstractFileByPath(path) : null;
  return target instanceof TFile ? `${app.vault.getResourcePath(target)}${match?.[2] ?? ""}` : raw;
}

export function rewriteHtmlPreviewCssUrls(app: App, file: TFile, css: string, baseHref = ""): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (full, _quote: string, value: string) => {
    const resolved = resolveHtmlPreviewAssetUrl(app, file, value, baseHref);
    return resolved ? `url("${resolved.replace(/"/g, "%22")}")` : full;
  });
}

export function rewriteHtmlPreviewResources(app: App, file: TFile, parsed: Document, baseHref = ""): void {
  const resourceAttributes: Array<[string, string]> = [
    ["script[src]", "src"],
    ["link[href]", "href"],
    ["img[src]", "src"],
    ["source[src]", "src"],
    ["video[src]", "src"],
    ["video[poster]", "poster"],
    ["audio[src]", "src"],
    ["track[src]", "src"],
    ["iframe[src]", "src"],
    ["object[data]", "data"],
    ["embed[src]", "src"],
    ["input[src]", "src"]
  ];
  for (const [selector, attribute] of resourceAttributes) {
    parsed.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const original = element.getAttribute(attribute) ?? "";
      const resolved = resolveHtmlPreviewAssetUrl(app, file, original, baseHref);
      if (resolved) element.setAttribute(attribute, resolved);
      else element.removeAttribute(attribute);
    });
  }
  parsed.querySelectorAll<HTMLElement>("[srcset]").forEach((element) => {
    const source = element.getAttribute("srcset") ?? "";
    if (!source || /data:/i.test(source)) return;
    const resolved = source.split(",").map((candidate) => {
      const parts = candidate.trim().split(/\s+/);
      const url = parts.shift() ?? "";
      return [resolveHtmlPreviewAssetUrl(app, file, url, baseHref), ...parts].filter(Boolean).join(" ");
    }).filter(Boolean).join(", ");
    if (resolved) element.setAttribute("srcset", resolved);
  });
  parsed.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    element.setAttribute("style", rewriteHtmlPreviewCssUrls(app, file, element.getAttribute("style") ?? "", baseHref));
  });
  parsed.querySelectorAll("style").forEach((element) => {
    element.textContent = rewriteHtmlPreviewCssUrls(app, file, element.textContent ?? "", baseHref);
  });
  if (/^https?:/i.test(baseHref)) {
    parsed.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
      try {
        anchor.setAttribute("href", new URL(href, baseHref).href);
      } catch {
        // The parent bridge reports malformed links only when the user clicks them.
      }
    });
  }
}

export function htmlPreviewAttributes(element: Element, excluded: string[] = []): string {
  const blocked = new Set(excluded.map((name) => name.toLowerCase()));
  return Array.from(element.attributes)
    .filter((attribute) => !blocked.has(attribute.name.toLowerCase()))
    .map((attribute) => ` ${attribute.name}="${escapeHtmlAttribute(attribute.value)}"`)
    .join("");
}

export function standaloneDocumentPreviewHtml(source: string, title: string): string {
  const parsed = new DOMParser().parseFromString(source || "<html><body></body></html>", "text/html");
  parsed.querySelectorAll("script[data-cancip-bootstrap],script[data-cancip-bridge],style[data-cancip-bridge-style],meta[http-equiv='Content-Security-Policy']")
    .forEach((element) => element.remove());
  parsed.querySelectorAll<HTMLElement>("[contenteditable],[data-cancip-active],[data-cancip-drop]").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("data-cancip-active");
    element.removeAttribute("data-cancip-drop");
  });
  const titleElement = parsed.querySelector("title") ?? parsed.head.appendChild(parsed.createElement("title"));
  titleElement.textContent = title;
  return `<!doctype html>\n${parsed.documentElement.outerHTML}\n`;
}

export function normalizeHtmlPreviewEditText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function replaceHtmlRenderedTextRange(
  source: string,
  selector: string,
  startOffset: number,
  endOffset: number,
  expectedText: string,
  replacementText: string
): string | null {
  if (!selector.trim() || !Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0 || endOffset < startOffset) return null;
  const parsed = new DOMParser().parseFromString(source || "<p></p>", "text/html");
  let element: Element | null = null;
  try {
    element = parsed.querySelector(selector);
  } catch {
    return null;
  }
  if (!element) return null;
  const textNodes: Text[] = [];
  const walker = parsed.createTreeWalker(element, 4);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === 3) textNodes.push(current as Text);
    current = walker.nextNode();
  }
  const fullText = element.textContent ?? "";
  if (startOffset > fullText.length || endOffset > fullText.length || fullText.slice(startOffset, endOffset) !== expectedText) return null;
  if (!textNodes.length) {
    const text = parsed.createTextNode("");
    element.appendChild(text);
    textNodes.push(text);
  }
  const pointAt = (offset: number): { node: Text; offset: number } => {
    let consumed = 0;
    for (const node of textNodes) {
      const end = consumed + node.data.length;
      if (offset <= end) return { node, offset: Math.max(0, offset - consumed) };
      consumed = end;
    }
    const last = textNodes[textNodes.length - 1];
    return { node: last, offset: last.data.length };
  };
  const start = pointAt(startOffset);
  const end = pointAt(endOffset);
  const range = parsed.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();
  if (replacementText) range.insertNode(parsed.createTextNode(replacementText));
  const doctype = source.match(/^\s*(<!doctype[^>]*>)/i)?.[1] ?? "<!doctype html>";
  return `${doctype}\n${parsed.documentElement.outerHTML}`;
}

export function htmlToMarkdown(source: string, fallbackTitle: string): string {
  const parsed = new DOMParser().parseFromString(source || "", "text/html");
  parsed.querySelectorAll("script,style,noscript,svg,canvas,form,button,input,textarea,select").forEach((node) => node.remove());
  const title = normalizeExtractedText(parsed.querySelector("title")?.textContent || fallbackTitle);
  const blocks = Array.from(parsed.body.childNodes).map((node) => htmlNodeToMarkdown(node, 0)).filter(Boolean).join("\n\n");
  const normalized = normalizeMarkdownDocument(blocks);
  return normalized.startsWith("# ") ? normalized : `# ${escapeMarkdownText(title || fallbackTitle)}${normalized ? `\n\n${normalized}` : ""}`;
}

export function htmlNodeToMarkdown(node: Node, listDepth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (!node.instanceOf(Element)) return "";
  const tag = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag.slice(1)))} ${inlineHtmlChildren(node, listDepth).trim()}`;
  if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "header" || tag === "footer") {
    return inlineHtmlChildren(node, listDepth).trim();
  }
  if (tag === "br") return "\n";
  if (tag === "hr") return "---";
  if (tag === "strong" || tag === "b") return `**${inlineHtmlChildren(node, listDepth).trim()}**`;
  if (tag === "em" || tag === "i") return `*${inlineHtmlChildren(node, listDepth).trim()}*`;
  if (tag === "del" || tag === "s") return `~~${inlineHtmlChildren(node, listDepth).trim()}~~`;
  if (tag === "code" && node.parentElement?.tagName.toLowerCase() !== "pre") return `\`${(node.textContent ?? "").replace(/`/g, "\\`")}\``;
  if (tag === "pre") return `\`\`\`\n${(node.textContent ?? "").trim()}\n\`\`\``;
  if (tag === "blockquote") return inlineHtmlChildren(node, listDepth).trim().split(/\r?\n/).map((line) => `> ${line}`).join("\n");
  if (tag === "a") {
    const text = inlineHtmlChildren(node, listDepth).trim() || node.getAttribute("href") || "link";
    const href = node.getAttribute("href") || "";
    return href && !/^javascript:/i.test(href) ? `[${text}](${href})` : text;
  }
  if (tag === "img") {
    const alt = node.getAttribute("alt") || "image";
    const src = node.getAttribute("src") || "";
    return src && !/^javascript:/i.test(src) ? `![${alt}](${src})` : alt;
  }
  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    return Array.from(node.children).filter((child) => child.tagName.toLowerCase() === "li").map((child, index) => {
      const prefix = ordered ? `${index + 1}.` : "-";
      const text = inlineHtmlChildren(child, listDepth + 1).trim().replace(/\n{2,}/g, "\n");
      return `${"  ".repeat(listDepth)}${prefix} ${text}`;
    }).join("\n");
  }
  if (tag === "table") return htmlTableToMarkdown(node);
  return inlineHtmlChildren(node, listDepth).trim();
}

export function inlineHtmlChildren(element: Element, listDepth: number): string {
  return Array.from(element.childNodes).map((child) => htmlNodeToMarkdown(child, listDepth)).join("");
}

export function htmlTableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) => Array.from(row.querySelectorAll(":scope > th, :scope > td")).map((cell) => normalizeExtractedText(cell.textContent ?? "")));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_unused, index) => row[index] ?? ""));
  return markdownTable(normalized[0], normalized.slice(1));
}

export function normalizeMarkdownDocument(source: string): string {
  return source
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractMhtmlHtml(source: string, warnings: string[]): string {
  const headerEnd = source.search(/\r?\n\r?\n/);
  const topHeaders = parseMimeHeaders(headerEnd >= 0 ? source.slice(0, headerEnd) : source);
  const boundaryMatch = topHeaders["content-type"]?.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2] || "";
  if (!boundary) {
    warnings.push("MHTML boundary was not found; using the visible HTML body only.");
    const htmlIndex = source.search(/<(?:!doctype\s+html|html|body)\b/i);
    return htmlIndex >= 0 ? source.slice(htmlIndex) : source;
  }
  const assets = new Map<string, string>();
  let html = "";
  for (const rawPart of source.split(`--${boundary}`)) {
    const split = rawPart.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const headers = parseMimeHeaders(rawPart.slice(0, split));
    const body = rawPart.slice(split).replace(/^\r?\n\r?\n/, "").replace(/\r?\n$/, "");
    const contentType = headers["content-type"] || "text/plain";
    const encoding = headers["content-transfer-encoding"] || "";
    const location = headers["content-location"] || "";
    const contentId = (headers["content-id"] || "").replace(/[<>]/g, "");
    if (/text\/html/i.test(contentType) && !html) {
      html = decodeMimeTextBody(body, encoding, contentType);
      continue;
    }
    if (/^(?:image|audio|video)\//i.test(contentType)) {
      const mime = contentType.split(";")[0].trim();
      const base64 = encoding.toLowerCase().includes("base64")
        ? body.replace(/\s+/g, "")
        : bytesToBase64(quotedPrintableBytes(body));
      const dataUrl = `data:${mime};base64,${base64}`;
      if (location) assets.set(location, dataUrl);
      if (contentId) assets.set(`cid:${contentId}`, dataUrl);
    }
  }
  if (!html) {
    warnings.push("MHTML did not contain a text/html part.");
    return "";
  }
  for (const [sourceUrl, dataUrl] of assets) html = html.split(sourceUrl).join(dataUrl);
  return html;
}

export function parseMimeHeaders(source: string): Record<string, string> {
  const unfolded = source.replace(/\r?\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return headers;
}

export function decodeMimeTextBody(body: string, encoding: string, contentType: string): string {
  const charset = contentType.match(/charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)?.slice(1).find(Boolean) || "utf-8";
  try {
    if (/base64/i.test(encoding)) return new TextDecoder(charset).decode(base64ToBytes(body.replace(/\s+/g, "")));
    if (/quoted-printable/i.test(encoding)) return new TextDecoder(charset).decode(quotedPrintableBytes(body));
  } catch {
    // Fall through to the raw body when a WebView lacks the declared charset.
  }
  return body;
}

export function quotedPrintableBytes(source: string): Uint8Array {
  const unfolded = source.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < unfolded.length; index += 1) {
    if (unfolded[index] === "=" && /^[0-9a-f]{2}$/i.test(unfolded.slice(index + 1, index + 3))) {
      bytes.push(parseInt(unfolded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      const encoded = new TextEncoder().encode(unfolded[index]);
      bytes.push(...encoded);
    }
  }
  return new Uint8Array(bytes);
}

export function base64ToBytes(source: string): Uint8Array {
  const binary = atob(source);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

export type EpubManifestItem = {
  id: string;
  path: string;
  mediaType: string;
  properties: string;
};

export function resolvePackagedDocumentPath(basePath: string, reference: string): string {
  const cleanReference = decodeUriComponentSafely(reference.split("#", 1)[0].split("?", 1)[0]).replace(/\\/g, "/").trim();
  if (!cleanReference || /^[a-z][a-z0-9+.-]*:/i.test(cleanReference) || cleanReference.startsWith("//")) return "";
  const baseParts = normalizeDocumentArchiveEntryPath(basePath).split("/").filter(Boolean);
  baseParts.pop();
  for (const part of cleanReference.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!baseParts.length) return "";
      baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }
  return normalizeDocumentArchiveEntryPath(baseParts.join("/"));
}

export function documentPreviewSelectorFor(element: Element, boundary: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== boundary) {
    const tag = current.tagName.toLowerCase();
    let index = 1;
    for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (sibling.tagName === current.tagName) index += 1;
    }
    parts.unshift(`${tag}:nth-of-type(${index})`);
    current = current.parentElement;
  }
  if (boundary.tagName.toLowerCase() === "body") return parts.length ? `body>${parts.join(">")}` : "body";
  return parts.join(">");
}

export type OfficePreviewLayerModel = {
  widthPt: number;
  heightPt: number;
  pages: string[];
};

export function documentPreviewSourceAttributes(
  locator: DocumentPreviewSourceLocator,
  moveRoot = false,
  editedLocatorKeys: ReadonlySet<string> = new Set()
): string {
  const attributes: Array<[string, string]> = [];
  if (locator.selector) attributes.push(["data-cancip-source-selector", locator.selector]);
  if (locator.entryPath) attributes.push(["data-cancip-source-entry", locator.entryPath]);
  if (locator.officePart) attributes.push(["data-cancip-office-part", locator.officePart]);
  if (locator.officeTag) attributes.push(["data-cancip-office-tag", locator.officeTag]);
  if (Number.isInteger(locator.officeIndex)) attributes.push(["data-cancip-office-index", String(locator.officeIndex)]);
  if (locator.officeMoveTag) attributes.push(["data-cancip-office-move-tag", locator.officeMoveTag]);
  if (Number.isInteger(locator.officeMoveIndex)) attributes.push(["data-cancip-office-move-index", String(locator.officeMoveIndex)]);
  if (moveRoot) attributes.push(["data-cancip-move-root", "true"]);
  if ([officePreviewLocatorKey(locator, "text"), officePreviewLocatorKey(locator, "move")].some((key) => key && editedLocatorKeys.has(key))) {
    attributes.push(["data-cancip-persisted-edit", "true"]);
  }
  return attributes.map(([name, value]) => ` ${name}="${escapeHtmlAttribute(value)}"`).join("");
}

export function officePreviewToggle(element: Element | null, attribute = "val"): boolean {
  if (!element) return false;
  const value = officeAttribute(element, attribute).trim().toLowerCase();
  return !value || !["0", "false", "none", "off"].includes(value);
}

export function officePreviewAttributeToggle(element: Element | null, attribute: string): boolean {
  if (!element) return false;
  const match = Array.from(element.attributes).find((candidate) => candidate.localName === attribute || candidate.name === attribute);
  if (!match) return false;
  return !["0", "false", "none", "off"].includes(match.value.trim().toLowerCase());
}

export function officePreviewRunHtml(run: Element, kind: "docx" | "pptx", pageWidthPt: number): string {
  const text = descendantsByLocalName(run, "t").map((element) => element.textContent ?? "").join("");
  const tabs = descendantsByLocalName(run, "tab").length ? "\t" : "";
  const breaks = descendantsByLocalName(run, "br").length;
  if (!text && !tabs && !breaks) return "";
  const properties = firstDescendantByLocalName(run, "rPr");
  const rawSize = Number(officeAttribute(properties, "sz"));
  const fontPt = rawSize > 0 ? (kind === "pptx" ? rawSize / 100 : rawSize / 2) : 0;
  const bold = kind === "pptx" ? officePreviewAttributeToggle(properties, "b") : officePreviewToggle(firstDescendantByLocalName(properties, "b"));
  const italic = kind === "pptx" ? officePreviewAttributeToggle(properties, "i") : officePreviewToggle(firstDescendantByLocalName(properties, "i"));
  const strike = kind === "pptx"
    ? /strike/i.test(officeAttribute(properties, "strike"))
    : officePreviewToggle(firstDescendantByLocalName(properties, "strike"));
  const underline = kind === "pptx"
    ? !["", "none"].includes(officeAttribute(properties, "u").toLowerCase())
    : officePreviewToggle(firstDescendantByLocalName(properties, "u"));
  const rawColor = kind === "pptx"
    ? officeAttribute(firstDescendantByLocalName(properties, "srgbClr"), "val")
    : officeAttribute(firstDescendantByLocalName(properties, "color"), "val");
  const styles = [
    fontPt > 0 ? `font-size:${Math.max(0.5, fontPt / Math.max(1, pageWidthPt) * 100).toFixed(4)}cqw` : "",
    bold ? "font-weight:700" : "",
    italic ? "font-style:italic" : "",
    strike || underline ? `text-decoration:${[strike ? "line-through" : "", underline ? "underline" : ""].filter(Boolean).join(" ")}` : "",
    /^[0-9a-f]{6}$/i.test(rawColor) ? `color:#${rawColor}` : ""
  ].filter(Boolean).join(";");
  return `<span${styles ? ` style="${escapeHtmlAttribute(styles)}"` : ""}>${escapeHtml(`${text}${tabs}`)}${"<br>".repeat(breaks)}</span>`;
}

export function nearestAncestorByLocalName(element: Element, localName: string): Element | null {
  let current = element.parentElement;
  while (current) {
    if (current.localName === localName) return current;
    current = current.parentElement;
  }
  return null;
}

export function officePreviewParagraphHtml(paragraph: Element, kind: "docx" | "pptx", pageWidthPt: number): string {
  const runs = descendantsByLocalName(paragraph, "r").filter((run) => (
    descendantsByLocalName(run, "r").length === 0
    && nearestAncestorByLocalName(run, "p") === paragraph
  ));
  const html = runs.map((run) => officePreviewRunHtml(run, kind, pageWidthPt)).join("");
  return html || escapeHtml(descendantsByLocalName(paragraph, "t")
    .filter((element) => nearestAncestorByLocalName(element, "p") === paragraph)
    .map((element) => element.textContent ?? "")
    .join(""));
}

export function pptxPreviewDimensions(document: Document | null): { widthPt: number; heightPt: number; widthEmu: number; heightEmu: number } {
  const size = document ? firstDescendantByLocalName(document, "sldSz") : null;
  const widthEmu = Math.max(1, Number(officeAttribute(size, "cx")) || 12_192_000);
  const heightEmu = Math.max(1, Number(officeAttribute(size, "cy")) || 6_858_000);
  return { widthPt: widthEmu / 12_700, heightPt: heightEmu / 12_700, widthEmu, heightEmu };
}

export async function buildPptxPreviewLayers(
  entries: ZipEntry[],
  bytes: Uint8Array,
  warnings: string[],
  displayWidthPt = 0,
  displayHeightPt = 0,
  editedLocatorKeys: ReadonlySet<string> = new Set()
): Promise<OfficePreviewLayerModel> {
  const presentationEntry = entries.find((entry) => entry.name === "ppt/presentation.xml");
  const presentation = presentationEntry
    ? parseOfficeXml(await extractZipEntryText(presentationEntry, bytes, warnings), warnings, presentationEntry.name)
    : null;
  const dimensions = pptxPreviewDimensions(presentation);
  const widthPt = displayWidthPt > 0 ? displayWidthPt : dimensions.widthPt;
  const heightPt = displayHeightPt > 0 ? displayHeightPt : dimensions.heightPt;
  const slideEntries = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((left, right) => naturalNameNumber(left.name) - naturalNameNumber(right.name));
  const pages: string[] = [];
  for (const entry of slideEntries) {
    const parsed = parseOfficeXml(await extractZipEntryText(entry, bytes, warnings), warnings, entry.name);
    const shapes = descendantsByLocalName(parsed, "sp");
    const paragraphs = descendantsByLocalName(parsed, "p");
    const paragraphIndexes = new Map(paragraphs.map((paragraph, index) => [paragraph, index]));
    const blocks: string[] = [];
    for (const [shapeIndex, shape] of shapes.entries()) {
      const textParagraphs = descendantsByLocalName(shape, "p").filter((paragraph) => normalizeExtractedText(paragraph.textContent ?? ""));
      if (!textParagraphs.length) continue;
      const transform = firstDescendantByLocalName(shape, "xfrm");
      const offset = firstDescendantByLocalName(transform, "off");
      const extent = firstDescendantByLocalName(transform, "ext");
      const x = Number(officeAttribute(offset, "x")) || 0;
      const y = Number(officeAttribute(offset, "y")) || 0;
      const width = Math.max(1, Number(officeAttribute(extent, "cx")) || dimensions.widthEmu);
      const height = Math.max(1, Number(officeAttribute(extent, "cy")) || 250_000);
      const shapeStyle = [
        "position:absolute",
        `left:${(x / dimensions.widthEmu * 100).toFixed(5)}%`,
        `top:${(y / dimensions.heightEmu * 100).toFixed(5)}%`,
        `width:${(width / dimensions.widthEmu * 100).toFixed(5)}%`,
        `min-height:${(height / dimensions.heightEmu * 100).toFixed(5)}%`,
        "line-height:1.12",
        "overflow:visible"
      ].join(";");
      const moveLocator: DocumentPreviewSourceLocator = {
        officePart: entry.name,
        officeMoveTag: "sp",
        officeMoveIndex: shapeIndex
      };
      const paragraphHtml = textParagraphs.map((paragraph) => {
        const paragraphIndex = paragraphIndexes.get(paragraph);
        if (paragraphIndex === undefined) return "";
        const properties = firstDescendantByLocalName(paragraph, "pPr");
        const alignment = officeAttribute(properties, "algn").toLowerCase();
        const textAlign = alignment === "ctr" ? "center" : alignment === "r" ? "right" : alignment === "just" ? "justify" : "left";
        const locator: DocumentPreviewSourceLocator = {
          officePart: entry.name,
          officeTag: "p",
          officeIndex: paragraphIndex,
          officeMoveTag: "sp",
          officeMoveIndex: shapeIndex
        };
        return `<div class="cancip-office-text-block"${documentPreviewSourceAttributes(locator, false, editedLocatorKeys)} style="text-align:${textAlign};min-height:1em">${officePreviewParagraphHtml(paragraph, "pptx", widthPt)}</div>`;
      }).join("");
      blocks.push(`<div class="cancip-office-shape"${documentPreviewSourceAttributes(moveLocator, true, editedLocatorKeys)} style="${shapeStyle}">${paragraphHtml}</div>`);
    }
    pages.push(blocks.join(""));
  }
  return { widthPt, heightPt, pages };
}

export function docxPreviewDimensions(document: Document | null): {
  widthPt: number;
  heightPt: number;
  widthTwips: number;
  heightTwips: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
} {
  const section = document ? descendantsByLocalName(document, "sectPr").at(-1) ?? null : null;
  const size = firstDescendantByLocalName(section, "pgSz")
    ?? (document ? descendantsByLocalName(document, "pgSz").at(-1) ?? null : null);
  const margins = firstDescendantByLocalName(section, "pgMar")
    ?? (document ? descendantsByLocalName(document, "pgMar").at(-1) ?? null : null);
  const widthTwips = Math.max(1, Number(officeAttribute(size, "w")) || 12_240);
  const heightTwips = Math.max(1, Number(officeAttribute(size, "h")) || 15_840);
  const boundedMargin = (value: string, pageSize: number): number => Math.max(0, Math.min(pageSize - 1, Number(value) || 0));
  return {
    widthPt: widthTwips / 20,
    heightPt: heightTwips / 20,
    widthTwips,
    heightTwips,
    marginTop: boundedMargin(officeAttribute(margins, "top"), heightTwips),
    marginRight: boundedMargin(officeAttribute(margins, "right"), widthTwips),
    marginBottom: boundedMargin(officeAttribute(margins, "bottom"), heightTwips),
    marginLeft: boundedMargin(officeAttribute(margins, "left"), widthTwips)
  };
}

export function docxPreviewParagraphMetrics(paragraph: Element, pageWidthTwips: number): {
  before: number;
  after: number;
  line: number;
  left: number;
  width: number;
  textAlign: string;
} {
  const properties = firstDescendantByLocalName(paragraph, "pPr");
  const spacing = firstDescendantByLocalName(properties, "spacing");
  const indent = firstDescendantByLocalName(properties, "ind");
  const maximumHalfPoints = descendantsByLocalName(paragraph, "sz")
    .filter((element) => nearestAncestorByLocalName(element, "p") === paragraph)
    .reduce((maximum, element) => Math.max(maximum, Number(officeAttribute(element, "val")) || 0), 0);
  const line = Math.max(220, Number(officeAttribute(spacing, "line")) || maximumHalfPoints * 12 || 280);
  const left = Math.max(0, Number(officeAttribute(indent, "left")) || 0);
  const right = Math.max(0, Number(officeAttribute(indent, "right")) || 0);
  const alignment = officeAttribute(firstDescendantByLocalName(properties, "jc"), "val").toLowerCase();
  return {
    before: Math.max(0, Number(officeAttribute(spacing, "before")) || 0),
    after: Math.max(0, Number(officeAttribute(spacing, "after")) || 0),
    line,
    left,
    width: Math.max(240, pageWidthTwips - left - right),
    textAlign: alignment === "center" ? "center" : alignment === "right" ? "right" : alignment === "both" ? "justify" : "left"
  };
}

export function docxPreviewEstimatedTextWidthTwips(paragraph: Element): number {
  return descendantsByLocalName(paragraph, "r")
    .filter((run) => descendantsByLocalName(run, "r").length === 0 && nearestAncestorByLocalName(run, "p") === paragraph)
    .reduce((total, run) => {
      const properties = firstDescendantByLocalName(run, "rPr");
      const halfPoints = Math.max(12, Number(officeAttribute(firstDescendantByLocalName(properties, "sz"), "val")) || 22);
      const emTwips = halfPoints * 10;
      const text = descendantsByLocalName(run, "t").map((element) => element.textContent ?? "").join("");
      const textWidth = Array.from(text).reduce((width, character) => {
        if (/\s/u.test(character)) return width + emTwips * 0.34;
        if (/[^\u0000-\u00ff]/u.test(character)) return width + emTwips;
        if (/[ilI.,'`:;|!]/u.test(character)) return width + emTwips * 0.3;
        if (/[MW@#%&]/u.test(character)) return width + emTwips * 0.86;
        return width + emTwips * 0.54;
      }, 0);
      const tabsWidth = descendantsByLocalName(run, "tab").length * emTwips * 4;
      return total + textWidth + tabsWidth;
    }, 0);
}

export function docxPreviewInlineHeightTwips(paragraph: Element): number {
  return descendantsByLocalName(paragraph, "inline")
    .filter((inline) => nearestAncestorByLocalName(inline, "p") === paragraph)
    .reduce((maximum, inline) => {
      const extent = firstDescendantByLocalName(inline, "extent");
      return Math.max(maximum, Math.max(0, Number(officeAttribute(extent, "cy")) || 0) / 635);
    }, 0);
}

export function docxPreviewParagraphFlowHeight(paragraph: Element, metrics: ReturnType<typeof docxPreviewParagraphMetrics>): number {
  const text = normalizeExtractedText(descendantsByLocalName(paragraph, "t")
    .filter((element) => nearestAncestorByLocalName(element, "p") === paragraph)
    .map((element) => element.textContent ?? "")
    .join(""));
  const explicitBreaks = descendantsByLocalName(paragraph, "br").filter((element) => (
    nearestAncestorByLocalName(element, "p") === paragraph && officeAttribute(element, "type") !== "page"
  )).length;
  const estimatedTextWidth = docxPreviewEstimatedTextWidthTwips(paragraph);
  const wrappedLines = text ? Math.max(1, Math.ceil(estimatedTextWidth / Math.max(240, metrics.width))) : 0;
  const textLines = text || explicitBreaks ? Math.max(explicitBreaks + 1, wrappedLines) : 0;
  const inlineHeight = docxPreviewInlineHeightTwips(paragraph);
  return Math.max(textLines * metrics.line, inlineHeight);
}

export function docxPreviewTableHeightTwips(table: Element, contentWidthTwips: number): number {
  const rows = childElementsByLocalName(table, "tr");
  if (!rows.length) return 360;
  return rows.reduce((total, row) => {
    const cells = childElementsByLocalName(row, "tc");
    const fallbackCellWidth = Math.max(240, contentWidthTwips / Math.max(1, cells.length));
    const contentHeight = cells.reduce((maximum, cell) => {
      const widthElement = firstDescendantByLocalName(firstDescendantByLocalName(cell, "tcPr"), "tcW");
      const cellWidth = officeAttribute(widthElement, "type") === "dxa"
        ? Math.max(240, Number(officeAttribute(widthElement, "w")) || fallbackCellWidth)
        : fallbackCellWidth;
      const height = childElementsByLocalName(cell, "p").reduce((sum, paragraph) => {
        const metrics = docxPreviewParagraphMetrics(paragraph, cellWidth);
        const flowHeight = docxPreviewParagraphFlowHeight(paragraph, metrics);
        return sum + (flowHeight > 0 ? metrics.before + flowHeight + metrics.after : 0);
      }, 0);
      return Math.max(maximum, height);
    }, 0);
    const rowHeightElement = firstDescendantByLocalName(firstDescendantByLocalName(row, "trPr"), "trHeight");
    const declaredHeight = Math.max(0, Number(officeAttribute(rowHeightElement, "val")) || 0);
    return total + Math.max(360, declaredHeight, contentHeight + 80);
  }, 0);
}

export async function buildDocxPreviewLayers(
  entries: ZipEntry[],
  bytes: Uint8Array,
  warnings: string[],
  displayWidthPt = 0,
  displayHeightPt = 0,
  editedLocatorKeys: ReadonlySet<string> = new Set()
): Promise<OfficePreviewLayerModel> {
  const entry = entries.find((candidate) => candidate.name === "word/document.xml");
  if (!entry) return { widthPt: displayWidthPt || 612, heightPt: displayHeightPt || 792, pages: [] };
  const parsed = parseOfficeXml(await extractZipEntryText(entry, bytes, warnings), warnings, entry.name);
  const dimensions = docxPreviewDimensions(parsed);
  const widthPt = displayWidthPt > 0 ? displayWidthPt : dimensions.widthPt;
  const heightPt = displayHeightPt > 0 ? displayHeightPt : dimensions.heightPt;
  const pageWidthTwips = dimensions.widthTwips;
  const pageHeightTwips = dimensions.heightTwips;
  const contentWidthTwips = Math.max(240, pageWidthTwips - dimensions.marginLeft - dimensions.marginRight);
  const contentBottomTwips = Math.max(dimensions.marginTop + 1, pageHeightTwips - dimensions.marginBottom);
  const body = firstDescendantByLocalName(parsed, "body");
  const allParagraphs = descendantsByLocalName(parsed, "p");
  const paragraphIndexes = new Map(allParagraphs.map((paragraph, index) => [paragraph, index]));
  const allTables = descendantsByLocalName(parsed, "tbl");
  const tableIndexes = new Map(allTables.map((table, index) => [table, index]));
  const allAnchors = descendantsByLocalName(parsed, "anchor");
  const anchorIndexes = new Map(allAnchors.map((anchor, index) => [anchor, index]));
  const pageWidthEmu = pageWidthTwips * 635;
  const pageHeightEmu = pageHeightTwips * 635;
  const pageBlocks: string[][] = [[]];
  const pageHasFlowLayout: boolean[] = [false];
  let pageIndex = 0;
  let cursorY = dimensions.marginTop;
  let positionedAnchorCount = 0;
  let hasFlowContent = false;
  let hasExplicitPageBoundary = false;
  const nextPage = (): void => {
    if (!pageBlocks[pageIndex].length && !pageHasFlowLayout[pageIndex] && pageIndex > 0) return;
    pageIndex += 1;
    pageBlocks[pageIndex] = [];
    pageHasFlowLayout[pageIndex] = false;
    cursorY = dimensions.marginTop;
  };
  for (const child of Array.from(body?.children ?? [])) {
    if (child.localName === "p") {
      const paragraphIndex = paragraphIndexes.get(child);
      const childAnchors = descendantsByLocalName(child, "anchor");
      const html = childAnchors.length ? "" : officePreviewParagraphHtml(child, "docx", widthPt);
      const metrics = docxPreviewParagraphMetrics(child, contentWidthTwips);
      const flowHeight = docxPreviewParagraphFlowHeight(child, metrics);
      const hasPageBreak = descendantsByLocalName(child, "br").some((element) => (
        officeAttribute(element, "type") === "page"
        && nearestAncestorByLocalName(element, "p") === child
      ));
      if (hasPageBreak && cursorY > dimensions.marginTop) {
        hasExplicitPageBoundary = true;
        nextPage();
      }
      for (const anchor of childAnchors) {
        const anchorIndex = anchorIndexes.get(anchor);
        const textBox = firstDescendantByLocalName(anchor, "txbxContent");
        const textParagraphs = textBox
          ? descendantsByLocalName(textBox, "p").filter((paragraph) => normalizeExtractedText(paragraph.textContent ?? ""))
          : [];
        if (anchorIndex === undefined || !textParagraphs.length) continue;
        positionedAnchorCount += 1;
        const horizontal = childElementsByLocalName(anchor, "positionH")[0] ?? null;
        const vertical = childElementsByLocalName(anchor, "positionV")[0] ?? null;
        const extent = childElementsByLocalName(anchor, "extent")[0] ?? null;
        const x = Number(firstDescendantByLocalName(horizontal, "posOffset")?.textContent ?? 0);
        const y = Number(firstDescendantByLocalName(vertical, "posOffset")?.textContent ?? 0);
        const anchorWidth = Math.max(1, Number(officeAttribute(extent, "cx")) || pageWidthEmu);
        const anchorHeight = Math.max(1, Number(officeAttribute(extent, "cy")) || 250_000);
        const moveLocator: DocumentPreviewSourceLocator = {
          officePart: entry.name,
          officeMoveTag: "anchor",
          officeMoveIndex: anchorIndex
        };
        const anchorStyle = [
          "position:absolute",
          `left:${Math.max(0, x / pageWidthEmu * 100).toFixed(5)}%`,
          `top:${Math.max(0, y / pageHeightEmu * 100).toFixed(5)}%`,
          `width:${Math.min(100, anchorWidth / pageWidthEmu * 100).toFixed(5)}%`,
          `min-height:${Math.min(100, anchorHeight / pageHeightEmu * 100).toFixed(5)}%`,
          "line-height:1.12",
          "overflow:visible"
        ].join(";");
        const paragraphHtml = textParagraphs.map((textParagraph) => {
          const textParagraphIndex = paragraphIndexes.get(textParagraph);
          if (textParagraphIndex === undefined) return "";
          const paragraphMetrics = docxPreviewParagraphMetrics(textParagraph, contentWidthTwips);
          const locator: DocumentPreviewSourceLocator = {
            officePart: entry.name,
            officeTag: "p",
            officeIndex: textParagraphIndex,
            officeMoveTag: "anchor",
            officeMoveIndex: anchorIndex
          };
          return `<div class="cancip-office-text-block"${documentPreviewSourceAttributes(locator, false, editedLocatorKeys)} style="text-align:${paragraphMetrics.textAlign};min-height:1em">${officePreviewParagraphHtml(textParagraph, "docx", widthPt)}</div>`;
        }).join("");
        pageBlocks[pageIndex].push(`<div class="cancip-office-shape cancip-office-anchor"${documentPreviewSourceAttributes(moveLocator, true, editedLocatorKeys)} style="${anchorStyle}">${paragraphHtml}</div>`);
      }
      const top = cursorY + metrics.before;
      if (flowHeight > 0 && top + flowHeight > contentBottomTwips && cursorY > dimensions.marginTop) nextPage();
      const resolvedTop = cursorY + metrics.before;
      if (html && paragraphIndex !== undefined) {
        hasFlowContent = true;
        const locator: DocumentPreviewSourceLocator = {
          officePart: entry.name,
          officeTag: "p",
          officeIndex: paragraphIndex,
          officeMoveTag: "p",
          officeMoveIndex: paragraphIndex
        };
        const style = [
          "position:absolute",
          `left:${((dimensions.marginLeft + metrics.left) / pageWidthTwips * 100).toFixed(5)}%`,
          `top:${(resolvedTop / pageHeightTwips * 100).toFixed(5)}%`,
          `width:${Math.min(100, metrics.width / pageWidthTwips * 100).toFixed(5)}%`,
          `min-height:${(Math.max(metrics.line, flowHeight) / pageHeightTwips * 100).toFixed(5)}%`,
          `text-align:${metrics.textAlign}`,
          `line-height:${Math.max(1, metrics.line / Math.max(1, descendantsByLocalName(child, "sz")
            .filter((element) => nearestAncestorByLocalName(element, "p") === child)
            .reduce((maximum, element) => Math.max(maximum, Number(officeAttribute(element, "val")) * 10 || 0), 0) || metrics.line)).toFixed(3)}`
        ].join(";");
        pageBlocks[pageIndex].push(`<div class="cancip-office-text-block"${documentPreviewSourceAttributes(locator, true, editedLocatorKeys)} style="${style}">${html}</div>`);
      }
      if (flowHeight > 0) {
        pageHasFlowLayout[pageIndex] = true;
        cursorY = resolvedTop + flowHeight + metrics.after;
      }
      if (firstDescendantByLocalName(child, "sectPr")) {
        hasExplicitPageBoundary = true;
        nextPage();
      }
      continue;
    }
    if (child.localName !== "tbl") continue;
    const tableIndex = tableIndexes.get(child);
    const rows = childElementsByLocalName(child, "tr");
    const estimatedHeight = docxPreviewTableHeightTwips(child, contentWidthTwips);
    if (cursorY + estimatedHeight > contentBottomTwips && cursorY > dimensions.marginTop) nextPage();
    if (tableIndex === undefined) continue;
    const moveLocator: DocumentPreviewSourceLocator = { officePart: entry.name, officeMoveTag: "tbl", officeMoveIndex: tableIndex };
    const tableHtml = rows.map((row) => `<tr>${childElementsByLocalName(row, "tc").map((cell) => `<td>${childElementsByLocalName(cell, "p").map((paragraph) => {
      const paragraphIndex = paragraphIndexes.get(paragraph);
      if (paragraphIndex === undefined) return "";
      const locator: DocumentPreviewSourceLocator = { officePart: entry.name, officeTag: "p", officeIndex: paragraphIndex, officeMoveTag: "tbl", officeMoveIndex: tableIndex };
      return `<div class="cancip-office-text-block"${documentPreviewSourceAttributes(locator, false, editedLocatorKeys)}>${officePreviewParagraphHtml(paragraph, "docx", widthPt)}</div>`;
    }).join("")}</td>`).join("")}</tr>`).join("");
    const style = `position:absolute;left:${(dimensions.marginLeft / pageWidthTwips * 100).toFixed(5)}%;top:${(cursorY / pageHeightTwips * 100).toFixed(5)}%;width:${(contentWidthTwips / pageWidthTwips * 100).toFixed(5)}%;min-height:${(estimatedHeight / pageHeightTwips * 100).toFixed(5)}%`;
    pageBlocks[pageIndex].push(`<table class="cancip-office-preview-table"${documentPreviewSourceAttributes(moveLocator, true, editedLocatorKeys)} style="${style}">${tableHtml}</table>`);
    pageHasFlowLayout[pageIndex] = true;
    cursorY += estimatedHeight;
  }
  while (pageBlocks.length > 1 && !pageBlocks.at(-1)?.length) pageBlocks.pop();
  const pages = positionedAnchorCount > 0 && !hasFlowContent && !hasExplicitPageBoundary
    ? [pageBlocks.flat().join("")]
    : pageBlocks.map((blocks) => blocks.join(""));
  return { widthPt, heightPt, pages };
}

export function officePreviewPagesHtml(model: OfficePreviewLayerModel, images: string[] = []): string {
  const pageCount = Math.max(model.pages.length, images.length);
  if (!pageCount) return "";
  const pages = Array.from({ length: pageCount }, (_unused, index) => {
    const image = images[index] ?? "";
    const layerClass = image ? "cancip-office-text-layer is-overlay" : "cancip-office-text-layer is-structured";
    return `<section class="cancip-mpe-office-page${image ? " has-original-image" : " is-structured"}">${image}${model.pages[index] ? `<div class="${layerClass}">${model.pages[index]}</div>` : ""}</section>`;
  });
  return `<main class="cancip-mpe-office-pages" style="--mpe-page-ratio:${model.widthPt}/${model.heightPt}">${pages.join("")}</main><style data-cancip-office-native-preview>.cancip-mpe-office-pages{display:grid;gap:18px;width:100%;padding:16px;margin:0;background:#edf0f5}.cancip-mpe-office-page{position:relative;container-type:inline-size;width:min(100%,960px);aspect-ratio:var(--mpe-page-ratio);margin:0 auto;background:#fff;color:#111;overflow:visible;box-shadow:0 4px 18px rgba(0,0,0,.16)}.cancip-mpe-office-page>img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}.cancip-office-text-layer.is-structured{overflow:hidden}.cancip-office-shape{white-space:pre-wrap}.cancip-office-preview-table{border-collapse:collapse;background:rgba(255,255,255,.96);font-size:2.5cqw}.cancip-office-preview-table td{border:1px solid #777;padding:.25em .4em;vertical-align:top}@media(max-width:600px){.cancip-mpe-office-pages{gap:10px;padding:8px}}</style>`;
}

export async function officeStructuredPreviewHtml(
  entries: ZipEntry[],
  bytes: Uint8Array,
  warnings: string[],
  kind: DocumentFormatKind
): Promise<string> {
  if (kind === "docx") return officePreviewPagesHtml(await buildDocxPreviewLayers(entries, bytes, warnings));
  if (kind === "pptx") return officePreviewPagesHtml(await buildPptxPreviewLayers(entries, bytes, warnings));
  return "";
}

export type DocxPositionedFragment = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  markdown: string;
};

export function docxPositionedTextMarkdown(body: Element | null, relationships: Map<string, string>): string {
  if (!body) return "";
  const fragments = descendantsByLocalName(body, "anchor").flatMap((anchor): DocxPositionedFragment[] => {
    const textBox = firstDescendantByLocalName(anchor, "txbxContent");
    const paragraphs = textBox ? descendantsByLocalName(textBox, "p") : [];
    const horizontal = childElementsByLocalName(anchor, "positionH")[0] ?? null;
    const vertical = childElementsByLocalName(anchor, "positionV")[0] ?? null;
    const extent = childElementsByLocalName(anchor, "extent")[0] ?? null;
    const x = Number(firstDescendantByLocalName(horizontal, "posOffset")?.textContent ?? 0);
    const y = Number(firstDescendantByLocalName(vertical, "posOffset")?.textContent ?? 0);
    const width = Number(officeAttribute(extent, "cx")) || 0;
    const height = Number(officeAttribute(extent, "cy")) || 0;
    const visibleParagraphs = paragraphs
      .map((paragraph) => ({
        paragraph,
        markdown: docxParagraphMarkdown(paragraph, relationships, 0)
      }))
      .filter((entry) => Boolean(entry.markdown));
    const rowHeight = height / Math.max(1, visibleParagraphs.length);
    return visibleParagraphs.map((entry, index) => ({
      x,
      y: y + rowHeight * index,
      width,
      height: rowHeight,
      fontSize: descendantsByLocalName(entry.paragraph, "sz")
        .reduce((maximum, element) => Math.max(maximum, Number(officeAttribute(element, "val")) || 0), 0),
      markdown: entry.markdown
    }));
  }).sort((left, right) => left.y - right.y || left.x - right.x);
  if (!fragments.length) return "";

  const rows: DocxPositionedFragment[][] = [];
  for (const fragment of fragments) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - fragment.y) <= 64_000);
    if (row) row.push(fragment);
    else rows.push([fragment]);
  }
  const lines = rows
    .sort((left, right) => left[0].y - right[0].y)
    .map((row) => {
      const ordered = row.sort((left, right) => left.x - right.x);
      const cells: string[] = [];
      let cell = "";
      let previous: DocxPositionedFragment | null = null;
      for (const fragment of ordered) {
        const gap = previous ? fragment.x - (previous.x + previous.width) : 0;
        if (previous && gap > 600_000) {
          cells.push(cell.replace(/\*\*\*\*/g, "").trim());
          cell = "";
        } else if (previous && gap > 50_000 && !/^[，。！？；：、,.!?;:)\]}]/.test(fragment.markdown)) {
          cell += " ";
        }
        cell += fragment.markdown;
        previous = fragment;
      }
      if (cell.trim()) cells.push(cell.replace(/\*\*\*\*/g, "").trim());
      return {
        x: ordered[0].x,
        y: ordered[0].y,
        height: Math.max(...ordered.map((fragment) => fragment.height), 0),
        cells: cells.flatMap((value) => value.split(/\t+/).map((part) => part.trim()).filter(Boolean)),
        fontSize: Math.max(...ordered.map((fragment) => fragment.fontSize), 0)
      };
    })
    .filter((line) => line.cells.length > 0);

  const logicalLines: typeof lines = [];
  for (const line of lines) {
    const previous = logicalLines[logicalLines.length - 1];
    const sameTextSize = previous && Math.abs(previous.fontSize - line.fontSize) <= Math.max(60, previous.fontSize * 0.08);
    const previousText = previous ? markdownVisibleText(previous.cells[0] ?? "") : "";
    const currentText = markdownVisibleText(line.cells[0] ?? "");
    const geometricWrap = previous && line.y - previous.y <= Math.max(previous.height, line.height) * 1.08;
    const semanticWrap = previous && !/[。！？.!?；;：:]$/.test(previousText);
    const wrapped = previous
      && previous.cells.length === 1
      && line.cells.length === 1
      && sameTextSize
      && (geometricWrap || semanticWrap)
      && Math.abs(previous.x - line.x) <= 300_000;
    if (wrapped) {
      const separator = /[A-Za-z0-9]$/.test(previousText) && /^[A-Za-z0-9]/.test(currentText) ? " " : "";
      previous.cells[0] += `${separator}${line.cells[0]}`;
      previous.height = line.y + line.height - previous.y;
      continue;
    }
    logicalLines.push({ ...line, cells: [...line.cells] });
  }

  const output: string[] = [];
  const minimumBodyX = Math.min(...logicalLines.filter((line) => line.cells.length === 1).map((line) => line.x));
  for (let index = 0; index < logicalLines.length;) {
    const line = logicalLines[index];
    if (line.cells.length > 1 && !docxCellsHavePunctuationOnlyTail(line.cells)) {
      const tableLines = [line];
      let next = index + 1;
      while (next < logicalLines.length
        && logicalLines[next].cells.length === line.cells.length
        && !docxCellsHavePunctuationOnlyTail(logicalLines[next].cells)) {
        tableLines.push(logicalLines[next]);
        next += 1;
      }
      if (tableLines.length > 1) {
        output.push(markdownTable(tableLines[0].cells, tableLines.slice(1).map((candidate) => candidate.cells)));
        index = next;
        continue;
      }
    }
    const punctuationOnlyTail = docxCellsHavePunctuationOnlyTail(line.cells);
    const content = mergeAdjacentMarkdownLinks(line.cells.join(punctuationOnlyTail ? "" : " | "));
    const quote = line.cells.length === 1 && line.x - minimumBodyX >= 180_000;
    output.push(quote ? `> ${content}` : content);
    index += 1;
  }
  return output.join("\n\n");
}

export function docxCellsHavePunctuationOnlyTail(cells: string[]): boolean {
  return cells.length > 1
    && cells.slice(1).every((cell) => /^[，。！？；：、,.!?;:)\]}]/.test(cell));
}

export type DocxFlowLine = {
  cells: string[];
  isTable: boolean;
  fontSize: number;
  indent: number;
  spacingBefore: number;
  cellOffsets: number[];
};

export function docxMobileExporterFlowMarkdown(body: Element | null, relationships: Map<string, string>): string {
  if (!body) return "";
  const lines = Array.from(body.children).flatMap((child): DocxFlowLine[] => {
    if (child.localName === "tbl") {
      const table = docxTableMarkdown(child, relationships, 0);
      return table ? [{ cells: [table], isTable: true, fontSize: 0, indent: 0, spacingBefore: 0, cellOffsets: [0] }] : [];
    }
    if (child.localName !== "p") return [];
    const paragraph = docxParagraphMarkdown(child, relationships, 0).replace(/\*\*\*\*/g, "").trim();
    const properties = firstDescendantByLocalName(child, "pPr");
    const indent = Number(officeAttribute(firstDescendantByLocalName(properties, "ind"), "left")) || 0;
    const spacingBefore = Number(officeAttribute(firstDescendantByLocalName(properties, "spacing"), "before")) || 0;
    const tabPositions = properties
      ? descendantsByLocalName(properties, "tab").map((tab) => Number(officeAttribute(tab, "pos")) || 0)
      : [];
    const fontSize = descendantsByLocalName(child, "sz")
      .reduce((maximum, element) => Math.max(maximum, Number(officeAttribute(element, "val")) || 0), 0);
    return paragraph
      ? paragraph.split(/\n+/).map((line, index) => ({
        cells: line.split(/\t+/).map((cell) => cell.trim()).filter(Boolean),
        isTable: false,
        fontSize,
        indent,
        spacingBefore: index === 0 ? spacingBefore : 0,
        cellOffsets: [indent, ...tabPositions]
      })).filter((line) => line.cells.length > 0)
      : [];
  });
  const logicalLines: DocxFlowLine[] = [];
  for (const rawLine of lines) {
    const line = docxCellsHavePunctuationOnlyTail(rawLine.cells)
      ? { ...rawLine, cells: [rawLine.cells.join("")], cellOffsets: [rawLine.indent] }
      : rawLine;
    const previous = logicalLines[logicalLines.length - 1];
    const wrapped = previous
      && !previous.isTable
      && !line.isTable
      && previous.cells.length === 1
      && line.cells.length === 1
      && line.spacingBefore === 0
      && Math.abs(previous.fontSize - line.fontSize) <= Math.max(1, previous.fontSize * 0.08)
      && Math.abs(previous.indent - line.indent) <= 2;
    if (wrapped) {
      const previousText = markdownVisibleText(previous.cells[0]);
      const currentText = markdownVisibleText(line.cells[0]);
      const separator = /[A-Za-z0-9]$/.test(previousText) && /^[A-Za-z0-9]/.test(currentText) ? " " : "";
      previous.cells[0] = mergeAdjacentMarkdownLinks(`${previous.cells[0]}${separator}${line.cells[0]}`);
      continue;
    }
    logicalLines.push({ ...line, cells: [...line.cells], cellOffsets: [...line.cellOffsets] });
  }
  const output: string[] = [];
  const minimumBodyIndent = Math.min(...logicalLines.filter((line) => !line.isTable && line.cells.length === 1).map((line) => line.indent));
  for (let index = 0; index < logicalLines.length;) {
    const line = logicalLines[index];
    if (line.isTable) {
      output.push(line.cells[0]);
      index += 1;
      continue;
    }
    if (line.cells.length > 1 && !docxCellsHavePunctuationOnlyTail(line.cells)) {
      const tableLines = [line];
      let next = index + 1;
      while (next < logicalLines.length
        && !logicalLines[next].isTable
        && logicalLines[next].cells.length === line.cells.length
        && !docxCellsHavePunctuationOnlyTail(logicalLines[next].cells)) {
        tableLines.push(logicalLines[next]);
        next += 1;
      }
      if (tableLines.length > 1) {
        const alignments = tableLines[0].cells.map((_cell, cellIndex): DocumentTableAlignment => {
          const offsets = tableLines.map((candidate) => candidate.cellOffsets[cellIndex] ?? candidate.indent);
          return cellIndex > 0 && Math.max(...offsets) - Math.min(...offsets) > 2 ? "right" : "left";
        });
        output.push(markdownTable(tableLines[0].cells.map((cell) => cell.replace(/\*\*/g, "")), tableLines.slice(1).map((candidate) => candidate.cells), alignments));
        index = next;
        continue;
      }
    }
    const punctuationOnlyTail = docxCellsHavePunctuationOnlyTail(line.cells);
    const content = mergeAdjacentMarkdownLinks(line.cells.join(punctuationOnlyTail ? "" : " | "));
    const quote = line.cells.length === 1 && line.indent - minimumBodyIndent >= 280;
    output.push(quote ? `> ${content}` : content);
    index += 1;
  }
  return output.join("\n\n");
}

export function docxParagraphMarkdown(paragraph: Element, relationships = new Map<string, string>(), headingOffset = 1): string {
  const runs = descendantsByLocalName(paragraph, "r")
    .filter((run) => descendantsByLocalName(run, "r").length === 0);
  let text = runs.map((run) => {
    let value = descendantsByLocalName(run, "t").map((node) => node.textContent ?? "").join("");
    if (descendantsByLocalName(run, "tab").length) value += "\t";
    if (descendantsByLocalName(run, "br").length) value += "\n";
    if (!value) return "";
    const properties = firstDescendantByLocalName(run, "rPr");
    if (properties && firstDescendantByLocalName(properties, "b")) value = `**${value}**`;
    if (properties && firstDescendantByLocalName(properties, "i")) value = `*${value}*`;
    if (properties && firstDescendantByLocalName(properties, "strike")) value = `~~${value}~~`;
    const hyperlink = run.parentElement?.localName === "hyperlink" ? run.parentElement : null;
    const href = hyperlink ? relationships.get(officeAttribute(hyperlink, "id")) ?? "" : "";
    if (href && !/^obsidian:\/\//i.test(href)) value = `[${value}](${href})`;
    return value;
  }).join("");
  text = normalizeExtractedText(text || descendantsByLocalName(paragraph, "t").map((node) => node.textContent ?? "").join(""));
  if (!text) return "";
  const style = firstDescendantByLocalName(paragraph, "pStyle");
  const styleName = officeAttribute(style, "val");
  const heading = styleName.match(/(?:heading|标题)\s*([1-6])/i)?.[1];
  if (heading) return `${"#".repeat(Math.min(6, Number(heading) + headingOffset))} ${headingOffset === 0 ? text.replace(/\*\*/g, "") : text}`;
  if (/title|标题/i.test(styleName)) return `${"#".repeat(Math.max(1, 1 + headingOffset))} ${headingOffset === 0 ? text.replace(/\*\*/g, "") : text}`;
  if (firstDescendantByLocalName(paragraph, "numPr")) return `- ${text}`;
  return text;
}

export function docxTableMarkdown(table: Element, relationships = new Map<string, string>(), headingOffset = 1): string {
  const rows = childElementsByLocalName(table, "tr").map((row) => childElementsByLocalName(row, "tc").map((cell) => {
    return childElementsByLocalName(cell, "p").map((paragraph) => docxParagraphMarkdown(paragraph, relationships, headingOffset)).filter(Boolean).join("<br>").replace(/^[-#]+\s*/, "");
  }));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_unused, index) => row[index] ?? ""));
  const header = normalized[0].map((cell, index) => cell || spreadsheetColumnName(index));
  return markdownTable(header, normalized.slice(1));
}

export function officeShapeText(shape: Element): string[] {
  return descendantsByLocalName(shape, "p").map((paragraph) => normalizeExtractedText(descendantsByLocalName(paragraph, "t").map((text) => text.textContent ?? "").join(""))).filter(Boolean);
}

export type PptxPositionedFragment = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  markdown: string;
};

export type PptxPositionedLine = {
  x: number;
  y: number;
  height: number;
  fontSize: number;
  cells: string[];
  cellLefts: number[];
  cellRights: number[];
};

export async function pptxSlideRelationships(
  entries: ZipEntry[],
  bytes: Uint8Array,
  slideEntry: ZipEntry,
  warnings: string[]
): Promise<Map<string, string>> {
  return officePartRelationships(entries, bytes, slideEntry, warnings);
}

export async function officePartRelationships(
  entries: ZipEntry[],
  bytes: Uint8Array,
  partEntry: ZipEntry,
  warnings: string[]
): Promise<Map<string, string>> {
  const slash = partEntry.name.lastIndexOf("/");
  const folder = slash >= 0 ? partEntry.name.slice(0, slash) : "";
  const name = slash >= 0 ? partEntry.name.slice(slash + 1) : partEntry.name;
  const relationPath = `${folder}/_rels/${name}.rels`;
  const relationEntry = entries.find((entry) => entry.name === relationPath);
  if (!relationEntry) return new Map();
  const parsed = parseOfficeXml(await extractZipEntryText(relationEntry, bytes, warnings), warnings, relationPath);
  const output = new Map<string, string>();
  for (const relation of descendantsByLocalName(parsed, "Relationship")) {
    const id = officeAttribute(relation, "Id") || officeAttribute(relation, "id");
    const target = officeAttribute(relation, "Target") || officeAttribute(relation, "target");
    if (id && target) output.set(id, target);
  }
  return output;
}

export function pptxPositionedSlideMarkdown(parsed: XMLDocument, relationships: Map<string, string>): string {
  const fragments = descendantsByLocalName(parsed, "sp").flatMap((shape): PptxPositionedFragment[] => {
    const transform = firstDescendantByLocalName(shape, "xfrm");
    const offset = firstDescendantByLocalName(transform, "off");
    const extent = firstDescendantByLocalName(transform, "ext");
    const x = Number(officeAttribute(offset, "x")) || 0;
    const y = Number(officeAttribute(offset, "y")) || 0;
    const width = Number(officeAttribute(extent, "cx")) || 0;
    const height = Number(officeAttribute(extent, "cy")) || 0;
    const shapeLink = pptxHyperlinkTarget(firstDescendantByLocalName(shape, "cNvPr"), relationships);
    const paragraphs = descendantsByLocalName(shape, "p")
      .map((paragraph) => ({
        paragraph,
        markdown: pptxParagraphMarkdown(paragraph, relationships, shapeLink)
      }))
      .filter((entry) => Boolean(entry.markdown));
    const rowHeight = height / Math.max(1, paragraphs.length);
    return paragraphs.map((entry, index) => ({
      x,
      y: y + rowHeight * index,
      width,
      height: rowHeight,
      fontSize: descendantsByLocalName(entry.paragraph, "rPr")
        .reduce((maximum, element) => Math.max(maximum, Number(officeAttribute(element, "sz")) || 0), 0),
      markdown: entry.markdown
    }));
  }).filter((fragment) => fragment.markdown).sort((left, right) => left.y - right.y || left.x - right.x);
  if (!fragments.length) return "";

  const rows: PptxPositionedFragment[][] = [];
  for (const fragment of fragments) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - fragment.y) <= 64_000);
    if (row) row.push(fragment);
    else rows.push([fragment]);
  }
  const lines = rows.map((row): PptxPositionedLine => {
    const ordered = row.sort((left, right) => left.x - right.x);
    const cellFragments: PptxPositionedFragment[][] = [[]];
    let previous: PptxPositionedFragment | null = null;
    for (const fragment of ordered) {
      const gap = previous ? fragment.x - (previous.x + previous.width) : 0;
      if (previous && gap > 600_000) cellFragments.push([]);
      cellFragments[cellFragments.length - 1].push(fragment);
      previous = fragment;
    }
    return {
      x: ordered[0].x,
      y: ordered[0].y,
      height: Math.max(...ordered.map((fragment) => fragment.height), 0),
      fontSize: Math.max(...ordered.map((fragment) => fragment.fontSize), 0),
      cells: cellFragments.map(pptxPositionedCellMarkdown).filter(Boolean),
      cellLefts: cellFragments.map((fragments) => Math.min(...fragments.map((fragment) => fragment.x))),
      cellRights: cellFragments.map((fragments) => Math.max(...fragments.map((fragment) => fragment.x + fragment.width)))
    };
  }).filter((line) => line.cells.length > 0);

  const logicalLines: PptxPositionedLine[] = [];
  for (const line of lines) {
    const previous = logicalLines[logicalLines.length - 1];
    const sameTextSize = previous && Math.abs(previous.fontSize - line.fontSize) <= Math.max(60, previous.fontSize * 0.08);
    const wrapped = previous
      && previous.cells.length === 1
      && line.cells.length === 1
      && sameTextSize
      && line.y - previous.y <= Math.max(previous.height, line.height) * 1.08
      && Math.abs(previous.x - line.x) <= 300_000;
    if (wrapped) {
      const previousText = markdownVisibleText(previous.cells[0]);
      const currentText = markdownVisibleText(line.cells[0]);
      const separator = /[A-Za-z0-9]$/.test(previousText) && /^[A-Za-z0-9]/.test(currentText) ? " " : "";
      previous.cells[0] += `${separator}${line.cells[0]}`;
      previous.height = line.y + line.height - previous.y;
      continue;
    }
    logicalLines.push({ ...line, cells: [...line.cells], cellLefts: [...line.cellLefts], cellRights: [...line.cellRights] });
  }

  const ordinarySizes = logicalLines.filter((line) => line.cells.length === 1 && line.fontSize > 0).map((line) => line.fontSize).sort((a, b) => a - b);
  const ordinaryFontSize = ordinarySizes[Math.floor(ordinarySizes.length / 2)] || ordinarySizes[0] || 1;
  const minimumBodyX = Math.min(...logicalLines.filter((line) => line.cells.length === 1).map((line) => line.x));
  const output: string[] = [];
  for (let index = 0; index < logicalLines.length;) {
    const line = logicalLines[index];
    if (line.cells.length > 1) {
      const tableLines = [line];
      let next = index + 1;
      while (next < logicalLines.length && logicalLines[next].cells.length === line.cells.length) {
        tableLines.push(logicalLines[next]);
        next += 1;
      }
      if (tableLines.length > 1) {
        const alignments = tableLines[0].cells.map((_cell, cellIndex): DocumentTableAlignment => {
          const lefts = tableLines.map((candidate) => candidate.cellLefts[cellIndex]);
          const rights = tableLines.map((candidate) => candidate.cellRights[cellIndex]);
          const leftSpread = Math.max(...lefts) - Math.min(...lefts);
          const rightSpread = Math.max(...rights) - Math.min(...rights);
          return rightSpread <= 20_000 && leftSpread > 20_000 ? "right" : "left";
        });
        output.push(markdownTable(tableLines[0].cells.map((cell) => cell.replace(/\*\*/g, "")), tableLines.slice(1).map((candidate) => candidate.cells), alignments));
        index = next;
        continue;
      }
    }
    const content = mergeAdjacentMarkdownLinks(line.cells.join(" | "));
    const title = index === 0 && line.fontSize >= ordinaryFontSize * 1.35;
    const quote = !title && line.cells.length === 1 && line.x - minimumBodyX >= 180_000;
    output.push(title ? `# ${content.replace(/\*\*/g, "")}` : quote ? `> ${content}` : content);
    index += 1;
  }
  return output.join("\n\n");
}

export function pptxPositionedCellMarkdown(fragments: PptxPositionedFragment[]): string {
  let output = "";
  let previous: PptxPositionedFragment | null = null;
  for (const fragment of fragments) {
    const gap = previous ? fragment.x - (previous.x + previous.width) : 0;
    const visible = markdownVisibleText(fragment.markdown);
    const separator = previous
      && gap > 50_000
      && !/^[，。！？；：、,.!?;:)\]}]/.test(visible)
      ? " "
      : "";
    output += `${separator}${fragment.markdown}`;
    previous = fragment;
  }
  return mergeAdjacentMarkdownLinks(output.replace(/\*\*\*\*/g, "").trim());
}

export function pptxParagraphMarkdown(paragraph: Element, relationships: Map<string, string>, shapeLink = ""): string {
  const runs = descendantsByLocalName(paragraph, "r").filter((run) => descendantsByLocalName(run, "r").length === 0);
  const markdown = runs.map((run) => {
    let value = descendantsByLocalName(run, "t").map((node) => node.textContent ?? "").join("");
    if (!value) return "";
    const properties = firstDescendantByLocalName(run, "rPr");
    if (/^(?:1|true)$/i.test(officeAttribute(properties, "b"))) value = `**${value}**`;
    if (/^(?:1|true)$/i.test(officeAttribute(properties, "i"))) value = `*${value}*`;
    const href = pptxHyperlinkTarget(properties, relationships) || shapeLink;
    return href && !/^obsidian:\/\//i.test(href) ? `[${value}](${href})` : value;
  }).join("");
  return normalizeExtractedText(markdown || descendantsByLocalName(paragraph, "t").map((node) => node.textContent ?? "").join(""));
}

export function pptxHyperlinkTarget(parent: ParentNode | null, relationships: Map<string, string>): string {
  const hyperlink = firstDescendantByLocalName(parent, "hlinkClick");
  const relationId = officeAttribute(hyperlink, "id");
  return relationId ? relationships.get(relationId) ?? "" : "";
}

export function markdownVisibleText(value: string): string {
  return value
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?u>/g, "")
    .replace(/[\*_~`]/g, "");
}

export function mergeAdjacentMarkdownLinks(value: string): string {
  let current = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const merged = current.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\[([^\]]*)\]\(\2\)/gi, "[$1$3]($2)");
    if (merged === current) break;
    current = merged;
  }
  return current;
}

export async function readXlsxSheetDescriptors(entries: ZipEntry[], bytes: Uint8Array, warnings: string[]): Promise<Array<{ name: string; path: string }>> {
  const workbook = findZipEntry(entries, "xl/workbook.xml");
  const relations = findZipEntry(entries, "xl/_rels/workbook.xml.rels");
  if (!workbook || !relations) return [];
  const workbookXml = await extractZipEntryText(workbook, bytes, warnings);
  const relationsXml = await extractZipEntryText(relations, bytes, warnings);
  const relationPaths = new Map<string, string>();
  for (const match of relationsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const id = match[1].match(/\bId="([^"]+)"/i)?.[1] ?? "";
    const target = match[1].match(/\bTarget="([^"]+)"/i)?.[1] ?? "";
    if (!id || !target) continue;
    const path = resolveZipTarget("xl/workbook.xml", target);
    relationPaths.set(id, path);
  }
  const output: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)) {
    const name = decodeXmlEntities(match[1].match(/\bname="([^"]+)"/i)?.[1] ?? "");
    const relationId = match[1].match(/\br:id="([^"]+)"/i)?.[1] ?? "";
    const path = relationPaths.get(relationId) ?? "";
    if (name && path) output.push({ name, path });
  }
  return output;
}

export function extractXlsxGrid(xml: string, sharedStrings: string[], maxRows: number, maxColumns: number): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[\s\S]*?<\/row>/gi)) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const column = Math.min(maxColumns - 1, spreadsheetColumnIndex(attrs.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? "A1"));
      const type = attrs.match(/\bt="([^"]+)"/i)?.[1] ?? "";
      const inline = body.match(/<is\b[\s\S]*?<\/is>/i)?.[0] ?? "";
      const formula = decodeXmlEntities(body.match(/<f[^>]*>([\s\S]*?)<\/f>/i)?.[1] ?? "");
      const rawValue = decodeXmlEntities(body.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "");
      let value = rawValue;
      if (type === "s") value = sharedStrings[Number(rawValue)] ?? rawValue;
      else if (type === "inlineStr") value = extractXmlTextRuns(inline);
      else if (type === "b") value = rawValue === "1" ? "TRUE" : "FALSE";
      if (!value && formula) value = `=${formula}`;
      while (row.length <= column) row.push("");
      row[column] = normalizeExtractedText(value);
    }
    if (row.some(Boolean)) rows.push(row.slice(0, maxColumns));
    if (rows.length >= maxRows) break;
  }
  return rows;
}

