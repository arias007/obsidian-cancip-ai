/*
 * Cancip ui — extracted from src/main.ts by scripts/extract-main-modules.mjs.
 * Declarations here were proven to reference nothing left behind in main.ts, so this
 * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.
 */
import { type ReviewGateManifestItem } from "../reviewGate";
import { App, normalizePath, TFile, WorkspaceLeaf } from "obsidian";
import { escapeRegExp, normalizeExtractedText, tokenNumber } from "./model-api";
import { trimContext } from "./office";
import { flattenKeywordValue, makeReviewDiffLines, normalizeObsidianCommandSearchText, obsidianCommandSearchTokens, scoreObsidianCommand, uniqueStrings } from "./search";
import { AutomationActionOperation, AutomationNotifyMode, AutomationRunStatus, AutomationSchedule, AutomationSessionMode, AutomationTask, CancipAction, ChatMessage, ChoiceOption, DomActionResult, FinalReviewStatus, FoldedMessageBlock, ModelTiming, ObsidianCommandEntry, ProcessAuditSection, ProcessStepBrief, ResumableTaskState, SearchHit, TodoActionItem, TodoActionOperation, TokenUsage, ToolRun, ToolRunLineDelta, ToolRunStatus, TtsTextSegment, UiButtonEvidenceContext, UiButtonEvidenceRow, UiButtonRule, UiButtonRuleChange, WorkspaceTabInfo } from "./types-1";
import { MarkdownTtsEmbedReference, classifyPromptIntent, cloneJsonValue, hasFinalConclusion, isBareCreateVaultFilePrompt, isCjkChar, isModelRunStatsLine, isRecord, isSubsequence, looksLikePathQuery, looksLikeProcessProtocolLeakText, normalizeTagName, normalizedSimilarity, redactSensitiveText, shouldExpectToolActionForPrompt, stripModelRunStatsLines, stripProgrammaticRunStats } from "./vault-2";

export function markdownTtsEmbedReferences(input: string): MarkdownTtsEmbedReference[] {
  const references: MarkdownTtsEmbedReference[] = [];
  const collect = (pattern: RegExp, targetIndex: number) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input)) !== null) {
      const raw = match[0] ?? "";
      let target = (match[targetIndex] ?? "").trim();
      if (targetIndex === 1) target = target.split("|")[0]?.trim() ?? "";
      if (!raw || !target) continue;
      references.push({ start: match.index, end: match.index + raw.length, raw, target });
    }
  };
  collect(/!\[\[([^\]]+)]]/g, 1);
  collect(/!\[[^\]]*]\(([^)]+)\)/g, 1);
  return references
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((reference, index, sorted) => index === 0 || reference.start >= sorted[index - 1].end);
}

export type MarkdownTtsProtectedCodeBlock = {
  token: string;
  text: string;
};

export function protectMarkdownTtsFencedCode(input: string): { source: string; blocks: MarkdownTtsProtectedCodeBlock[] } {
  const output: string[] = [];
  const blocks: MarkdownTtsProtectedCodeBlock[] = [];
  let activeFence: { marker: string; block: MarkdownTtsProtectedCodeBlock; lines: string[] } | null = null;
  for (const line of input.split(/\r?\n/)) {
    if (activeFence) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (closing?.[1]?.startsWith(activeFence.marker[0]) && closing[1].length >= activeFence.marker.length) {
        activeFence.block.text = activeFence.lines.join("\n").trim();
        activeFence = null;
        continue;
      }
      activeFence.lines.push(line);
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(?:[^\n]*)$/.exec(line);
    if (!opening?.[1]) {
      output.push(line);
      continue;
    }
    let token = `CANCIPTTSFENCEDCODEBLOCK${blocks.length}TOKEN`;
    while (input.includes(token)) token += "X";
    const block = { token, text: "" };
    blocks.push(block);
    output.push(token);
    activeFence = { marker: opening[1], block, lines: [] };
  }
  if (activeFence) activeFence.block.text = activeFence.lines.join("\n").trim();
  return { source: output.join("\n"), blocks };
}

export function extractVisibleRenderedText(root: HTMLElement): string {
  const ignored = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS", "BUTTON", "INPUT", "TEXTAREA", "SELECT"]);
  const chunks: string[] = [];
  const view = root.ownerDocument.defaultView ?? activeDocument.defaultView;
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (text) chunks.push(text);
      return;
    }
    if (!view || !node.instanceOf(view.HTMLElement)) return;
    if (ignored.has(node.tagName)) return;
    const style = view.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return;
    if (node.matches("li.task-list-item, .task-list-item")) {
      chunks.push(`${isRenderedTaskChecked(node) ? "已完成" : "待办"} `);
    }
    for (const child of Array.from(node.childNodes)) walk(child);
    if (["P", "DIV", "LI", "TR", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "TABLE"].includes(node.tagName)) {
      chunks.push("\n");
    }
  };
  walk(root);
  return chunks
    .join(" ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type TtsViewportReadableItem = {
  element: HTMLElement;
  rect: DOMRect;
  readable: boolean;
  visible: boolean;
  text: string;
};

export function isVisibleTtsElement(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
}

export function visibleTtsReadableRoots(roots: HTMLElement[]): HTMLElement[] {
  return roots.filter(isVisibleTtsElement);
}

export function ttsReadableViewport(root?: HTMLElement): { top: number; bottom: number } {
  const visual = window.visualViewport;
  const rawTop = Math.max(0, visual?.offsetTop ?? 0);
  const rawBottom = rawTop + Math.max(160, visual?.height ?? window.innerHeight ?? 800);
  const viewContent = ttsReadableScrollContainer(root);
  const viewRect = viewContent?.getBoundingClientRect();
  const top = Math.max(rawTop, viewRect && viewRect.height > 0 ? viewRect.top : rawTop) + 2;
  const bottom = Math.max(top + 120, Math.min(rawBottom, viewRect && viewRect.height > 0 ? viewRect.bottom : rawBottom));
  return { top, bottom };
}

export function ttsReadableScrollContainer(root?: HTMLElement): HTMLElement | null {
  const preferred = root?.closest<HTMLElement>(".markdown-preview-view, .cm-scroller, .pdf-container, .pdf-viewer, .pdfViewer, .view-content, .workspace-leaf-content");
  if (preferred && preferred.getBoundingClientRect().height > 120) return preferred;
  let node: HTMLElement | null = root ?? null;
  while (node && node !== (root?.ownerDocument ?? activeDocument).body) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    const scrollable = /(auto|scroll|overlay)/.test(style.overflowY) || node.scrollHeight > node.clientHeight + 8;
    if (scrollable && rect.height > 120) return node;
    node = node.parentElement;
  }
  return root?.closest<HTMLElement>(".view-content, .workspace-leaf-content") ?? null;
}

export function viewportStartIndex<T extends { rect: DOMRect; visible?: boolean }>(items: T[], viewportTop = 0): number {
  if (!items.length) return 0;
  const top = Math.max(0, viewportTop);
  const crossingTop = items.findIndex((item) => item.rect.bottom >= top - 2 && item.visible !== false);
  if (crossingTop >= 0) return crossingTop;
  const visibleBelowTop = items.findIndex((item) => item.rect.top >= top - 2 && item.visible !== false);
  if (visibleBelowTop >= 0) return visibleBelowTop;
  return 0;
}

export function scrollTtsHighlightIntoView(element: HTMLElement): void {
  const viewport = ttsReadableViewport(element);
  const rect = element.getBoundingClientRect();
  const viewportHeight = Math.max(120, viewport.bottom - viewport.top);
  const viewportCenter = viewport.top + viewportHeight / 2;
  const elementCenter = rect.top + Math.max(1, rect.height) / 2;
  const centerSlack = Math.max(18, Math.min(72, viewportHeight * 0.16));
  const safelyVisible = rect.top >= viewport.top + 10 && rect.bottom <= viewport.bottom - 10;
  if (safelyVisible && Math.abs(elementCenter - viewportCenter) <= centerSlack) return;
  const scrollContainer = ttsReadableScrollContainer(element);
  if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 4) {
    const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    const targetTop = Math.max(0, Math.min(maxTop, scrollContainer.scrollTop + elementCenter - viewportCenter));
    scrollContainer.scrollTo({ top: targetTop, behavior: "smooth" });
    return;
  }
  element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

export function isProgrammaticProgressHeadline(line: string): boolean {
  const text = line.replace(/\s+/g, " ").trim();
  return /^(?:执行中|已执行|失败|running|executed|failed)\s*[·:：-]/i.test(text)
    && /(?:耗时|elapsed)\s*[^·\s]+/i.test(text);
}

export function mergePdfTextLayerSpans(items: Array<{ rect: DOMRect; text: string }>): string {
  const lines: Array<{ top: number; height: number; items: Array<{ rect: DOMRect; text: string }> }> = [];
  for (const item of items) {
    const height = Math.max(1, item.rect.height || 12);
    const tolerance = Math.max(2, Math.min(8, height * 0.45));
    let line = lines.find((candidate) => Math.abs(candidate.top - item.rect.top) <= tolerance);
    if (!line) {
      line = { top: item.rect.top, height, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  lines.sort((a, b) => a.top - b.top);
  const chunks: string[] = [];
  for (const line of lines) {
    line.items.sort((a, b) => a.rect.left - b.rect.left);
    const pieces: string[] = [];
    let previous: { rect: DOMRect; text: string } | null = null;
    for (const item of line.items) {
      if (previous) {
        const gap = item.rect.left - previous.rect.right;
        if (gap > Math.max(2, line.height * 0.35) && shouldInsertTtsSpace(previous.text, item.text)) pieces.push(" ");
      }
      pieces.push(item.text);
      previous = item;
    }
    const text = pieces.join("").replace(/\s{2,}/g, " ").trim();
    if (text) chunks.push(text);
  }
  return chunks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizePdfTtsText(input: string): string {
  const normalized = normalizeExtractedText(input);
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => normalizePdfTtsParagraph(paragraph))
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizePdfTtsParagraph(paragraph: string): string {
  const lines = paragraph
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean);
  const blocks: string[] = [];
  let buffer = "";
  const pushBuffer = () => {
    const text = buffer.trim();
    if (text) blocks.push(text);
    buffer = "";
  };
  for (const line of lines) {
    if (isPdfStandaloneLine(line)) {
      pushBuffer();
      blocks.push(line);
      continue;
    }
    if (!buffer) {
      buffer = line;
      continue;
    }
    if (shouldJoinPdfTtsLine(buffer, line)) {
      buffer = joinPdfTtsLine(buffer, line);
    } else {
      pushBuffer();
      buffer = line;
    }
  }
  pushBuffer();
  return blocks.join("\n").trim();
}

export function shouldJoinPdfTtsLine(left: string, right: string): boolean {
  const previous = left.trim();
  const next = right.trim();
  if (!previous || !next) return false;
  if (isPdfStandaloneLine(previous) || isPdfStandaloneLine(next)) return false;
  if (/[。！？!?；;]$/.test(previous)) return false;
  if (/^[）)\]】》」』”’]/.test(next)) return true;
  if (/^[,，.。:：;；!?！？、]/.test(next)) return true;
  if (looksLikePdfTableLine(previous) || looksLikePdfTableLine(next)) return false;
  if (previous.length <= 18 && next.length <= 18 && /^[A-Z0-9]/.test(next) && /[A-Za-z0-9]$/.test(previous)) return false;
  return true;
}

export function joinPdfTtsLine(left: string, right: string): string {
  const previous = left.trim();
  const next = right.trim();
  if (/-$/.test(previous) && /^[A-Za-z]/.test(next)) return `${previous.slice(0, -1)}${next}`;
  return shouldInsertTtsSpace(previous, next) ? `${previous} ${next}` : `${previous}${next}`;
}

export function isPdfStandaloneLine(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  if (/^(?:[-*+]|[0-9]+[.)、]|[一二三四五六七八九十]+[、.．])\s+/.test(text)) return true;
  if (/^(?:第[一二三四五六七八九十0-9]+[章节]|Chapter\s+\d+)\b/i.test(text)) return true;
  if (looksLikePdfTableLine(text)) return true;
  return false;
}

export function looksLikePdfTableLine(line: string): boolean {
  if (line.includes("|") || line.includes("\t")) return true;
  const digitGroups = line.match(/\b\d+(?:[.,:：/-]\d+)*\b/g)?.length ?? 0;
  const asciiGroups = line.match(/[A-Za-z0-9]{1,16}/g)?.length ?? 0;
  return digitGroups >= 3 && asciiGroups >= 5;
}

export function keepTopLevelReadableItems<T extends { element: HTMLElement; text: string }>(items: T[]): T[] {
  return items.filter((item) => {
    const keepParent = item.element.matches("pre, li.task-list-item, .task-list-item");
    if (keepParent) return true;
    const directText = normalizeTtsHighlightText(readableDirectText(item.element));
    for (const other of items) {
      if (other === item) continue;
      if (!other.text) continue;
      if (item.element.contains(other.element) && !directText) return false;
      if (!other.element.contains(item.element)) continue;
      if (other.element.matches("li.task-list-item, .task-list-item")) return false;
    }
    return true;
  });
}

export function readableDirectText(element: HTMLElement): string {
  const chunks: string[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) chunks.push(child.textContent ?? "");
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export function shouldInsertTtsSpace(left: string, right: string): boolean {
  const a = left.slice(-1);
  const b = right.slice(0, 1);
  if (!a || !b) return false;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(a) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(b)) return false;
  return /[\p{L}\p{N}]/u.test(a) && /[\p{L}\p{N}]/u.test(b);
}

export function getWindowSelectionText(): string {
  try {
    const activeSelection = activeDocument.getSelection?.()?.toString().trim() ?? "";
    if (activeSelection) return activeSelection;
    return window.getSelection?.()?.toString().trim() ?? "";
  } catch {
    return "";
  }
}

export function normalizeTtsHighlightText(input: string): string {
  return input
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、,.!?;:"'“”‘’（）()[\]【】{}<>《》—_~`|/\\-]/g, "")
    .trim();
}

export function ttsSyntheticTaskPrefixRemainingUnits(
  playParts: string[],
  displayIndexByPart: number[],
  partIndex: number,
  displayIndex: number,
  displayText: string
): number {
  const match = displayText.match(/^(待办|已完成)\s*/);
  if (!match || partIndex < 0) return 0;
  let firstPart = partIndex;
  while (firstPart > 0 && displayIndexByPart[firstPart - 1] === displayIndex) firstPart -= 1;
  let consumed = 0;
  for (let index = firstPart; index < partIndex; index += 1) {
    consumed += normalizeTtsHighlightText(playParts[index] ?? "").length;
  }
  return Math.max(0, normalizeTtsHighlightText(match[1]).length - consumed);
}

export function alignTtsNormalizedTextOffsets(raw: string, spoken: string): number[] {
  if (!spoken) return [];
  if (!raw) return new Array(spoken.length).fill(0);
  const rows = raw.length + 1;
  const columns = spoken.length + 1;
  const matrix = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = matrix[row - 1][column - 1] + (raw[row - 1] === spoken[column - 1] ? 0 : 1);
      matrix[row][column] = Math.min(substitution, matrix[row - 1][column] + 1, matrix[row][column - 1] + 1);
    }
  }
  const offsets = new Array<number>(spoken.length).fill(0);
  let row = raw.length;
  let column = spoken.length;
  while (column > 0) {
    const substitutionCost = row > 0 ? (raw[row - 1] === spoken[column - 1] ? 0 : 1) : Number.POSITIVE_INFINITY;
    if (row > 0 && matrix[row][column] === matrix[row - 1][column - 1] + substitutionCost) {
      offsets[column - 1] = row - 1;
      row -= 1;
      column -= 1;
      continue;
    }
    if (matrix[row][column] === matrix[row][column - 1] + 1) {
      offsets[column - 1] = Math.max(0, row - 1);
      column -= 1;
      continue;
    }
    row = Math.max(0, row - 1);
  }
  let previous = 0;
  for (let index = 0; index < offsets.length; index += 1) {
    previous = Math.max(previous, Math.min(raw.length - 1, offsets[index] ?? previous));
    offsets[index] = previous;
  }
  return offsets;
}

export function findBestNormalizedNeedleMatch(haystack: string, needle: string, preferShortFallback = false, cursor = 0): { needle: string; index: number } | null {
  if (!needle) return null;
  const directIndex = closestStringIndex(haystack, needle, cursor);
  if (directIndex >= 0) return { needle, index: directIndex };
  const candidates: string[] = [];
  const lengths = preferShortFallback ? [96, 64, 40, 24, 16, 8, 4, 3] : [96, 64, 40, 24];
  for (const length of lengths) {
    if (needle.length > length) candidates.push(needle.slice(0, length));
  }
  for (const candidate of candidates) {
    if (candidate.length < 2) continue;
    const index = closestStringIndex(haystack, candidate, cursor);
    if (index >= 0) return { needle: candidate, index };
  }
  return null;
}

export function ttsMostRelevantScrollContainer(container: HTMLElement): HTMLElement | null {
  const candidates = uniqueElements([
    container,
    ...Array.from(container.querySelectorAll<HTMLElement>(".markdown-preview-view, .cm-scroller, .pdf-container, .pdf-viewer, .pdfViewer, .view-content"))
  ]).filter((element) => isVisibleTtsElement(element) && element.scrollHeight > element.clientHeight + 4);
  if (!candidates.length) return null;
  return candidates
    .map((element, index) => ({
      element,
      index,
      progress: element.scrollHeight > 0 ? Math.max(0, element.scrollTop) / element.scrollHeight : 0,
      scrolled: element.scrollTop > 1
    }))
    .sort((left, right) => Number(right.scrolled) - Number(left.scrolled) || right.progress - left.progress || left.index - right.index)[0]?.element ?? null;
}

export function ttsScrollProgressCursor(normalizedLength: number, scrollTop: number, clientHeight: number, scrollHeight: number): number {
  const length = Math.max(0, Math.floor(Number.isFinite(normalizedLength) ? normalizedLength : 0));
  const height = Math.max(0, Number.isFinite(scrollHeight) ? scrollHeight : 0);
  const viewport = Math.max(0, Number.isFinite(clientHeight) ? clientHeight : 0);
  if (!length || height <= viewport + 4) return 0;
  const top = Math.max(0, Math.min(height - viewport, Number.isFinite(scrollTop) ? scrollTop : 0));
  if (top <= 1) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(length * (top / height))));
}

export function findSequentialNormalizedNeedleMatch(
  haystack: string,
  needle: string,
  preferShortFallback = false,
  cursor = 0,
  minimumCursor = 0
): { needle: string; index: number } | null {
  if (!needle) return null;
  const minimum = Math.max(0, Math.min(haystack.length, Number.isFinite(minimumCursor) ? Math.floor(minimumCursor) : 0));
  const target = Math.max(minimum, Math.min(haystack.length, Number.isFinite(cursor) ? Math.floor(cursor) : minimum));
  const candidates = [needle];
  const lengths = preferShortFallback ? [96, 64, 40, 24, 16, 8, 4, 3] : [96, 64, 40, 24];
  for (const length of lengths) {
    if (needle.length > length) candidates.push(needle.slice(0, length));
  }
  for (const candidate of uniqueStrings(candidates)) {
    if (!candidate.length) continue;
    const index = closestStringIndexAtOrAfter(haystack, candidate, target, minimum);
    if (index >= 0) return { needle: candidate, index };
  }
  return null;
}

export function closestStringIndexAtOrAfter(haystack: string, needle: string, cursor = 0, minimumCursor = 0): number {
  if (!needle) return -1;
  const minimum = Math.max(0, Math.min(haystack.length, Number.isFinite(minimumCursor) ? Math.floor(minimumCursor) : 0));
  const target = Math.max(minimum, Math.min(haystack.length, Number.isFinite(cursor) ? Math.floor(cursor) : minimum));
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = haystack.indexOf(needle, minimum);
  while (index >= 0) {
    const distance = Math.abs(index - target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
      if (distance === 0) break;
    }
    index = haystack.indexOf(needle, index + Math.max(1, needle.length));
  }
  return best;
}

export function closestStringIndex(haystack: string, needle: string, cursor = 0): number {
  if (!needle) return -1;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  const safeCursor = Math.max(0, Math.min(haystack.length, Number.isFinite(cursor) ? cursor : 0));
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    const distance = Math.abs(index - safeCursor);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
      if (distance === 0) break;
    }
    index = haystack.indexOf(needle, index + Math.max(1, needle.length));
  }
  return best;
}

export function readableLineHeight(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const numeric = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(numeric) && numeric > 4) return numeric;
  const fontSize = Number.parseFloat(style.fontSize);
  return Number.isFinite(fontSize) && fontSize > 4 ? fontSize * 1.45 : 20;
}

export function isRenderedTaskChecked(element: HTMLElement): boolean {
  return Boolean(element.querySelector<HTMLInputElement>("input[type='checkbox']")?.checked)
    || element.getAttribute("data-task") === "x"
    || element.getAttribute("data-task") === "X"
    || element.hasClass("is-checked")
    || element.hasClass("task-list-item-checkbox-checked");
}

export function normalizedTextWithSourceOffsets(input: string): { text: string; offsets: number[] } {
  let text = "";
  const offsets: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const normalized = normalizeTtsHighlightText(input[index] ?? "");
    if (!normalized) continue;
    text += normalized;
    offsets.push(index);
  }
  return { text, offsets };
}

export function sliceTtsTextFromAnchorToEnd(fullText: string, anchorText: string, maxChars: number, cursor = 0): string {
  const full = fullText.trim();
  const anchor = normalizeTtsHighlightText(anchorText).slice(0, 240);
  if (!full) return trimContext(anchorText, maxChars);
  if (anchor.length >= 3) {
    const normalizedFull = normalizedTextWithSourceOffsets(full);
    const match = findBestNormalizedNeedleMatch(normalizedFull.text, anchor, true, Math.max(0, cursor));
    const reliableMatchLength = Math.min(anchor.length, 16);
    if (match && match.needle.length >= reliableMatchLength) {
      const offset = normalizedFull.offsets[match.index] ?? 0;
      return trimContext(full.slice(offset), maxChars);
    }
    const safeCursor = Number.isFinite(cursor) && cursor >= 0 && cursor < normalizedFull.offsets.length ? Math.floor(cursor) : 0;
    const cursorOffset = ttsReadableBoundaryOffset(full, normalizedFull.offsets[safeCursor] ?? 0);
    return trimContext(full.slice(cursorOffset), maxChars);
  }
  if (Number.isFinite(cursor) && cursor > 0) {
    const normalizedFull = normalizedTextWithSourceOffsets(full);
    const safeCursor = Math.max(0, Math.min(Math.max(0, normalizedFull.offsets.length - 1), Math.floor(cursor)));
    const cursorOffset = ttsReadableBoundaryOffset(full, normalizedFull.offsets[safeCursor] ?? 0);
    return trimContext(full.slice(cursorOffset), maxChars);
  }
  return trimContext(full, maxChars);
}

export function ttsReadableBoundaryOffset(text: string, offset: number): number {
  const safeOffset = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.floor(offset) : 0));
  if (safeOffset <= 0) return 0;
  const lineStart = text.lastIndexOf("\n", safeOffset - 1) + 1;
  if (safeOffset - lineStart <= 120) return lineStart;
  const nearby = text.slice(Math.max(lineStart, safeOffset - 80), safeOffset);
  const boundary = Math.max(
    nearby.lastIndexOf("。"),
    nearby.lastIndexOf("！"),
    nearby.lastIndexOf("？"),
    nearby.lastIndexOf("；"),
    nearby.lastIndexOf("，"),
    nearby.lastIndexOf(" ")
  );
  return boundary >= 0 ? Math.max(lineStart, safeOffset - nearby.length + boundary + 1) : safeOffset;
}

export function offsetToEditorPosition(source: string, offset: number): { line: number; ch: number } {
  const safeOffset = Math.max(0, Math.min(source.length, offset));
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < safeOffset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, ch: safeOffset - lineStart };
}

export function responseHeaderValue(headers: Record<string, string>, name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value.toLowerCase();
  }
  return "";
}

export async function blobUrlToArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await XMLHttpRequestArrayBuffer(url);
  return response;
}

export function XMLHttpRequestArrayBuffer(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.onload = () => {
      if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
        resolve(request.response as ArrayBuffer);
      } else {
        reject(new Error(`audio fallback request failed: HTTP ${request.status}`));
      }
    };
    request.onerror = () => reject(new Error("audio fallback request failed"));
    request.send();
  });
}

export function splitTtsText(input: string, targetLength = 420, preferSentenceParts = false): string[] {
  const normalized = input.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];
  const parts: string[] = [];
  const maxLength = Math.max(120, targetLength);
  const hardLength = Math.max(maxLength + 120, Math.floor(maxLength * 1.8));
  let buffer = "";
  const push = () => {
    const text = buffer.trim();
    if (text) parts.push(text);
    buffer = "";
  };
  for (const segment of splitTtsTextSegments(normalized)) {
    const next = segment.text.trim();
    if (!next) continue;
    if ((preferSentenceParts || segment.forcedBreak) && next.length <= hardLength) {
      push();
      parts.push(next);
      continue;
    }
    if ((buffer + "\n" + next).length > maxLength) push();
    if (next.length > hardLength) {
      push();
      let rest = next;
      while (rest) {
        const take = ttsLongSegmentTakeLength(rest, maxLength, hardLength);
        parts.push(rest.slice(0, take).trim());
        rest = rest.slice(take).trimStart();
      }
      continue;
    }
    buffer = buffer ? `${buffer}\n${next}` : next;
  }
  push();
  return parts.slice(0, 600);
}

export function mapTtsPlayPartsToDisplayParts(playParts: string[], displayParts: string[]): number[] {
  const normalizedDisplays = displayParts.map((part) => normalizeTtsHighlightText(part));
  let cursor = 0;
  return playParts.map((part) => {
    const needle = normalizeTtsHighlightText(part);
    if (!needle) return Math.max(0, Math.min(displayParts.length - 1, cursor));
    for (let attempt = 0; attempt < normalizedDisplays.length; attempt += 1) {
      const index = (cursor + attempt) % normalizedDisplays.length;
      if (normalizedDisplays[index]?.includes(needle) || needle.includes(normalizedDisplays[index] ?? "\u0000")) {
        cursor = index;
        return index;
      }
    }
    return Math.max(0, Math.min(displayParts.length - 1, cursor));
  });
}

export function primeTtsPrefetchOrder(
  chunkCount: number,
  startIndex: number,
  displayIndexByPart: number[],
  ahead: number,
  decodeAhead: number,
  boundaryAhead: number
): number[] {
  if (chunkCount <= 0) return [];
  const safeStart = Math.max(0, Math.min(chunkCount - 1, Math.floor(startIndex)));
  const order: number[] = [];
  const seen = new Set<number>();
  const add = (index: number) => {
    if (index < safeStart || index >= chunkCount || seen.has(index)) return;
    seen.add(index);
    order.push(index);
  };
  const immediateEnd = Math.min(chunkCount - 1, safeStart + Math.max(0, decodeAhead));
  for (let index = safeStart; index <= immediateEnd; index += 1) add(index);

  const currentDisplay = displayIndexByPart[safeStart];
  if (typeof currentDisplay === "number") {
    const boundaryEnd = Math.min(chunkCount - 1, safeStart + Math.max(ahead, boundaryAhead));
    for (let index = safeStart + 1; index <= boundaryEnd; index += 1) {
      if ((displayIndexByPart[index] ?? currentDisplay) > currentDisplay) {
        add(index);
        break;
      }
    }
  }

  const linearEnd = Math.min(chunkCount - 1, safeStart + Math.max(0, ahead));
  for (let index = safeStart; index <= linearEnd; index += 1) add(index);
  return order;
}

export function ttsLongSegmentTakeLength(text: string, targetLength: number, hardLength: number): number {
  if (text.length <= hardLength) return text.length;
  const min = Math.max(40, Math.floor(targetLength * 0.7));
  const hard = Math.min(text.length, hardLength);
  for (let index = hard - 1; index >= min; index -= 1) {
    if ("。！？；.!?;".includes(text[index] ?? "")) return index + 1;
  }
  for (let index = hard - 1; index >= min; index -= 1) {
    if ((text[index] ?? "") === "\n") return index + 1;
  }
  for (let index = hard - 1; index >= min; index -= 1) {
    if ("，,、：:".includes(text[index] ?? "")) return index + 1;
  }
  return Math.min(text.length, targetLength);
}

export function adjustPrimeTtsDisplayBoundary(text: string, candidate: number, min: number, hard: number): number {
  const adjusted = adjustPrimeTtsTakeBoundary(text, candidate, min, hard);
  if (adjusted >= text.length) return text.length;
  const before = text[adjusted - 1] ?? "";
  const after = text[adjusted] ?? "";
  if (!isCjkChar(before) || !isCjkChar(after)) return adjusted;
  let runStart = adjusted - 1;
  while (runStart > 0 && isCjkChar(text[runStart - 1] ?? "")) runStart -= 1;
  let runEnd = adjusted;
  while (runEnd < text.length && isCjkChar(text[runEnd] ?? "")) runEnd += 1;
  const run = text.slice(runStart, runEnd);
  const tokens = splitPrimeTtsCjkRunTokens(run);
  let cursor = runStart;
  const boundaries: number[] = [];
  for (const token of tokens) {
    cursor += token.length;
    boundaries.push(cursor);
  }
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    const boundary = boundaries[index];
    if (boundary <= adjusted && boundary >= min) return boundary;
  }
  for (const boundary of boundaries) {
    if (boundary > adjusted && boundary <= hard) return boundary;
  }
  return adjusted;
}

export type PrimeTtsAdaptiveStage = 0 | 1 | 2 | 3;

export interface PrimeTtsSentenceFragment {
  text: string;
  endsSentence: boolean;
}

export interface PrimeTtsAdaptiveSplit {
  parts: string[];
  nextStage: PrimeTtsAdaptiveStage;
}

export function coalescePrimeTtsPlayableParts(input: string[]): string[] {
  const repaired = input.map((part) => part.trim()).filter(Boolean);
  for (let index = 0; index + 1 < repaired.length; index += 1) {
    const part = repaired[index] ?? "";
    const next = repaired[index + 1] ?? "";
    if (!part || !next) continue;
    const lastCode = part.charCodeAt(part.length - 1);
    const firstCode = next.charCodeAt(0);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff && firstCode >= 0xdc00 && firstCode <= 0xdfff) {
      repaired[index] = part.slice(0, -1);
      repaired[index + 1] = `${part.slice(-1)}${next}`;
    }
  }
  const output: string[] = [];
  let pendingSymbols = "";
  for (const part of repaired) {
    if (!part) continue;
    if (!hasPrimeTtsReadableToken(part)) {
      pendingSymbols += part;
      continue;
    }
    output.push(`${pendingSymbols}${part}`);
    pendingSymbols = "";
  }
  if (pendingSymbols && output.length) output[output.length - 1] += pendingSymbols;
  return output.filter(hasPrimeTtsReadableToken);
}

export function primeTtsSynthesisText(input: string): string {
  let output = "";
  for (const char of Array.from(input.normalize("NFC"))) {
    if (hasPrimeTtsReadableToken(char) || /\s/.test(char)) {
      output += char;
      continue;
    }
    if (isPrimeTtsIgnorableSymbolChar(char) || /\p{Extended_Pictographic}/u.test(char) || /\p{S}/u.test(char)) {
      output += " ";
      continue;
    }
    output += normalizePrimeTtsMicroPunctuation(char);
  }
  return output.replace(/[\t ]+/g, " ").replace(/\s+([，。！？；：,.!?;:])/g, "$1").trim();
}

export function splitPrimeTtsSentenceFragments(input: string): PrimeTtsSentenceFragment[] {
  const fragments: PrimeTtsSentenceFragment[] = [];
  let buffer = "";
  let pendingLatinStop = false;
  const push = (endsSentence: boolean) => {
    const value = buffer.trim();
    if (value && hasPrimeTtsReadableToken(value)) fragments.push({ text: value, endsSentence });
    buffer = "";
    pendingLatinStop = false;
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    buffer += char;
    if (char === "\n") {
      push(true);
      continue;
    }
    if ("。！？；!?;".includes(char)) {
      while (/[”’\"'）)\]】》」』]/.test(input[index + 1] ?? "")) {
        index += 1;
        buffer += input[index] ?? "";
      }
      push(true);
      continue;
    }
    if (char === ".") {
      const before = input[index - 1] ?? "";
      const after = input[index + 1] ?? "";
      if (!(/\d/.test(before) && /\d/.test(after))) pendingLatinStop = true;
      continue;
    }
    if (pendingLatinStop && /\s/.test(char)) {
      push(true);
      while (/\s/.test(input[index + 1] ?? "") && input[index + 1] !== "\n") index += 1;
    } else if (pendingLatinStop && /[”’\"'）)\]】》」』]/.test(char)) {
      continue;
    } else if (!/\s/.test(char)) {
      pendingLatinStop = false;
    }
  }
  push(pendingLatinStop);
  return fragments;
}

export function takePrimeTtsStartupChunk(input: string, readableUnits: number): { text: string; length: number } | null {
  const start = input.search(/\S/);
  if (start < 0) return null;
  let cursor = start;
  while (/[“‘\"'（(【\[「『《<]/.test(input[cursor] ?? "")) cursor += 1;
  const prefixEnd = cursor;
  const first = Array.from(input.slice(cursor))[0];
  if (!first) return null;
  if (/[A-Za-z]/.test(first)) {
    while (cursor < input.length && /[A-Za-z0-9'_-]/.test(input[cursor] ?? "")) cursor += 1;
  } else if (/\d/.test(first)) {
    while (cursor < input.length && /[\d./:%％]/.test(input[cursor] ?? "")) cursor += 1;
  } else {
    const units = Math.max(1, readableUnits);
    for (let count = 0; count < units && cursor < input.length; count += 1) {
      const codePoint = Array.from(input.slice(cursor))[0];
      if (!codePoint || isPrimeTtsMicroPunctuation(codePoint)) break;
      cursor += codePoint.length;
    }
  }
  if (cursor <= prefixEnd) cursor = Math.min(input.length, prefixEnd + 1);
  while (cursor < input.length && isPrimeTtsMicroPunctuation(input[cursor] ?? "")) cursor += 1;
  return { text: input.slice(start, cursor).trim(), length: cursor };
}

export function takePrimeTtsRampChunk(input: string, targetLength: number): { text: string; length: number } | null {
  const start = input.search(/\S/);
  if (start < 0) return null;
  const hard = Math.min(input.length, Math.max(4, targetLength + 6));
  const min = Math.min(hard, Math.max(4, Math.floor(targetLength * 0.55)));
  for (let index = hard - 1; index >= min; index -= 1) {
    const char = input[index] ?? "";
    if (("，,、：:".includes(char) || /\s/.test(char)) && isPrimeTtsSoftBreak(input, index)) {
      return { text: input.slice(start, index + 1).trim(), length: index + 1 };
    }
  }
  const take = adjustPrimeTtsTakeBoundary(input, Math.min(input.length, targetLength), min, hard);
  return { text: input.slice(start, take).trim(), length: take };
}

export function splitPrimeTtsCjkRunTokens(run: string): string[] {
  if (!run) return [];
  return Array.from(run);
}

export function normalizePrimeTtsMicroText(input: string): string {
  return normalizeTtsInputText(input)
    .replace(/(^|[^\w./\\-])0+(\d+(?:\.\d+)?)(?=$|[^\w./\\-])/g, (_match, prefix: string, number: string) => {
      return `${prefix}${normalizePrimeTtsMicroNumberToken(number)}`;
    });
}

export function normalizePrimeTtsMicroNumberToken(token: string): string {
  if (!token) return token;
  if (token.includes(".")) {
    const [integer, fraction = ""] = token.split(".");
    const normalizedInteger = integer.replace(/^0+(?=\d)/, "") || "0";
    return fraction ? `${normalizedInteger}.${fraction}` : normalizedInteger;
  }
  return token.replace(/^0+(?=\d)/, "") || "0";
}

export function splitPrimeTtsMicroLatinToken(token: string): string[] {
  const clean = token.replace(/^'+|'+$/g, "").trim();
  if (!clean) return [];
  return [clean];
}

export function isPrimeTtsMicroPunctuation(char: string): boolean {
  return !!normalizePrimeTtsMicroPunctuation(char);
}

export function normalizePrimeTtsMicroPunctuation(char: string): string {
  if (!char || isPrimeTtsIgnorableSymbolChar(char)) return "";
  if (char === "…" || char === "⋯" || char === "⋮") return "。";
  if (/[。.!！?？]/.test(char)) return char;
  if (/[，,；;：:、]/.test(char)) return char;
  if (/[\p{P}\p{S}]/u.test(char)) return "，";
  return "";
}

export function normalizePrimeTtsSpecialSymbolAsPunctuation(char: string): string {
  const punctuation = normalizePrimeTtsMicroPunctuation(char);
  if (punctuation) return punctuation;
  return "";
}

export function hasPrimeTtsReadableToken(input: string): boolean {
  return /[\u3400-\u9fffA-Za-z0-9]/.test(input);
}

export function isPrimeTtsIgnorableSymbolChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2060 && code <= 0x206f) || (code >= 0xfe00 && code <= 0xfe0f);
}

export function isPrimeTtsStrongBreak(text: string, index: number): boolean {
  const char = text[index] ?? "";
  if (char !== ".") return true;
  const before = text[index - 1] ?? "";
  const after = text[index + 1] ?? "";
  return !(/\d/.test(before) && /\d/.test(after));
}

export function isPrimeTtsSoftBreak(text: string, index: number): boolean {
  const char = text[index] ?? "";
  const before = text[index - 1] ?? "";
  const after = text[index + 1] ?? "";
  if (char === "," && /\d/.test(before) && /\d/.test(after)) return false;
  if ((char === ":" || char === "：") && /\d/.test(before) && /\d/.test(after)) return false;
  return true;
}

export function chineseNumberReadingMode(input: string): "none" | "context" | "full" {
  const compact = input.replace(/\s+/g, "");
  const cjkCount = (compact.match(/[\u3400-\u9fff]/g) ?? []).length;
  const digitCount = (compact.match(/\d/g) ?? []).length;
  const latinCount = (compact.match(/[A-Za-z]/g) ?? []).length;
  if (!cjkCount || !digitCount) return "none";
  if (cjkCount >= 4 && cjkCount >= latinCount * 2) return "full";
  return "context";
}

export function isProtectedNumberToken(text: string, offset: number, length: number): boolean {
  const before = text.slice(Math.max(0, offset - 16), offset);
  const after = text.slice(offset + length, offset + length + 16);
  if (/https?:\/\/\S*$/i.test(before) || /(?:^|[\s([{<])(?:[A-Za-z]:)?(?:[./\\]|[A-Za-z0-9_-]+[./\\])[\w./\\-]*$/i.test(before)) return true;
  if (/^[A-Za-z_./\\-]/.test(after) || /[A-Za-z_./\\-]$/.test(before)) return true;
  if (/\bv(?:ersion)?\.?$/i.test(before) || /^[.-]\d/.test(after)) return true;
  return false;
}

export function isChineseNumberContext(text: string, offset: number, length: number): boolean {
  const before = text.slice(Math.max(0, offset - 8), offset);
  const after = text.slice(offset + length, offset + length + 8);
  if (/https?:\/\/|[A-Za-z_./\\-]$/.test(before) || /^[A-Za-z_./\\-]/.test(after)) return false;
  return /[\u3400-\u9fff年月日号点第个条项次章节页岁分秒小时分钟%％：:，,。！？、；;（）()]/.test(before + after);
}

export function normalizeTtsInputText(input: string): string {
  return input
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\t ]+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1$2")
    .replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\n(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function adjustPrimeTtsTakeBoundary(text: string, candidate: number, min: number, hard: number): number {
  let cut = Math.max(1, Math.min(text.length, candidate));
  if (cut < text.length) {
    const beforeCode = text.charCodeAt(cut - 1);
    const afterCode = text.charCodeAt(cut);
    if (beforeCode >= 0xd800 && beforeCode <= 0xdbff && afterCode >= 0xdc00 && afterCode <= 0xdfff) {
      cut = cut + 1 <= hard ? cut + 1 : Math.max(1, cut - 1);
    }
  }
  if (cut >= text.length) return text.length;
  const before = text[cut - 1] ?? "";
  const after = text[cut] ?? "";
  if (/\d/.test(before) && /[年月日号时点分秒%％]/.test(after)) {
    let end = cut + 1;
    while (end < text.length && /[年月日号时点分秒%％]/.test(text[end] ?? "")) end += 1;
    if (end <= hard) return end;
  }
  if (!isPrimeTtsInlineTokenChar(before) || !isPrimeTtsInlineTokenChar(after)) return cut;
  let start = cut - 1;
  while (start > 0 && isPrimeTtsInlineTokenChar(text[start - 1] ?? "")) start -= 1;
  let end = cut;
  while (end < text.length && isPrimeTtsInlineTokenChar(text[end] ?? "")) end += 1;
  while (end < text.length && /[年月日号时点分秒%％]/.test(text[end] ?? "")) end += 1;
  if (start >= min) return start;
  if (end <= hard) return end;
  if (/[A-Za-z]/.test(text.slice(start, end))) return end;
  return cut;
}

export function isPrimeTtsInlineTokenChar(char: string): boolean {
  return /[A-Za-z0-9_.:%％]/.test(char);
}

export function splitTtsTextSegments(input: string): TtsTextSegment[] {
  const segments: TtsTextSegment[] = [];
  let buffer = "";
  let pendingBreak = false;
  const push = (forcedBreak = false) => {
    const text = buffer.trim();
    if (text) segments.push({ text, forcedBreak });
    buffer = "";
    pendingBreak = false;
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    buffer += char;
    if (char === "\n") {
      push(true);
      while (input[index + 1] === "\n") index += 1;
      continue;
    }
    if ("。！？；".includes(char)) {
      push(false);
      continue;
    }
    if ("，、：,:".includes(char) && normalizeTtsHighlightText(buffer).length >= 10) {
      push(false);
      continue;
    }
    if (".!?;".includes(char)) {
      pendingBreak = true;
      continue;
    }
    if (pendingBreak && /\s/.test(char)) {
      push(false);
      while (/\s/.test(input[index + 1] ?? "") && input[index + 1] !== "\n") index += 1;
    } else if (!/\s/.test(char)) {
      pendingBreak = false;
    }
  }
  push(false);
  return segments;
}

export function shouldFoldCodeBlock(lang: string, body: string): boolean {
  if (lang === "cancip-action") return true;
  if (["bash", "sh", "zsh", "shell", "powershell", "ps1", "cmd", "bat", "terminal", "console"].includes(lang)) return true;
  if (["ts", "tsx", "js", "jsx", "json", "html", "css", "python", "py", "diff"].includes(lang)) return true;
  if (looksLikeProcessProtocolLeakText(body)) return true;
  if (lang === "text" && /^#{2,3}\s+(?:api profile|token usage|model exchange raw contents|actual api call audit|input sizes|reply filter|raw sent|raw received|parsed extracted|visible answer|sent system|sent contexttext|sent turn prompt|sent actual user inputtext|original user prompt|previous attempt|summary|routing summary|included sources)\b/im.test(body)) return true;
  if ((lang === "json" || !lang) && /^\{\s*"?(?:actions|type)"?\s*:/.test(body.trim())) return true;
  if (/^(?:\$|>|PS>|powershell|cmd|node|npm|git|gh|python|py|obsidian|cancip)\b/im.test(body.trim())) return true;
  return false;
}

export function foldProcessAfterConclusion(content: string, hiddenToolBlocks: FoldedMessageBlock[]): string {
  const lines = content.split(/\r?\n/);
  const cutIndex = findProcessTailCutIndex(lines);
  if (cutIndex < 0) return content;
  const visible = lines.slice(0, cutIndex).join("\n");
  const hidden = lines.slice(cutIndex).join("\n");
  if (!visible.trim() || !hidden.trim()) return content;
  hiddenToolBlocks.push({ title: "process", content: hidden });
  return visible.trimEnd();
}

export function findProcessTailCutIndex(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    if (index < 2) continue;
    const trimmed = lines[index].trim();
    if (!trimmed) continue;
    if (isProcessSectionLine(trimmed)) return index;
    if (hasConclusionCueBefore(lines, index) && !isInsideFinalAnswerNumberedSection(lines, index) && looksLikeVerboseProcessLine(trimmed)) return index;
  }
  return -1;
}

export function hasConclusionCueBefore(lines: string[], index: number): boolean {
  const before = lines.slice(0, index).join("\n").replace(/\s+/g, "");
  return /(?:最终结论|Finalanswer|已完成|没完成|未完成|部分完成|失败|等待确认|下一步)/i.test(before);
}

export function isProcessSectionLine(trimmed: string): boolean {
  return /^(?:#{1,6}\s*)?(?:过程|执行过程|操作过程|工具过程|命令过程|过程记录|工具执行结果|执行详情|命令详情|细节|详情|步骤|检查|验证|日志|我做了这些|刚才我做了这些|本次执行|尝试过程|process|details?|steps?|commands?|logs?)[:：]?\s*$/i.test(trimmed);
}

export function looksLikeVerboseProcessLine(trimmed: string): boolean {
  return /^(?:刚才我(?:做了|执行了|尝试了)这些|我(?:刚才|已经)?(?:做了|执行了|尝试了)|本次(?:执行|操作|改动|尝试)|尝试(?:修改|读取|执行)|工具执行结果|动作失败|失败步骤|失败原因|patch find text was not found|patch 修改|read |write |patch |command )[:：\s]/i.test(trimmed);
}

export function isInsideFinalAnswerNumberedSection(lines: string[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor].trim();
    if (!line) continue;
    if (isFinalAnswerNumberedSectionLine(line)) return true;
    if (/^(?:#{1,6}\s*)?(?:过程|执行过程|操作过程|工具过程|过程记录|日志|process|logs?)[:：]?\s*$/i.test(line)) return false;
    if (/^\d{1,2}[.)、]\s+/.test(line)) return false;
  }
  return false;
}

export function isFinalAnswerNumberedSectionLine(line: string): boolean {
  return /^\d{1,2}[.)、]\s*(?:动作|改动|修改|读取|文件|验证|结果|提醒|阻塞|记忆|规则|总结|Actions?|Changed|Files?|Verification|Result|Reminder|Memory|Rules?)(?:\s|$|[:：/])/i.test(line);
}

export function foldReasoningSections(content: string, hiddenToolBlocks: FoldedMessageBlock[]): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!/^(?:#{1,6}\s*)?(?:思考过程|思考|推理过程|命令|执行命令|thinking|reasoning|commands?)[:：]?\s*$/i.test(trimmed)) {
      kept.push(line);
      continue;
    }

    const section: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const next = lines[cursor];
      const nextTrimmed = next.trim();
      if (!nextTrimmed) break;
      if (/^#{1,6}\s+/.test(nextTrimmed)) break;
      section.push(next);
      cursor += 1;
    }

    if (section.length) {
      hiddenToolBlocks.push({ title: trimmed, content: `${trimmed}\n${section.join("\n").trim()}` });
      index = cursor;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

export function foldModelReasoningArtifacts(content: string, hiddenToolBlocks: FoldedMessageBlock[]): string {
  const cueFolded = foldBeforeFinalOutputCue(content, hiddenToolBlocks);
  return foldReasoningTailAfterFinalAnswer(cueFolded.content, hiddenToolBlocks, cueFolded.hadCue);
}

export function stripModelReasoningArtifacts(content: string): string {
  const hidden: FoldedMessageBlock[] = [];
  let text = content.replace(/<(think|thinking|reasoning)\b[^>]*>[\s\S]*?<\/\1>/gi, "\n\n");
  // deepseek 系模型经部分代理时会把原生 DSML 工具调用语法（<|dsml|invoke ...>，
  // 竖线常为全角 U+FF5C）以纯文本泄漏到 content。这些标记对用户是乱码，
  // 从可见文本中删除；独立成行的标记整行删除，行内成对标记连同参数一并删除。
  text = text.replace(/^[^\S\n]*<\s*[/|｜]{0,3}\s*dsml\s*[|｜]{0,3}[^>\n]*>[^\S\n]*$/gim, "");
  text = text.replace(/<\s*[/|｜]{0,3}\s*dsml\s*[|｜]{0,3}[^>\n]*>([\s\S]{0,400}?)<\s*[/|｜]{0,3}\s*dsml\s*[|｜]{0,3}[^>\n]*>/gi, "\n\n");
  text = foldReasoningSections(text, hidden);
  return foldModelReasoningArtifacts(text, hidden);
}

export function sanitizeModelVisibleAnswer(content: string): string {
  return stripModelReasoningArtifacts(content).replace(/\n{3,}/g, "\n\n").trim();
}

export function foldBeforeFinalOutputCue(content: string, hiddenToolBlocks: FoldedMessageBlock[]): { content: string; hadCue: boolean } {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = finalOutputCueMatch(lines[index].trim());
    if (!match) continue;
    const before = lines.slice(0, index).join("\n").trim();
    if (!before || !looksLikeModelReasoningArtifact(before)) return { content, hadCue: true };
    hiddenToolBlocks.push({ title: "reasoning", content: before });
    const tail = [match[1]?.trim() ?? "", ...lines.slice(index + 1)].filter(Boolean).join("\n").trim();
    return { content: tail || content, hadCue: true };
  }
  return { content, hadCue: false };
}

export function foldReasoningTailAfterFinalAnswer(content: string, hiddenToolBlocks: FoldedMessageBlock[], hadFinalCue: boolean): string {
  if (!hadFinalCue) return content;
  const lines = content.split(/\r?\n/);
  let meaningfulSeen = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) continue;
    if (meaningfulSeen > 0 && isReasoningTailMetaLine(trimmed)) {
      const visible = lines.slice(0, index).join("\n").trim();
      const hidden = lines.slice(index).join("\n").trim();
      if (visible && hidden) hiddenToolBlocks.push({ title: "reasoning", content: hidden });
      return visible || content;
    }
    meaningfulSeen += 1;
  }
  return content;
}

export function finalOutputCueMatch(trimmed: string): RegExpMatchArray | null {
  return trimmed.match(/^(?:#{1,6}\s*)?(?:最终输出格式|最终输出|最终答案|最终回答|直接输出|Final output|Final answer)\s*[:：]\s*(.*)$/i);
}

export function looksLikeModelReasoningArtifact(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 24) return false;
  return /(?:思考|推理|reasoning|think|用户要求|模板|注意|另外注意|需要|我们|数一下|输出格式|最终输出|这里|保持|替换|解释|分析)/i.test(text);
}

export function isReasoningTailMetaLine(trimmed: string): boolean {
  return /^(?:另外注意|特别注意|注意(?:顺序|这里|模板|格式)?|用户要求|最终回答直接|直接输出整理|不要解释|不需要解释|我们(?:保持|需要|应该|要)|需要(?:替换|注意|保持|输出)|这里(?:需要|应该|要)|说明[:：]?|解释[:：]?)/i.test(trimmed);
}

export function finalChoiceOptions(content: string): ChoiceOption[] {
  const withoutStats = stripProgrammaticRunStats(content).content;
  return choiceOptionsFromTexts(extractStructuredChoiceTexts(withoutStats)).concat(extractChoiceOptions(withoutStats));
}

export function requestedFinalChoiceCount(prompt: string): number {
  const digit = (value: string): number => ({ "一": 1, "二": 2, "三": 3 }[value] ?? Number(value));
  const matches = [
    prompt.match(/(?:给出|生成|提供|附上|带上|显示|出现)\s*(?:约\s*)?([123一二三])\s*个[^。！？\n]{0,28}(?:推荐|选项|按钮|下一步)/i),
    prompt.match(/(?:推荐|选项|按钮|下一步)[^。！？\n]{0,20}(?:给出|生成|提供|附上|带上|显示|出现)?\s*([123一二三])\s*个/i),
    prompt.match(/(?:give|provide|include|show)\s+(?:about\s+)?([123])\s+(?:concrete\s+)?(?:recommendations?|choices?|buttons?|next steps?)/i)
  ];
  for (const match of matches) {
    const count = match?.[1] ? digit(match[1]) : 0;
    if (count >= 1 && count <= 3) return count;
  }
  return 0;
}

export function stripTailChoiceSection(content: string): string {
  const cleaned = stripStructuredChoices(content);
  const lines = cleaned.split(/\r?\n/);
  let inFence = false;
  let cueIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && isChoiceCueLine(trimmed)) cueIndex = index;
  }
  if (cueIndex < 0) return cleaned.trim();

  const skip = new Set<number>([cueIndex]);
  const choiceIndexes: number[] = [];
  let lastChoiceIndex = cueIndex;
  for (let index = cueIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      skip.add(index);
      continue;
    }
    const choiceText = listedChoiceText(trimmed);
    if (choiceText && normalizeChoiceText(choiceText)) {
      skip.add(index);
      choiceIndexes.push(index);
      lastChoiceIndex = index;
      continue;
    }
    break;
  }
  if (choiceIndexes.length < 2) return cleaned.trim();

  const remainingAfterChoices = lines
    .slice(lastChoiceIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (remainingAfterChoices.length > 2 || remainingAfterChoices.some((line) => !isChoiceSectionTrailingMeta(line))) {
    return cleaned.trim();
  }

  if (!lines[lastChoiceIndex + 1]?.trim()) skip.add(lastChoiceIndex + 1);
  const kept = lines.filter((_line, index) => !skip.has(index)).join("\n");
  return kept.replace(/\n{3,}/g, "\n\n").trim();
}

export function stripStructuredChoices(content: string): string {
  return content
    .replace(/<!--\s*cancip-choices\b[\s\S]*?-->/gi, "\n\n")
    .replace(/<cancip-choices\b[^>]*>[\s\S]*?<\/cancip-choices>/gi, "\n\n")
    .replace(/```cancip-choices\s*[\s\S]*?```/gi, "\n\n");
}

export function extractChoiceSourceText(content: string): string {
  const blocks: string[] = [];
  for (const match of content.matchAll(/<!--\s*cancip-choices\b[\s\S]*?-->/gi)) blocks.push(match[0]);
  for (const match of content.matchAll(/<cancip-choices\b[^>]*>[\s\S]*?<\/cancip-choices>/gi)) blocks.push(match[0]);
  for (const match of content.matchAll(/```cancip-choices\s*[\s\S]*?```/gi)) blocks.push(match[0]);

  const tail = extractTailChoiceSection(content);
  if (tail) blocks.push(tail);
  return uniqueStrings(blocks.map((block) => block.trim()).filter(Boolean)).join("\n\n");
}

export function extractTailChoiceSection(content: string): string {
  const cleaned = stripStructuredChoices(content);
  const lines = cleaned.split(/\r?\n/);
  let inFence = false;
  let cueIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && isChoiceCueLine(trimmed)) cueIndex = index;
  }
  if (cueIndex < 0) return "";

  const section: string[] = [lines[cueIndex]];
  const choiceLines: string[] = [];
  let lastChoiceIndex = cueIndex;
  for (let index = cueIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      if (choiceLines.length) section.push(lines[index]);
      continue;
    }
    const choiceText = listedChoiceText(trimmed);
    if (choiceText && normalizeChoiceText(choiceText)) {
      section.push(lines[index]);
      choiceLines.push(lines[index]);
      lastChoiceIndex = index;
      continue;
    }
    break;
  }
  if (choiceLines.length < 2) return "";
  const remainingAfterChoices = lines
    .slice(lastChoiceIndex + 1)
    .map((line) => line.trim())
    .filter(Boolean);
  if (remainingAfterChoices.length > 2 || remainingAfterChoices.some((line) => !isChoiceSectionTrailingMeta(line))) return "";
  return section.join("\n").trim();
}

export function extractStructuredChoiceTexts(content: string): string[] {
  const blocks: string[] = [];
  const pushMatches = (regex: RegExp, groupIndex: number): void => {
    for (const match of content.matchAll(regex)) {
      const value = match[groupIndex];
      if (value?.trim()) blocks.push(value.trim());
    }
  };
  pushMatches(/<!--\s*cancip-choices\b([\s\S]*?)-->/gi, 1);
  pushMatches(/<cancip-choices\b[^>]*>([\s\S]*?)<\/cancip-choices>/gi, 1);
  pushMatches(/```cancip-choices\s*([\s\S]*?)```/gi, 1);

  const texts: string[] = [];
  for (const block of blocks) {
    const json = extractFirstJsonObject(block) || block;
    try {
      texts.push(...choiceTextsFromParsedJson(JSON.parse(json) as unknown));
      continue;
    } catch {
      // Fall through to line parsing.
    }
    texts.push(...block
      .split(/\r?\n|[，,；;]/)
      .map((line) => line.replace(/^[-*\d.)、\s]+/, "").trim())
      .filter(Boolean));
  }
  return uniqueStrings(texts).slice(0, 6);
}

export function finalReviewStatusFromAnswer(answer: string): FinalReviewStatus | "" {
  const markerCount = [...answer.matchAll(/<!--\s*cancip-final\b[\s\S]*?-->|<cancip-final\b[^>]*\/?\s*>/gi)].length;
  if (markerCount !== 1) return "";
  const comment = answer.match(/<!--\s*cancip-final\s+(\{[\s\S]*?\})\s*-->/i);
  if (comment) {
    try {
      const parsed = JSON.parse(comment[1]) as { status?: unknown };
      const status = typeof parsed.status === "string" ? parsed.status.trim().toLowerCase() : "";
      if (status === "complete" || status === "awaiting-approval" || status === "blocked" || status === "failed") return status;
    } catch {
      return "";
    }
  }
  const attribute = answer.match(/<cancip-final\b[^>]*\bstatus=["'](complete|awaiting-approval|blocked|failed)["'][^>]*\/?\s*>/i);
  return attribute?.[1]?.toLowerCase() as FinalReviewStatus | undefined ?? "";
}

export function stripFinalReviewMetadata(content: string): string {
  return content
    .replace(/<!--\s*cancip-final\s+\{[\s\S]*?\}\s*-->/gi, "\n\n")
    .replace(/<cancip-final\b[^>]*\/?\s*>/gi, "\n\n");
}

export function isToolPrefaceOnlyAnswer(text: string): boolean {
  const visible = stripTailChoiceSection(text).trim();
  if (!visible) return false;
  if (visible.length > 180) return false;
  if (hasFinalConclusion(visible)) return false;
  const compact = visible.replace(/\s+/g, "").toLowerCase();
  if (!compact) return false;
  if (/(已完成|已读取|已读完|已检查|已修改|已写入|已验证|改动的文件|读取的文件|结果和提醒|done|completed|changedfiles|verification|result)/i.test(compact)) return false;
  const hasPrefaceVerb = /(我先|先|接下来|下一步|现在|马上|随后|稍后|将会|我会|我将|先来|先去|i'?ll|iwill|i’mgoingto|goingto|nexti|letme)/i.test(compact);
  const hasToolVerb = /(读取|读一下|查看|看看|检查|检索|搜索|查找|打开|分析|随后|然后|再|写回|修改|美化|排版|read|inspect|check|search|open|analy[sz]e|then|afterthat|writeback|modify|format)/i.test(compact);
  return hasPrefaceVerb && hasToolVerb;
}

export function isProseApprovalRequestAnswer(text: string, taskGoal = ""): boolean {
  const visible = stripTailChoiceSection(stripModelRunStatsLines(text)).trim();
  if (!visible) return false;
  if (visible.length > 520) return false;
  if (hasFinalConclusion(visible)) return false;
  const compact = visible.replace(/\s+/g, "").toLowerCase();
  if (!compact) return false;
  if (/(已完成|已执行|已运行|执行成功|运行成功|已打开|已写入|已修改|已验证|done|completed|executed|succeeded)/i.test(compact)) return false;
  const asksForApproval = /(需要(?:执行|运行|调用|打开|写入|修改|移动|删除|配置|批准|确认)|待确认|等待确认|请(?:确认|批准|允许)|是否(?:执行|运行|继续|打开)|要不要(?:执行|运行|继续|打开)|点(?:批准|运行|确认)|tap(?:approve|run)|pendingapproval|approvalrequired|needs(?:to)?(?:run|execute|approval)|requiresapproval)/i.test(compact);
  if (!asksForApproval) return false;
  if (taskGoal && shouldExpectToolActionForPrompt(taskGoal)) return true;
  return /(执行|运行|调用|打开|写入|修改|移动|删除|配置|命令|批准|确认|obsidian|command|tts|readaloud|open|execute|run|write|modify|delete|move|configure|approve)/i.test(compact);
}

export function isAvoidableImplementationQuestionAnswer(text: string, taskGoal = ""): boolean {
  if (!taskGoal || classifyPromptIntent(taskGoal) !== "implementation") return false;
  const visible = stripTailChoiceSection(stripModelRunStatsLines(text)).trim();
  if (!visible || visible.length > 520 || hasFinalConclusion(visible)) return false;
  if (isConcreteMissingInputBlocker(visible, taskGoal)) return false;
  const compact = visible.replace(/\s+/g, "").toLowerCase();
  if (/(密码|密钥|token|验证码|账号|真实交易|下单|删除确认|永久删除|不可逆|password|secret|credential|2fa|destructive|irreversible)/i.test(compact)) return false;
  return /(请(?:提供|告诉|补充|指定).{0,40}(?:文件|路径|位置|内容|需求|目标)|需要.{0,30}(?:更多|具体|额外)(?:信息|上下文)|你希望.{0,40}(?:吗|？)|是否(?:需要|要|继续)|要不要|如果你愿意|我可以.{0,40}(?:继续|帮你|执行)|whichfile|provide.{0,20}(?:file|path|details)|wouldyoulikeme|shouldi)/i.test(compact);
}

export function isConcreteMissingInputBlocker(text: string, taskGoal = ""): boolean {
  if (!taskGoal || classifyPromptIntent(taskGoal) !== "implementation") return false;
  const visible = stripTailChoiceSection(stripModelRunStatsLines(text)).replace(/\s+/g, " ").trim();
  if (!visible || visible.length < 8 || visible.length > 700) return false;
  const hasMissing = /(?:缺少|未提供|没有提供|未指定|没有指定|还没给|没给|需要提供|需要指定|missing|required|need(?:s)?|provide|specify)/i.test(visible);
  const hasConcreteField = /(?:文件名|保存路径|路径|位置|目录|文件夹|目标文件|目标|内容|正文|选择|权限|能力|命令|filename|file name|path|folder|directory|target|content|permission|capability|command)/i.test(visible);
  const hasBlockerCue = /(?:阻塞|不能|无法|不可|失败|等待|尚未执行|没法|cannot|can't|blocked|failed|unable|waiting|not yet)/i.test(visible);
  if (!(hasMissing && hasConcreteField && hasBlockerCue)) return false;
  if (isBareCreateVaultFilePrompt(taskGoal)) return false;
  return true;
}

export function isOnlyRunStatsText(text: string): boolean {
  const compact = stripTailChoiceSection(text)
    .replace(/\s+/g, "")
    .replace(/[·:：/／|｜-]/g, "")
    .toLowerCase();
  if (!compact) return false;
  return /^(耗时|总耗时|elapsed|time|tokens|token|字数|chars|发送|接收|合计|in|out|total|estimated|\d+[a-z秒毫秒分钟小時小时]+)+$/i.test(compact);
}

export function choiceTextsFromParsedJson(parsed: unknown): string[] {
  if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  if (isRecord(parsed)) {
    const choices = parsed.choices;
    if (Array.isArray(choices)) return choices.filter((item): item is string => typeof item === "string");
  }
  return [];
}

export function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  return text.slice(start, end + 1);
}

export function markdownFrontmatterScalarFields(content: string): Map<string, string> {
  const fields = new Map<string, string>();
  const match = content.replace(/^\uFEFF/, "").match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return fields;
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/);
    if (!field) continue;
    let value = field[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fields.set(field[1].toLocaleLowerCase(), value);
  }
  return fields;
}

export function markdownHeadingsAtLevel(content: string, level: number): Array<{ title: string; line: number }> {
  const prefix = "#".repeat(level);
  const headings: Array<{ title: string; line: number }> = [];
  let fenced = false;
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line.startsWith(`${prefix} `) || line.startsWith(`${prefix}#`)) continue;
    const title = line.slice(prefix.length + 1).replace(/\s+#+\s*$/, "").trim();
    if (title) headings.push({ title, line: index + 1 });
  }
  return headings;
}

export function duplicateMarkdownHeadings(headings: Array<{ title: string; line: number }>): Array<{ title: string; lines: number[] }> {
  const groups = new Map<string, { title: string; lines: number[] }>();
  for (const heading of headings) {
    const key = heading.title.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const group = groups.get(key) ?? { title: heading.title, lines: [] };
    group.lines.push(heading.line);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.lines.length > 1);
}

export function parseFirstJsonObject(text: string): unknown {
  const raw = extractFirstJsonObject(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function choiceOptionsFromTexts(texts: string[]): ChoiceOption[] {
  const options = uniqueStrings(texts)
    .map(normalizeChoiceText)
    .filter(Boolean)
    .slice(0, 3);
  return options.map((text, index) => ({ prefix: String(index + 1), text }));
}

export function exactFinalChoiceOptionsFromTexts(texts: string[]): ChoiceOption[] {
  const unique = new Map<string, string>();
  for (const raw of texts) {
    const text = raw
      .replace(/<!--[^>]*-->/g, "")
      .replace(/^\s*(?:(?:\d{1,2})[.)、]|(?:[A-Ha-h])[.)]|[-*])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 2 || text.length > 140 || /[\r\n`{}]/.test(text)) continue;
    const key = text.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, text);
    if (unique.size >= 3) break;
  }
  return [...unique.values()].map((text, index) => ({ prefix: String(index + 1), text }));
}

export function normalizeChoiceOptions(raw: unknown[]): ChoiceOption[] {
  return raw
    .filter(isRecord)
    .map((item, index): ChoiceOption | null => {
      const text = typeof item.text === "string" ? normalizeChoiceText(item.text) : "";
      if (!text) return null;
      const prefix = typeof item.prefix === "string" && item.prefix.trim() ? item.prefix.trim() : String(index + 1);
      return { prefix, text };
    })
    .filter((item): item is ChoiceOption => item !== null)
    .slice(0, 3);
}

export function isChoiceOptionsStatus(value: unknown): value is NonNullable<ChatMessage["choiceOptionsStatus"]> {
  return value === "loading" || value === "ready" || value === "failed";
}

export function extractChoiceOptions(content: string): ChoiceOption[] {
  const visible = stripStructuredChoices(content);
  const lines = visible.split(/\r?\n/);
  const hasChoiceCue = lines.some((line) => isChoiceCueLine(line.trim()) || /(?:下一步|建议|推荐|你可以|我可以|继续帮你|请选择|next step|recommended|suggest|choose|option|select|pick)/i.test(line));
  if (!hasChoiceCue) return [];

  const choices: ChoiceOption[] = [];
  let inFence = false;
  let inNextStepSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (isChoiceCueLine(trimmed)) {
      inNextStepSection = true;
      continue;
    }
    if (inNextStepSection && /^#{1,6}\s+\S/.test(trimmed) && !/(?:下一步|建议|推荐|Next|Suggest|Option)/i.test(trimmed)) break;
    const match = trimmed.match(/^(?:(\d{1,2})[.)、]|([A-Ha-h])[.)]|[-*]\s+)\s*(.{2,140})$/);
    const text = listedChoiceText(trimmed);
    if (!match || !text) continue;
    if (!text || /^(https?:|```|\{|\[)/i.test(text)) continue;
    if (/^[\w.-]+\/[\w./-]+$/.test(text)) continue;
    if (!inNextStepSection && !looksLikeNextStepChoice(text)) continue;
    const normalized = normalizeChoiceText(text);
    if (!normalized) continue;
    const prefix = match[1] ?? match[2]?.toUpperCase() ?? String(choices.length + 1);
    choices.push({ prefix, text: normalized });
  }

  const unique = new Map<string, ChoiceOption>();
  for (const choice of choices) {
    const key = choice.text.toLowerCase();
    if (!unique.has(key)) unique.set(key, choice);
  }
  return [...unique.values()].slice(0, 3);
}

export function isChoiceCueLine(trimmed: string): boolean {
  if (!trimmed) return false;
  return /^(?:#{1,6}\s*)?(?:下一步|建议|推荐操作|推荐下一步|可选下一步|你可以|我可以|请选择|Next steps?|Recommended next steps?|Suggestions?|Options?)[:：]?\s*$/i.test(trimmed)
    || /^(?:#{1,6}\s*)?(?:如果你想|如果需要|你要是想|需要的话|想的话|后续我可以|我可以继续|可以继续).{0,34}(?:我可以|继续帮你|继续|帮你|处理|做|看|总结|解释)[^。！？\n]*[：:]?\s*$/i.test(trimmed);
}

export function listedChoiceText(trimmed: string): string {
  const match = trimmed.match(/^(?:(?:\d{1,2})[.)、]|(?:[A-Ha-h])[.)]|[-*]\s+)\s*(.{2,140})$/);
  return match ? match[1].trim() : "";
}

export function isChoiceSectionTrailingMeta(trimmed: string): boolean {
  return isModelRunStatsLine(trimmed);
}

export function looksLikeNextStepChoice(text: string): boolean {
  if (/[`{}[\]]/.test(text)) return false;
  if (text.length > 56) return false;
  return /^(?:继续|修复|检查|重试|总结|生成|打开|查看|看看|提取|解释|应用|确认|取消|导出|保存|重新|补充|执行|测试|验证|搜索|追问|提问|分析|优化|整理|对齐|精简|扩展|核对|进入|运行|朗读|播放|暂停|停止|接受|拒绝|修改|编辑|切换|发布|安装|升级|同步|删除|移动|复制|创建|Continue|Fix|Check|Retry|Summari[sz]e|Generate|Open|Review|Apply|Confirm|Cancel|Export|Save|Run|Test|Verify|Search|Ask|Analyze|Optimize|Organize|Align|Refine|Extract|Explain|Inspect|Read|Play|Pause|Stop|Accept|Reject|Edit|Switch|Release|Install|Upgrade|Sync|Delete|Move|Copy|Create)\b/i.test(text)
    || /(?:继续|修复|检查|重试|总结|生成|打开|查看|看看|提取|解释|应用|确认|取消|导出|保存|重新|补充|执行|测试|验证|搜索|追问|提问|分析|优化|整理|对齐|精简|扩展|核对|进入|运行|朗读|播放|暂停|停止|接受|拒绝|修改|编辑|切换|发布|安装|升级|同步|删除|移动|复制|创建|下一步)/.test(text);
}

export function normalizeChoiceText(text: string): string {
  let cleaned = text
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1"))
    .replace(/[*_~#>]+/g, "")
    .replace(/^\[[ x-]\]\s*/i, "")
    .replace(/^(?:下一步|建议|推荐|推荐操作|推荐下一步|可选下一步|你可以|请选择|Next steps?|Recommended next steps?|Suggestions?|Options?)[:：]\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[。；;,.，]+$/g, "")
    .trim();
  cleaned = shortenChoiceText(cleaned);
  if (!cleaned || cleaned.length < 2) return "";
  if (!isUsefulChoiceText(cleaned)) return "";
  return cleaned;
}

export function shortenChoiceText(text: string): string {
  let next = text.trim();
  if (looksLikePathQuery(next)) return next.length <= 64 ? next : "";
  const colonIndex = next.search(/[：:]/);
  if (colonIndex > 1 && next.length > 28) next = next.slice(0, colonIndex).trim();
  next = next.split(/[。；;]/)[0].trim();
  next = next.replace(/^(?:请|可以|你可以|建议|推荐|Please|You can|Recommended?)\s*/i, "").trim();
  if (/[\u3400-\u9fff]/.test(next) && next.length > 18) {
    const separators = ["，", "、", ",", " - ", " — ", " – "];
    for (const separator of separators) {
      const index = next.indexOf(separator);
      if (index > 3 && index <= 18) return next.slice(0, index).trim();
    }
    return next.length <= 24 ? next : "";
  }
  if (next.length <= 36) return next;
  const separators = ["，", ",", "、", " - ", " — ", " – "];
  for (const separator of separators) {
    const index = next.indexOf(separator);
    if (index > 4 && index <= 36) return next.slice(0, index).trim();
  }
  return next.length <= 42 ? next : "";
}

export function isUsefulChoiceText(text: string): boolean {
  if (!text || text.length > 64) return false;
  if (/[`{}[\]]/.test(text)) return false;
  if (/^(?:read|write|patch|config|command|todo|automation|npm|git|gh|node|python|powershell|cmd)\b/i.test(text)) return false;
  if (/^(?:https?:\/\/|[\w.-]+\/[\w./-]+$)/i.test(text)) return false;
  if (/^(?:原因|说明|结果|路径|文件|失败原因|失败步骤|总耗时|Total elapsed)\b/i.test(text)) return false;
  return looksLikeNextStepChoice(text) || /(?:下一步|继续|修复|检查|验证|总结|导出|重试|打开|查看|看看|提取|解释|补充|确认|取消|搜索|追问|提问|分析|优化|整理|对齐|精简|扩展|核对|进入|运行|朗读|播放|暂停|停止|接受|拒绝|修改|编辑|切换|发布|安装|升级|同步|删除|移动|复制|创建|fix|check|verify|retry|continue|summari[sz]e|extract|explain|export|open|review|search|ask|analy[sz]e|optimi[sz]e|organize|align|refine|inspect|run|read|play|pause|stop|accept|reject|edit|switch|release|install|upgrade|sync|delete|move|copy|create)/i.test(text);
}

export function normalizeToolRunLineDeltas(raw: unknown): ToolRunLineDelta[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const deltas = raw
    .filter(isRecord)
    .map((item): ToolRunLineDelta | null => {
      const path = typeof item.path === "string" ? normalizePath(item.path) : "";
      if (!path) return null;
      const added = Number(item.added);
      const removed = Number(item.removed);
      if (!Number.isFinite(added) || !Number.isFinite(removed)) return null;
      return {
        path,
        added: Math.max(0, Math.trunc(added)),
        removed: Math.max(0, Math.trunc(removed)),
        estimated: typeof item.estimated === "boolean" ? item.estimated : undefined
      };
    })
    .filter((item): item is ToolRunLineDelta => item !== null);
  return deltas.length ? deltas : undefined;
}

export function cloneToolRun(run: ToolRun): ToolRun {
  return {
    ...run,
    action: cloneJsonValue(run.action) as CancipAction,
    lineDeltas: run.lineDeltas?.map((item) => ({ ...item })),
    evidencePaths: run.evidencePaths ? [...run.evidencePaths] : undefined
  };
}

export function normalizeTokenUsage(raw: unknown): TokenUsage | undefined {
  if (!isRecord(raw)) return undefined;
  const inputTokens = tokenNumber(raw.inputTokens);
  const outputTokens = tokenNumber(raw.outputTokens);
  const totalTokens = tokenNumber(raw.totalTokens);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    cacheReadTokens: tokenNumber(raw.cacheReadTokens) ?? 0,
    cacheWriteTokens: tokenNumber(raw.cacheWriteTokens) ?? 0,
    reasoningTokens: tokenNumber(raw.reasoningTokens) ?? 0,
    estimated: raw.estimated === true
  };
}

/**
 * Process rows can represent more than one model lifecycle event after the
 * compact projection folds low-signal reasoning rows into an actionable row.
 * Sum distinct message telemetry while keeping the old value for a duplicate
 * render of the same message (SSE redraws must never double-count tokens).
 */
export function mergeProcessModelUsage(left: TokenUsage | undefined, right: TokenUsage | undefined, sameMessage = false): TokenUsage | undefined {
  if (!left) return right ? { ...right } : undefined;
  if (!right || sameMessage) return { ...left };
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    cacheReadTokens: (left.cacheReadTokens ?? 0) + (right.cacheReadTokens ?? 0),
    cacheWriteTokens: (left.cacheWriteTokens ?? 0) + (right.cacheWriteTokens ?? 0),
    reasoningTokens: (left.reasoningTokens ?? 0) + (right.reasoningTokens ?? 0),
    estimated: left.estimated || right.estimated
  };
}

export function mergeProcessModelTiming(left: ModelTiming | undefined, right: ModelTiming | undefined, sameMessage = false): ModelTiming | undefined {
  if (!left) return right ? { ...right } : undefined;
  if (!right || sameMessage) return { ...left };
  const firstTokenCandidates = [left.firstTokenAt, right.firstTokenAt].filter((value): value is number => Number.isFinite(value));
  const completedCandidates = [left.completedAt, right.completedAt].filter((value): value is number => Number.isFinite(value));
  return {
    startedAt: Math.min(left.startedAt, right.startedAt),
    firstTokenAt: firstTokenCandidates.length ? Math.min(...firstTokenCandidates) : undefined,
    completedAt: completedCandidates.length ? Math.max(...completedCandidates) : undefined
  };
}

export function normalizeModelTiming(raw: unknown): ModelTiming | undefined {
  if (!isRecord(raw)) return undefined;
  const startedAt = tokenNumber(raw.startedAt);
  if (startedAt === undefined || startedAt <= 0) return undefined;
  const firstTokenAt = tokenNumber(raw.firstTokenAt);
  const completedAt = tokenNumber(raw.completedAt);
  return {
    startedAt,
    firstTokenAt: firstTokenAt && firstTokenAt >= startedAt ? firstTokenAt : undefined,
    completedAt: completedAt && completedAt >= startedAt ? completedAt : undefined
  };
}

export function uniqueToolRunsById(runs: ToolRun[]): ToolRun[] {
  const seen = new Set<string>();
  const unique: ToolRun[] = [];
  for (const run of runs) {
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    unique.push(run);
  }
  return unique;
}

export function normalizeResumableTask(raw: unknown): ResumableTaskState | null {
  if (!isRecord(raw)) return null;
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  const reason = raw.reason === "stopped" || raw.reason === "failed" ? raw.reason : null;
  if (!prompt || !reason) return null;
  const at = Number.isFinite(Number(raw.at)) ? Number(raw.at) : Date.now();
  const detail = typeof raw.detail === "string" ? raw.detail : undefined;
  return { prompt, reason, at, detail };
}

export function normalizeProcessStepBrief(raw: unknown): ProcessStepBrief | undefined {
  if (!isRecord(raw)) return undefined;
  const rawReasoning = typeof raw.reasoning === "string" ? raw.reasoning.trim() : "";
  const rawNext = typeof raw.next === "string" ? raw.next.trim() : "";
  const boilerplate = /^(?:已有上下文需要转成当前任务的可执行动作或终态结论|先提取与当前任务直接相关的上下文，?减少无关发送|模型生成回复|根据已取得的证据，判断当前任务应直接回答还是调用具体工具|收到真实返回后再核对是否满足原始要求|the available context needs to become an executable action or terminal conclusion for the task|first gather only context directly relevant to the task to avoid unrelated input|model generates the response|use the available evidence to decide whether the task needs a direct answer or a concrete tool call|after receiving the real result, verify it satisfies the original request)[。.!！]?$/i;
  const reasoning = boilerplate.test(rawReasoning) ? "" : rawReasoning;
  const action = typeof raw.action === "string" ? raw.action.trim() : "";
  const result = typeof raw.result === "string" ? raw.result.trim() : "";
  const next = boilerplate.test(rawNext) ? "" : rawNext;
  if (!reasoning && !action && !result && !next) return undefined;
  return { reasoning, action, result, next };
}

export function normalizeProcessAuditSections(raw: unknown): ProcessAuditSection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sections = raw
    .filter(isRecord)
    .map((item): ProcessAuditSection | null => {
      const title = typeof item.title === "string" ? item.title : "";
      const content = typeof item.content === "string" ? item.content : "";
      const group = item.group === "sent" || item.group === "received" || item.group === "runtime" || item.group === "other"
        ? item.group
        : "other";
      if (!title || !content) return null;
      return { title, content, group, raw: item.raw === true };
    })
    .filter((item): item is ProcessAuditSection => item !== null);
  return sections.length ? sections : undefined;
}

export function normalizeSearchHits(raw: unknown): SearchHit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const hits = raw
    .filter(isRecord)
    .map((item): SearchHit | null => {
      const path = typeof item.path === "string" ? item.path : "";
      if (!path) return null;
      return {
        path,
        title: typeof item.title === "string" ? item.title : path,
        excerpt: typeof item.excerpt === "string" ? item.excerpt : "",
        score: typeof item.score === "number" ? item.score : 0
      };
    })
    .filter((item): item is SearchHit => item !== null);
  return hits.length ? hits : undefined;
}

export function formatDomActionResult(result: DomActionResult): string {
  return [
    `selector: ${result.selector}`,
    `index: ${result.index}`,
    `tag: ${result.tag}`,
    result.classes ? `classes: ${result.classes}` : "",
    result.text ? `text: ${result.text}` : ""
  ].filter(Boolean).join("\n");
}

export function uiElementLabel(el: HTMLElement): string {
  return uiElementLabelCandidates(el)[0]
    || String(el.className || "").replace(/\s+/g, " ").trim()
    || el.tagName;
}

export function uiElementLabelCandidates(el: HTMLElement): string[] {
  const labelEl = el.querySelector<HTMLElement>(".menu-item-title, .view-action-title, .nav-action-title, .setting-item-name, .workspace-tab-header-inner-title");
  const aria = el.getAttribute("aria-label") || "";
  const title = el.getAttribute("title") || "";
  const rawVisibleText = labelEl?.innerText || labelEl?.textContent || el.innerText || el.textContent || "";
  const visibleText = String(rawVisibleText).replace(/\s+/g, " ").trim();
  const usefulVisibleText = visibleText && (!/^\d+(?:\s*[+\-/·]\s*\d+)*$/.test(visibleText) || (!aria && !title))
    ? visibleText
    : "";
  const icon = uiElementIconName(el);
  return uniqueStrings([
    usefulVisibleText,
    aria,
    title,
    el.dataset.cancipUiRuleLabel || "",
    icon,
    String(el.className || ""),
    el.tagName
  ].map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean));
}

export function uiElementIconName(el: HTMLElement | null | undefined): string {
  if (!el) return "";
  const direct = el.dataset.cancipUiIcon || el.dataset.icon || el.getAttribute("data-icon") || "";
  if (direct.trim()) return direct.trim();
  const iconRoot = el.querySelector<HTMLElement>(".menu-item-icon, .view-action-icon, .nav-action-button, .clickable-icon, [data-icon], .svg-icon") ?? el;
  const iconAttr = iconRoot.dataset.icon || iconRoot.getAttribute("data-icon") || iconRoot.getAttribute("icon") || "";
  if (iconAttr.trim()) return iconAttr.trim();
  const svg = iconRoot.matches("svg") ? iconRoot : iconRoot.querySelector<SVGElement>("svg");
  const iconClass = Array.from(svg?.classList ?? [])
    .find((item) => item.startsWith("lucide-") && item.length > "lucide-".length);
  if (iconClass) return iconClass.slice("lucide-".length);
  const aria = iconRoot.getAttribute("aria-label") || iconRoot.getAttribute("title") || "";
  const iconLike = aria.trim().toLowerCase().replace(/\s+/g, "-");
  return /^[a-z0-9][a-z0-9-]{1,48}$/.test(iconLike) ? iconLike : "";
}

export function normalizeUiButtonLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function uiButtonLabelEquals(a: string, b: string): boolean {
  const left = normalizeUiButtonLabel(a);
  const right = normalizeUiButtonLabel(b);
  return Boolean(left && right && left === right);
}

export function preferredUiButtonCommandIcons(): Map<string, string> {
  return new Map<string, string>([
    ["cancip:open-chat", "bot"],
    ["cancip:new-chat", "plus"],
    ["cancip:add-selection-to-chat", "paperclip"],
    ["cancip:translate-current-page", "languages"],
    ["cancip:speak-active-note", "volume-2"],
    ["cancip:speak-selection", "volume-2"],
    ["cancip:pause-tts", "pause"],
    ["cancip:resume-tts", "play"],
    ["cancip:stop-tts", "square"],
    ["cancip:rebuild-light-index", "refresh-cw"],
    ["cancip:create-local-version-commit", "archive"],
    ["cancip:open-automation-settings", "calendar-clock"],
    ["command-palette:open", "command"],
    ["app:open-settings", "settings"],
    ["workspace:close", "x"],
    ["workspace:split-vertical", "panel-right-open"],
    ["workspace:split-horizontal", "panel-bottom-open"],
    ["workspace:toggle-left-sidebar", "panel-left-open"],
    ["workspace:toggle-right-sidebar", "panel-right-open"],
    ["file-explorer:new-file", "file-plus"],
    ["file-explorer:new-folder", "folder-plus"],
    ["editor:toggle-bold", "bold"],
    ["editor:toggle-italics", "italic"],
    ["editor:toggle-highlight", "highlighter"],
    ["editor:insert-link", "link"],
    ["editor:insert-tag", "hash"],
    ["daily-notes", "calendar-days"],
    ["periodic-notes:open-daily-note", "calendar-days"]
  ]);
}

export function cleanUiButtonCommandLabel(value: string): string {
  return value
    .replace(/^[\s·•\-–—*]+/, "")
    .replace(/\s*(?:Ctrl|Cmd|Meta|Alt|Shift|⌘|⌥|⇧|⌃)(?:\s*[+＋]\s*[\w\u4e00-\u9fff])+\s*$/i, "")
    .replace(/\s*\([^)]{1,30}\)\s*$/g, "")
    .replace(/[.。…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function uiButtonCommandNameEquals(a: string, b: string): boolean {
  const left = normalizeUiButtonCommandText(a);
  const right = normalizeUiButtonCommandText(b);
  if (!left || !right) return false;
  return left === right || stripUiButtonCommandPrefix(left) === right || left === stripUiButtonCommandPrefix(right);
}

export function scoreUiButtonObsidianCommand(entry: ObsidianCommandEntry, label: string): number {
  const cleaned = cleanUiButtonCommandLabel(label);
  if (!cleaned) return 0;
  const labelNorm = normalizeUiButtonCommandText(cleaned);
  const labelCompact = labelNorm.replace(/\s+/g, "");
  const nameNorm = normalizeUiButtonCommandText(entry.name);
  const nameNoPrefix = stripUiButtonCommandPrefix(nameNorm);
  const nameCompact = nameNorm.replace(/\s+/g, "");
  const noPrefixCompact = nameNoPrefix.replace(/\s+/g, "");
  const idNorm = normalizeUiButtonCommandText(entry.id);
  const idCompact = idNorm.replace(/\s+/g, "");
  let score = scoreObsidianCommand(entry, cleaned);
  if (nameNorm === labelNorm) score += 520;
  if (nameNoPrefix === labelNorm) score += 560;
  if (labelCompact.length >= 2 && (nameCompact.includes(labelCompact) || noPrefixCompact.includes(labelCompact))) score += 260 + Math.min(labelCompact.length * 8, 160);
  if (labelCompact.length >= 4 && (isSubsequence(labelCompact, noPrefixCompact) || isSubsequence(labelCompact, nameCompact))) {
    score += 210 + Math.min(labelCompact.length * 6, 120);
  }
  if (labelCompact.length >= 4 && isSubsequence(labelCompact, idCompact)) score += 105;
  if (labelCompact.length >= 3 && idCompact.includes(labelCompact)) score += 90;
  const labelTokens = uiButtonCommandTokens(cleaned);
  const field = `${idNorm} ${nameNorm}`;
  let matched = 0;
  for (const token of labelTokens) {
    const normalized = normalizeUiButtonCommandText(token).replace(/\s+/g, "");
    if (!normalized) continue;
    if (field.replace(/\s+/g, "").includes(normalized)) {
      matched += 1;
      score += normalized.length <= 2 ? 18 : 32;
    }
  }
  if (labelTokens.length && matched === labelTokens.length) score += 110;
  if (labelTokens.length >= 2 && matched < Math.ceil(labelTokens.length * 0.6)) score -= 80;
  return Math.max(0, Math.round(score));
}

export function normalizeUiButtonCommandText(value: string): string {
  return normalizeObsidianCommandSearchText(cleanUiButtonCommandLabel(value)).replace(/\b(pdf|tts|ai|ob)\b/g, (match) => match);
}

export function stripUiButtonCommandPrefix(value: string): string {
  return value.replace(/^[a-z0-9 _.-]{2,40}\s+/, "").trim();
}

export function uiButtonCommandTokens(value: string): string[] {
  return uniqueStrings([
    ...obsidianCommandSearchTokens(value),
    ...cleanUiButtonCommandLabel(value).split(/\s+/),
    ...(cleanUiButtonCommandLabel(value).match(/[\u4e00-\u9fff]{2,}/g) ?? [])
  ])
    .map((item) => item.trim())
    .filter((item) => item && !/^(ob|obsidian|command|命令|按钮|功能)$/.test(item.toLowerCase()));
}

export function isSafeUiButtonVisualClass(value: string): boolean {
  return [
    "clickable-icon",
    "view-action",
    "nav-action-button",
    "workspace-ribbon-action",
    "side-dock-ribbon-action",
    "document-search-button",
    "pdf-toolbar-button"
  ].includes(value);
}

export function guessUiButtonCommandIcon(id: string, name: string): string {
  const haystack = `${id} ${name}`.toLowerCase();
  if (/(cancip|ai|chat|assistant|bot|问答|聊天|助手)/i.test(haystack)) return "bot";
  if (/(new|create|add|insert|新建|创建|添加|增加|插入)/i.test(haystack)) return "plus";
  if (/(search|find|lookup|查找|搜索|检索)/i.test(haystack)) return "search";
  if (/(history|recent|历史|最近)/i.test(haystack)) return "history";
  if (/(todo|task|plan|待办|计划|任务)/i.test(haystack)) return "list-todo";
  if (/(review|approve|audit|审核|批准)/i.test(haystack)) return "shield-check";
  if (/(translate|translation|language|翻译|译文|语言)/i.test(haystack)) return "languages";
  if (/(speak|tts|voice|read aloud|朗读|语音)/i.test(haystack)) return "volume-2";
  if (/(pause|暂停)/i.test(haystack)) return "pause";
  if (/(play|resume|continue|播放|继续|恢复)/i.test(haystack)) return "play";
  if (/(stop|停止)/i.test(haystack)) return "square";
  if (/(settings|preference|config|设置|配置)/i.test(haystack)) return "settings";
  if (/(calendar|daily|date|日历|日记|日期)/i.test(haystack)) return "calendar-days";
  if (/(folder|目录|文件夹)/i.test(haystack)) return "folder-open";
  if (/(file|note|markdown|笔记|文件)/i.test(haystack)) return "file-text";
  if (/(command|palette|命令)/i.test(haystack)) return "command";
  if (/(terminal|shell|console|终端|控制台)/i.test(haystack)) return "terminal";
  if (/(refresh|reload|rebuild|sync|刷新|重载|同步|重建)/i.test(haystack)) return "refresh-cw";
  if (/(download|export|下载|导出)/i.test(haystack)) return "download";
  if (/(upload|import|上传|导入)/i.test(haystack)) return "upload";
  if (/(attach|attachment|paperclip|附件)/i.test(haystack)) return "paperclip";
  if (/(draw|paint|canvas|sketch|涂鸦|绘图|画)/i.test(haystack)) return "palette";
  if (/(highlight|mark|高亮|标记)/i.test(haystack)) return "highlighter";
  if (/(pin|固定|置顶)/i.test(haystack)) return "pin";
  if (/(star|favorite|收藏)/i.test(haystack)) return "star";
  return "zap";
}

export function uniqueSelectorForElement(el: HTMLElement, preferred: string): string {
  if (selectorUniquelyMatches(el, preferred)) return preferred;
  return cssPathSelectorForElement(el);
}

export function selectorUniquelyMatches(el: HTMLElement, selector: string): boolean {
  try {
    const matches = Array.from(activeDocument.querySelectorAll<HTMLElement>(selector));
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}

export function selectorLooksQueryable(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;
  try {
    createDiv().querySelector(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function cssPathSelectorForElement(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const segment = cssPathSegment(current);
    parts.unshift(segment);
    const selector = parts.join(" > ");
    if (selectorUniquelyMatches(el, selector)) return selector;
    current = current.parentElement;
    if (current?.tagName.toLowerCase() === "body") break;
  }
  return parts.join(" > ");
}

export function cssPathSegment(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute("id");
  if (id) return `${tag}#${cssClassEscape(id)}`;
  const command = el.getAttribute("data-command");
  if (command) return `${tag}[data-command="${cssEscapeAttr(command)}"]`;
  const customButtonId = el.dataset.cancipUiCustomButtonId;
  if (customButtonId) return `${tag}[data-cancip-ui-custom-button-id="${cssEscapeAttr(customButtonId)}"]`;
  const cls = String(el.className || "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((item) => !/^is-|^mod-|^has-/.test(item))
    .slice(0, 2);
  const classPart = cls.length ? `.${cls.map(cssClassEscape).join(".")}` : "";
  const parent = el.parentElement;
  if (!parent) return `${tag}${classPart}`;
  const sameTag = Array.from(parent.children).filter((child) => child.tagName === el.tagName);
  const index = Math.max(1, sameTag.indexOf(el) + 1);
  return `${tag}${classPart}:nth-of-type(${index})`;
}

export function cssEscapeAttr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

export function cssClassEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function uniqueElements<T extends Element>(values: Array<T | null | undefined>): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function uiButtonCustomRuleIdentity(rule: UiButtonRule): string {
  return [
    rule.scope,
    rule.commandId?.trim() ?? "",
    rule.anchorSelector?.trim() ?? "",
    normalizeUiButtonLabel(rule.anchorLabel ?? ""),
    rule.insertPosition ?? "after",
    normalizeUiButtonLabel(rule.title || rule.label || rule.commandName || "")
  ].join("\n");
}

export function uiButtonRuleReferenceLabels(rule: Pick<UiButtonRule, "selector" | "label" | "title" | "commandName">): string[] {
  const selectorLabel = normalizeUiButtonLabel(rule.selector);
  return uniqueStrings([rule.label, rule.title, rule.commandName]
    .map((item) => normalizeUiButtonLabel(item ?? ""))
    .filter((item) => item && item !== selectorLabel));
}

export function uiButtonRuleLooksMenuOnly(rule: UiButtonRule, selector: string): boolean {
  const selectors = uniqueStrings([
    selector,
    rule.selector,
    rule.fallbackSelector ?? "",
    rule.commandId?.startsWith("uiclick:") ? rule.commandId.slice("uiclick:".length) : ""
  ].map((item) => item.trim()).filter(Boolean));
  return selectors.some(uiButtonSelectorLooksMenuSelector) && uiButtonRuleReferenceLabels(rule).length > 0;
}

export function uiButtonSelectorLooksMenuSelector(selector: string): boolean {
  const normalized = selector.trim();
  return /\.menu(?:\s|\.|>|$)/.test(normalized)
    || /\.menu-group\b/.test(normalized)
    || /\.menu-item\b/.test(normalized)
    || /\[role=['"]?menuitem['"]?\]/i.test(normalized);
}

export function workspaceLeafArea(leaf: WorkspaceLeaf): WorkspaceTabInfo["area"] {
  const viewContainer = (leaf.view as unknown as { containerEl?: HTMLElement })?.containerEl;
  const leafContainer = (leaf as unknown as { containerEl?: HTMLElement }).containerEl;
  const parentContainer = (leaf.parent as unknown as { containerEl?: HTMLElement }).containerEl;
  const candidates = [viewContainer, leafContainer, parentContainer].filter((item): item is HTMLElement => Boolean(item));
  for (const container of candidates) {
    if (container.closest(".mod-right-split, .workspace-split.mod-right-split, .workspace-drawer.mod-right, .workspace-drawer-right, .workspace-drawer.is-right, .workspace-drawer.mod-sidedock.mod-right")) return "right";
    if (container.closest(".mod-left-split, .workspace-split.mod-left-split, .workspace-drawer.mod-left, .workspace-drawer-left, .workspace-drawer.is-left, .workspace-drawer.mod-sidedock.mod-left")) return "left";
    if (container.closest(".workspace-popout, .mod-popout")) return "floating";
  }
  const haystack = candidates.map((container) => `${container.className ?? ""} ${container.getAttribute("aria-label") ?? ""}`).join(" ").toLowerCase();
  if (/\bright\b|右侧|右側|右边|右邊/.test(haystack)) return "right";
  if (/\bleft\b|左侧|左側|左边|左邊/.test(haystack)) return "left";
  if (candidates.some((container) => container.closest(".workspace-tabs, .workspace-leaf"))) return "root";
  return "unknown";
}

export function workspaceLeafPinned(leaf: WorkspaceLeaf): boolean {
  try {
    return leaf.getViewState().pinned === true;
  } catch {
    return false;
  }
}

export function workspaceLeafContainer(leaf: WorkspaceLeaf): HTMLElement | null {
  const viewContainer = (leaf.view as unknown as { containerEl?: HTMLElement })?.containerEl;
  const leafContainer = (leaf as unknown as { containerEl?: HTMLElement }).containerEl;
  return leafContainer ?? viewContainer?.closest<HTMLElement>(".workspace-leaf") ?? viewContainer ?? null;
}

export function workspaceLeafTabsContainer(leaf: WorkspaceLeaf): HTMLElement | null {
  const parentContainer = (leaf.parent as unknown as { containerEl?: HTMLElement }).containerEl;
  if (parentContainer?.matches(".workspace-tabs")) return parentContainer;
  const leafContainer = workspaceLeafContainer(leaf);
  return leafContainer?.closest<HTMLElement>(".workspace-tabs, .workspace-drawer-tab-container, .workspace-drawer-tabs") ?? parentContainer ?? null;
}

export function workspaceLeafIsDomActive(leaf: WorkspaceLeaf): boolean {
  const container = workspaceLeafContainer(leaf);
  if (!container) return false;
  if (container.hasClass("mod-active") || container.hasClass("is-active")) return true;
  const tabs = workspaceLeafTabsContainer(leaf);
  const activeHeader = tabs?.querySelector<HTMLElement>(".workspace-tab-header.is-active, .workspace-tab-header.mod-active");
  if (!activeHeader) return false;
  const index = activeWorkspaceTabHeaderIndex(activeHeader);
  return orderedWorkspaceLeavesFromParent(leaf.parent)[index] === leaf;
}

export function activeWorkspaceTabHeaderIndex(headerOrContainer: HTMLElement): number {
  const tabs = headerOrContainer.closest<HTMLElement>(".workspace-tabs");
  if (!tabs) return -1;
  const headerContainer = tabs.querySelector<HTMLElement>(":scope > .workspace-tab-header-container")
    ?? tabs.querySelector<HTMLElement>(".workspace-tab-header-container");
  const headers = headerContainer
    ? Array.from(headerContainer.querySelectorAll<HTMLElement>(".workspace-tab-header"))
    : [];
  if (!headers.length) return -1;
  const activeHeader = headers.find((header) => header.hasClass("is-active") || header.hasClass("mod-active"));
  const fallbackHeader = headerOrContainer.matches(".workspace-tab-header")
    ? headerOrContainer
    : headerOrContainer.querySelector<HTMLElement>(".workspace-tab-header.is-active, .workspace-tab-header.mod-active, .workspace-tab-header");
  const selected = activeHeader ?? fallbackHeader ?? headers[0];
  return selected ? headers.indexOf(selected) : -1;
}

export function orderedWorkspaceLeavesFromParent(parent: WorkspaceLeaf["parent"]): WorkspaceLeaf[] {
  const runtime = parent as unknown as {
    children?: unknown[];
    leaves?: unknown[];
    activeTab?: number;
    activeLeaf?: WorkspaceLeaf;
    currentLeaf?: WorkspaceLeaf;
  };
  const candidates = Array.isArray(runtime.children)
    ? runtime.children
    : Array.isArray(runtime.leaves)
      ? runtime.leaves
      : [];
  return candidates.filter((item): item is WorkspaceLeaf => Boolean(item && typeof item === "object" && "getViewState" in item && "detach" in item));
}

export function orderedWorkspaceTabInfosFromParent(tabs: WorkspaceTabInfo[]): WorkspaceTabInfo[] {
  if (!tabs.length) return tabs;
  const orderedLeaves = orderedWorkspaceLeavesFromParent(tabs[0].leaf.parent);
  if (!orderedLeaves.length) return tabs;
  const order = new Map<WorkspaceLeaf, number>(orderedLeaves.map((leaf, index) => [leaf, index]));
  return [...tabs].sort((a, b) => (order.get(a.leaf) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.leaf) ?? Number.MAX_SAFE_INTEGER));
}

export function activeWorkspaceTabInfoFromParent(tabs: WorkspaceTabInfo[]): WorkspaceTabInfo | null {
  if (!tabs.length) return null;
  const parent = tabs[0].leaf.parent as unknown as {
    activeTab?: number;
    activeLeaf?: WorkspaceLeaf;
    currentLeaf?: WorkspaceLeaf;
  };
  const activeLeaf = parent.activeLeaf ?? parent.currentLeaf;
  if (activeLeaf) {
    const byLeaf = tabs.find((tab) => tab.leaf === activeLeaf);
    if (byLeaf) return byLeaf;
  }
  if (typeof parent.activeTab === "number") {
    const ordered = orderedWorkspaceTabInfosFromParent(tabs);
    return ordered[parent.activeTab] ?? null;
  }
  return null;
}

export function allTagsFromCache(cache: { tags?: Array<{ tag?: string }>; frontmatter?: Record<string, unknown> }): string[] {
  const tags = new Set<string>();
  for (const item of cache.tags ?? []) {
    if (typeof item.tag === "string") tags.add(item.tag);
  }
  const frontmatterTags = cache.frontmatter?.tags ?? cache.frontmatter?.tag;
  for (const item of flattenKeywordValue(frontmatterTags)) tags.add(item);
  return [...tags];
}

export function removeTagsFromMarkdown(content: string, tags: string[]): { text: string; removed: string[] } {
  const normalized = new Set(tags.map((tag) => normalizeTagName(tag)).filter(Boolean));
  const removed: string[] = [];
  if (!normalized.size) return { text: content, removed };
  let text = content.replace(/(^|\s)#([^\s#`.,;:!?()[\]{}<>，。！？、；：]+)/g, (match, prefix: string, raw: string) => {
    const tag = normalizeTagName(raw);
    if (!normalized.has(tag)) return match;
    removed.push(tag);
    return prefix;
  });
  text = text.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (match, body: string) => {
    const nextBody = body
      .replace(/^tags:\s*\[(.*?)\]\s*$/gm, (line, inner: string) => {
        const kept = inner.split(",").map((item: string) => item.trim().replace(/^["']|["']$/g, "")).filter((tag: string) => {
          const normalizedTag = normalizeTagName(tag);
          if (!normalizedTag || normalized.has(normalizedTag)) {
            if (normalizedTag) removed.push(normalizedTag);
            return false;
          }
          return true;
        });
        return kept.length ? `tags: [${kept.join(", ")}]` : "";
      })
      .replace(/^tags:\s*\r?\n((?:\s*-\s*.*\r?\n?)+)/gm, (block, lines: string) => {
        const kept = lines.split(/\r?\n/).filter(Boolean).filter((line: string) => {
          const value = line.replace(/^\s*-\s*/, "").trim().replace(/^["']|["']$/g, "");
          const normalizedTag = normalizeTagName(value);
          if (!normalizedTag || normalized.has(normalizedTag)) {
            if (normalizedTag) removed.push(normalizedTag);
            return false;
          }
          return true;
        });
        return kept.length ? `tags:\n${kept.join("\n")}` : "";
      });
    return `---\n${nextBody.replace(/\n{3,}/g, "\n\n").trim()}\n---`;
  });
  text = text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+\n/g, "\n");
  return { text, removed };
}

export function isToolRunStatus(value: unknown): value is ToolRunStatus {
  return value === "pending" || value === "executing" || value === "executed" || value === "blocked" || value === "failed" || value === "rejected";
}

export function formatSessionHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export function explicitlyRequestsMultiAgentExecution(prompt: string): boolean {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized || /(?:不要|别|无需|禁止|do not|don't|without)\s*.{0,16}(?:多\s*agent|子\s*agent|subagents?|multi[- ]?agent)/i.test(normalized)) return false;
  const directRequest = /(?:请(?:用|使用|调用|启动|创建|运行|安排)?|使用|调用|启动|创建|运行|安排|让|use|run|start|launch|create)\s*(?:至少|最少|不少于|at least)?\s*(?:\d+|两|二|三|四|五|六|七|八|九|十|two|three|four|five|six|seven|eight|nine|ten)?\s*(?:个|名)?\s*(?:真实|real)?\s*(?:多\s*agent|子\s*agent|subagents?|child agents?|multi[- ]?agent)/i;
  const independentRequest = /(?:\d+|两|二|三|四|五|六|七|八|九|十|two|three|four|five|six|seven|eight|nine|ten)\s*(?:个|名)?\s*(?:真实|real)?\s*(?:子\s*agent|subagents?|child agents?|agents?).{0,36}(?:分别|独立|并行|互相|交叉|independent|parallel|cross[- ]?(?:check|review))/i;
  return directRequest.test(normalized) || independentRequest.test(normalized);
}

export function promptRequestsResultOnly(prompt: string): boolean {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return /(?:最终|最后)?\s*(?:只|仅)\s*(?:回答|回复|输出|给出|保留)(?:即可|就行|[^，。；;!?！\r\n]*)/i.test(normalized)
    || /(?:最终|最后)?\s*(?:只|仅)\s*(?:回答|回复|输出|给出|保留)?\s*(?:最终)?\s*(?:结果|答案|结论|数值|版本号?)(?:即可|就行)?/i.test(normalized)
    || /(?:answer|respond|reply|output|return)\s+(?:only|just)\s+(?:with\s+)?(?:the\s+)?(?:result|answer|conclusion|value|version)(?:\s+number)?/i.test(normalized)
    || /(?:only|just)\s+(?:answer|response|reply|output|result|answer|conclusion|value|version)(?:\s+number)?/i.test(normalized);
}

export function requestedMultiAgentCount(prompt: string): number {
  const match = prompt.replace(/\s+/g, " ").match(/(?:至少|最少|不少于|at least)?\s*(\d+|两|二|三|四|五|六|七|八|九|十|two|three|four|five|six|seven|eight|nine|ten)\s*(?:个|名)?\s*(?:真实|real)?\s*(?:多\s*agent|子\s*agent|subagents?|child agents?|agents?)/i);
  const token = match?.[1]?.toLocaleLowerCase() ?? "";
  if (/^\d+$/.test(token)) return Math.max(2, Math.min(10, Number(token)));
  const counts: Record<string, number> = {
    两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10
  };
  return counts[token] ?? 2;
}

export function concreteFinalActionLabel(run: ToolRun): string {
  if (run.action.type === "command") return run.action.command.trim();
  if ("path" in run.action && typeof run.action.path === "string" && run.action.path.trim()) {
    return `${run.action.type} ${run.action.path.trim()}`;
  }
  if (run.action.type === "automation") return `${run.action.type} ${run.action.op}${run.action.title ? ` ${run.action.title}` : ""}`.trim();
  if (run.action.type === "todo") return `${run.action.type} ${run.action.op}`;
  return run.action.type;
}

export function conciseFinalRequirementFailure(reason: string, chinese: boolean): string {
  if (/missing hidden final-review status/i.test(reason)) return chinese ? "模型没有给出终态标记" : "the model omitted the terminal status marker";
  const choices = reason.match(/requires\s+(\d+)\s+concrete recommendation choices?.*received\s+(\d+)/i);
  if (choices) return chinese ? `要求 ${choices[1]} 个推荐项，模型只给出 ${choices[2]} 个` : `${choices[1]} recommendations were required but only ${choices[2]} were returned`;
  if (/missing visible final answer|missing a concrete user-visible result/i.test(reason)) return chinese ? "模型没有给出可见的具体结论" : "the model did not return a concrete visible conclusion";
  if (/only read-only discovery ran/i.test(reason)) return chinese ? "只执行了只读发现，没有完成要求的改动" : "only read-only discovery ran; the requested change was not made";
  const clean = reason.replace(/\s+/g, " ").trim();
  return clean || (chinese ? "终态校验没有通过" : "terminal validation did not pass");
}

export function concreteFailedFinalFallback(
  originalPrompt: string,
  candidateText: string,
  runs: ToolRun[],
  requirementFailure: string,
  chinese: boolean
): string {
  const candidate = candidateText.trim();
  const executed = [...new Set(runs.filter((run) => run.status === "executed").map(concreteFinalActionLabel).filter(Boolean))];
  const parallelRan = runs.some((run) => run.status === "executed"
    && run.action.type === "command"
    && run.action.command.trim().toLocaleLowerCase() === "cancip.subagents.parallel");
  if (explicitlyRequestsMultiAgentExecution(originalPrompt) && !parallelRan) {
    const count = requestedMultiAgentCount(originalPrompt);
    const subject = chinese ? `${count === 2 ? "两个" : `${count} 个`}真实子 Agent` : `${count} real child agents`;
    const detail = chinese
      ? `${subject}未启动；本轮${executed.length ? `只执行了 ${executed.join("、")}` : "没有执行任何子 Agent 动作"}，因此独立处理和交叉核对没有完成。`
      : `${subject} did not start; this turn ${executed.length ? `only ran ${executed.join(", ")}` : "ran no subagent action"}, so the independent work and cross-check were not completed.`;
    return [candidate, detail].filter(Boolean).join("\n\n");
  }
  const failed = runs.find((run) => run.status === "failed" || run.status === "blocked" || run.status === "rejected");
  if (failed) {
    const reason = (failed.error || failed.result || requirementFailure).replace(/\s+/g, " ").trim();
    const detail = chinese
      ? `${concreteFinalActionLabel(failed)} ${failed.status === "blocked" ? "被阻止" : failed.status === "rejected" ? "被拒绝" : "执行失败"}${reason ? `：${reason.slice(0, 320)}` : "。"}`
      : `${concreteFinalActionLabel(failed)} was ${failed.status}${reason ? `: ${reason.slice(0, 320)}` : "."}`;
    return [candidate, detail].filter(Boolean).join("\n\n");
  }
  const issue = conciseFinalRequirementFailure(requirementFailure, chinese);
  const detail = chinese
    ? `${executed.length ? `本轮实际执行了 ${executed.join("、")}` : "本轮没有执行工具动作"}；未通过原因：${issue}。`
    : `${executed.length ? `This turn actually ran ${executed.join(", ")}` : "No tool action ran in this turn"}; terminal failure: ${issue}.`;
  return [candidate, detail].filter(Boolean).join("\n\n");
}

export function deterministicFinalChoiceFallback(originalPrompt: string, finalText: string, count: number): string[] {
  if (count <= 0) return [];
  const chinese = /[\u3400-\u9fff]/.test(originalPrompt);
  const expression = originalPrompt.match(/-?\d+(?:\.\d+)?\s*(?:\+|-|×|\*|\/|÷)\s*-?\d+(?:\.\d+)?/)?.[0]?.replace(/\s+/g, " ") ?? "";
  const result = finalText.replace(/<!--[^>]*-->/g, "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const agentCount = requestedMultiAgentCount(originalPrompt);
  const subject = expression || originalPrompt.replace(/\s+/g, " ").trim().slice(0, 48);
  const base = explicitlyRequestsMultiAgentExecution(originalPrompt)
    ? chinese
      ? [
          `查看${agentCount === 2 ? "两个" : `${agentCount} 个`}子 Agent 对 ${subject} 的独立结果`,
          `核对共识：${subject}${result ? ` = ${result}` : ""}`,
          `用另一模型复算 ${subject}`,
          `查看子 Agent 对 ${subject} 的原始收发`,
          `重新运行 ${subject} 的交叉验证`
        ]
      : [
          `View ${agentCount} independent agent results for ${subject}`,
          `Check the consensus for ${subject}${result ? ` = ${result}` : ""}`,
          `Recalculate ${subject} with another model`,
          `Inspect the raw agent exchanges for ${subject}`,
          `Run another cross-check for ${subject}`
        ]
    : chinese
      ? [`查看 ${subject} 的验证证据`, `重试 ${subject} 的未完成动作`, `继续处理 ${subject}`]
      : [`View verification evidence for ${subject}`, `Retry the unfinished action for ${subject}`, `Continue working on ${subject}`];
  const choices = [...new Set(base.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))];
  while (choices.length < count) {
    const index = choices.length + 1;
    choices.push(chinese ? `复查 ${subject} 的第 ${index} 项证据` : `Review evidence ${index} for ${subject}`);
  }
  return choices.slice(0, count);
}

export function shouldAutoDelegateToSubagents(prompt: string): boolean {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length < 90 || classifyPromptIntent(normalized) !== "implementation") return false;
  return /(?:并行|多\s*agent|子\s*agent|交叉(?:验证|复核)|互相(?:挑错|审核)|多种方法|方案对比|深度分析|全面检查|复杂任务|parallel|multi[- ]?agent|cross[- ]?(?:check|review)|compare approaches|independent verification)/i.test(normalized)
    || (normalized.length >= 260 && /(?:检查|修复|实现|开发|分析|验证|测试|迭代|优化|review|fix|implement|build|analy[sz]e|verify|test|optimi[sz]e)/i.test(normalized));
}

export function contextualEditProposalOnlyEchoesInstruction(items: ReviewGateManifestItem[], instruction: string): boolean {
  const expected = normalizeUiButtonLabel(instruction);
  if (!expected) return false;
  const added = items.flatMap((item) => makeReviewDiffLines(item.old_text ?? "", item.new_text ?? "")
    .filter((line) => line.kind === "added")
    .map((line) => line.text.trim())
    .filter(Boolean));
  if (!added.length) return false;
  return normalizeUiButtonLabel(added.join("\n")) === expected;
}

export function contextualEditProposalCopiesExistingLines(items: ReviewGateManifestItem[], sourceText: string): boolean {
  const sourceLines = new Set(sourceText.split(/\r?\n/).map(normalizeUiButtonLabel).filter(Boolean));
  if (!sourceLines.size) return false;
  const added = items.flatMap((item) => makeReviewDiffLines(item.old_text ?? "", item.new_text ?? "")
    .filter((line) => line.kind === "added")
    .map((line) => normalizeUiButtonLabel(line.text))
    .filter(Boolean));
  const copied = added.filter((line) => sourceLines.has(line));
  const novel = added.filter((line) => !sourceLines.has(line));
  return copied.length >= 2 && novel.length >= 1;
}

export function uiButtonRuleIdFromMutationResult(result: string): string {
  const applied = result.match(/^appliedRuleIds:\s*([^\r\n]+)/m)?.[1]
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);
  if (applied) return applied;
  return result.match(/^\d+\.\s+id=([^\s]+)/m)?.[1]?.trim() ?? "";
}

export function uiButtonCommandScope(args: Record<string, unknown> | undefined): UiButtonRule["scope"] {
  return args?.scope === "global" || args?.scope === "cancip" || args?.scope === "active" ? args.scope : "active";
}

export function uiButtonActionSelector(args: Record<string, unknown> | undefined): string {
  return typeof args?.selector === "string" ? args.selector.trim() : "";
}

export function uiButtonSelectorFromResult(result: string): string {
  return result.match(/^\s*selector:\s*(.+)$/m)?.[1]?.trim() ?? "";
}

export function uiButtonLabelFromSelector(selector: string): string {
  const label = selector.match(/\[(?:aria-label|title|data-cancip-ui-rule-label)\s*=\s*["']([^"']+)["']\]/i)?.[1]?.trim() ?? "";
  return label.replace(/\\([\\"'])/g, "$1");
}

export function uiButtonLabelFromResult(result: string): string {
  const row = result.match(/^\d+\.\s+(.+?)\s*$/m)?.[1]?.trim() ?? "";
  return row.replace(/\s+\[hidden\]/gi, "").replace(/\s+order=\S+.*$/i, "").trim();
}

export function uiButtonTargetComparableText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function uiButtonTargetEvidenceFromResult(
  result: string,
  originalPrompt: string,
  explicitSelector = ""
): UiButtonEvidenceRow | null {
  const rows = parseUiButtonEvidenceRows(result);
  if (!rows.length) return null;
  const preferActive = (candidates: UiButtonEvidenceRow[]): UiButtonEvidenceRow[] => {
    const active = candidates.filter((row) => row.context?.active === true);
    return active.length ? active : candidates;
  };
  const requestedSelector = explicitSelector.trim();
  if (requestedSelector) {
    const exact = preferActive(rows.filter((row) => row.selector === requestedSelector));
    if (exact.length) return exact[0];
  }

  const prompt = uiButtonTargetComparableText(originalPrompt);
  const matches = rows
    .map((row, index) => ({ row, index, label: uiButtonTargetComparableText(row.label) }))
    .filter((item) => item.label.length > 0 && prompt.includes(item.label));
  if (!matches.length) return null;
  const activeMatches = matches.filter((item) => item.row.context?.active === true);
  const candidates = activeMatches.length ? activeMatches : matches;
  candidates.sort((left, right) =>
    right.label.length - left.label.length
    || prompt.indexOf(left.label) - prompt.indexOf(right.label)
    || left.index - right.index
  );
  return candidates[0].row;
}

export function buttonWorkflowRequiresPeerIsolation(text: string): boolean {
  const chinesePeer = /(?:侧边栏|右侧|左侧|旁边|别处|其他标签页|别的标签页|其他分栏|别的分栏|其他视图|别的视图|其他位置|别的位置|同名.{0,12}(?:按钮|菜单项|按键|键)|非目标(?:按钮|位置)).{0,48}(?:不受影响|不变|没(?:有)?变化|不跟着变|不一起变|保持|原样|原状态|可见|别动|不要动)|(?:不受影响|不变|没(?:有)?变化|不跟着变|不一起变|保持|原样|原状态|可见|别动|不要动).{0,48}(?:侧边栏|右侧|左侧|旁边|别处|其他标签页|别的标签页|其他分栏|别的分栏|其他视图|别的视图|其他位置|别的位置|同名.{0,12}(?:按钮|菜单项|按键|键)|非目标(?:按钮|位置))/i;
  const chineseOnlyCurrent = /(?:只|仅).{0,10}(?:当前|活动|这个|这一|选中|目标).{0,20}(?:按钮|标题栏|工具栏|标签页|视图).{0,60}(?:其他|别的|其余|同名|非目标)/i;
  const englishPeer = /(?:other|same[- ]?(?:name|label)|non[- ]?target).{0,60}(?:button|tab|sidebar|menu|view|location).{0,40}(?:unaffected|unchanged|visible|remain|keep)|(?:unaffected|unchanged|visible|remain|keep).{0,40}(?:other|same[- ]?(?:name|label)|non[- ]?target)/i;
  const englishOnlyCurrent = /(?:only|just).{0,20}(?:current|active|selected|target).{0,30}(?:button|toolbar|tab|view).{0,70}(?:other|same[- ]?(?:name|label)|non[- ]?target)/i;
  return chinesePeer.test(text) || chineseOnlyCurrent.test(text) || englishPeer.test(text) || englishOnlyCurrent.test(text);
}

export function buttonWorkflowTargetsActiveScope(text: string): boolean {
  const chinese = /(?:只|仅|暂时|临时)?.{0,10}(?:当前|活动|这个|这一|选中).{0,20}(?:笔记|标签页|视图|标题栏|工具栏|按钮)|(?:当前|活动)(?:笔记|标签页|视图).{0,24}(?:标题栏|工具栏|按钮|菜单项)/i;
  const english = /(?:only|just|temporarily)?.{0,12}(?:current|active|selected).{0,24}(?:note|tab|view|titlebar|toolbar|button|menu item)/i;
  return chinese.test(text) || english.test(text);
}

export function buttonWorkflowRequestedChanges(text: string): UiButtonRuleChange[] {
  const changes = new Set<UiButtonRuleChange>();
  if (/(?:隐藏|藏起|收起|显示|显现|可见|hide|show|visible)/i.test(text)) changes.add("hidden");
  if (/(?:按钮|菜单项).{0,12}(?:排序|顺序|前移|后移|置顶|移到|order|reorder|before|after)|(?:排序|顺序|前移|后移|置顶|order|reorder).{0,12}(?:按钮|菜单项)/i.test(text)) changes.add("order");
  if (/(?:按钮|菜单项).{0,12}(?:改名|重命名|名称|文案|rename|retitle|label)|(?:改名|重命名|rename|retitle).{0,12}(?:按钮|菜单项)/i.test(text)) changes.add("title");
  if (/(?:按钮|菜单项).{0,12}(?:图标|icon)|(?:更换|修改|自定义|换).{0,8}(?:图标|icon)/i.test(text)) changes.add("icon");
  if (/(?:按钮|图标).{0,12}(?:动图|图片|视频|gif|media)|(?:动图|gif|media).{0,12}(?:按钮|图标)/i.test(text)) changes.add("media");
  if (/(?:按钮|图标).{0,12}(?:特效|动画|闪烁|旋转|发光|effect|pulse|spin|glow|bounce|tilt)|(?:特效|动画|effect|pulse|spin|glow|bounce|tilt).{0,12}(?:按钮|图标)/i.test(text)) changes.add("effect");
  return [...changes];
}

export function buttonWorkflowRequestedHiddenState(text: string): boolean | undefined {
  const hideIndex = text.search(/(?:隐藏|藏起|收起|hide|hidden)/i);
  const showIndex = text.search(/(?:显示|显现|展现|重新可见|show|visible)/i);
  if (hideIndex < 0) return showIndex < 0 ? undefined : false;
  if (showIndex < 0) return true;
  return hideIndex <= showIndex;
}

export function parseUiButtonEvidenceRows(result: string): UiButtonEvidenceRow[] {
  const rows: UiButtonEvidenceRow[] = [];
  const pattern = /(?:^|\n)\d+\.\s+([^\r\n]+)\r?\n\s*selector:\s*([^\r\n]+)\r?\n\s*context:\s*(\{[^\r\n]+\})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(result)) !== null) {
    let context: UiButtonEvidenceContext | undefined;
    try {
      const parsed = JSON.parse(match[3]) as Partial<UiButtonEvidenceContext>;
      if (typeof parsed.key === "string" && typeof parsed.active === "boolean") context = parsed as UiButtonEvidenceContext;
    } catch {
      context = undefined;
    }
    rows.push({
      label: match[1].replace(/\s+\[hidden\]/gi, "").replace(/\s+order=\S+.*$/i, "").trim(),
      selector: match[2].trim(),
      hidden: /\[hidden\]/i.test(match[1]),
      context
    });
  }
  return rows;
}

export function uiButtonWorkflowVerificationMatches(
  result: string,
  expectedHidden: boolean | undefined,
  isolationRequired: boolean,
  baselineResult = ""
): boolean {
  const rows = parseUiButtonEvidenceRows(result);
  if (!rows.length) {
    if (isolationRequired) return false;
    const targetFound = !/^\s*(?:none|无|没有)\b/i.test(result);
    const hidden = /\[hidden\]|data-cancip-ui-(?:rule-)?hidden\s*=\s*["']?true/i.test(result);
    return targetFound && (expectedHidden === undefined || hidden === expectedHidden);
  }
  const contextualTargets = rows.filter((row) => row.context?.active === true);
  const targets = contextualTargets.length || isolationRequired ? contextualTargets : rows;
  if (!targets.length || (expectedHidden !== undefined && !targets.some((row) => row.hidden === expectedHidden))) return false;
  if (!isolationRequired) return true;

  const baselinePeers = parseUiButtonEvidenceRows(baselineResult).filter((row) => row.context && !row.context.active);
  const currentPeers = rows.filter((row) => row.context && !row.context.active);
  if (!baselinePeers.length) return currentPeers.length === 0;
  if (!currentPeers.length) return false;
  return baselinePeers.every((baseline) => currentPeers.some((current) =>
    current.context?.key === baseline.context?.key
    && current.label === baseline.label
    && current.selector === baseline.selector
    && current.hidden === baseline.hidden
  ));
}

export function buttonWorkflowRequestsRestore(text: string): boolean {
  return /(恢复|还原|复原|撤销|撤回|回退|退回|取消(?:本次|临时|规则|改动)?|重置|reset|restore|revert|roll\s*back|undo|temporary)/i.test(text);
}

export function terminalButtonAnswerContradictsVerifiedCompletion(text: string): boolean {
  const chineseIncomplete = /(?:还没|還沒|尚未|未能|没有|沒有|并未|並未)\s*(?:真正|实际|實際)?\s*(?:完成|做完|执行完|執行完)/i;
  const chineseReadOnly = /(?:这轮|這輪|本轮|本輪|当前|當前|目前).{0,12}(?:只|仅|僅)\s*(?:(?:做|进行|進行|完成)了?\s*)?(?:读取|讀取|检查|檢查)/i;
  const englishIncomplete = /\b(?:not\s+(?:done|complete)|did\s+not\s+(?:complete|finish)(?:\s+the)?\s+(?:task|request|workflow))\b/i;
  const englishReadOnly = /(?:^|[.!?;\n]\s*)(?:only|just)\s+(?:(?:did|performed|completed)\s+)?(?:read|inspected?|checked)\b/i;
  return chineseIncomplete.test(text) || chineseReadOnly.test(text) || englishIncomplete.test(text) || englishReadOnly.test(text);
}

export function cancipActionBlockForActions(actions: CancipAction[]): string {
  return `\`\`\`cancip-action\n${JSON.stringify({ actions })}\n\`\`\``;
}

export function hasCancipActionMarker(answer: string): boolean {
  return /```cancip-action\b/i.test(answer)
    || /<cancip-action\b/i.test(answer)
    || /<tool_call\b/i.test(answer)
    || /<!--\s*cancip-action\b/i.test(answer)
    || /["']cancip-action["']\s*:/i.test(answer)
    || /["'](?:actions|action|type|tool|command|cmd|name|function)["']\s*:/.test(answer);
}

export function parseCancipActionJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const body = raw.trim();
  if (!body) return { ok: false, error: "empty action block" };
  const firstValue = extractFirstJsonValue(body);
  const candidates = uniqueStrings([body, firstValue].filter(Boolean));
  let lastError = "invalid JSON";
  for (const candidate of candidates) {
    for (const normalized of uniqueStrings([candidate, removeJsonTrailingCommas(candidate)])) {
      try {
        return { ok: true, value: JSON.parse(normalized) as unknown };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return { ok: false, error: trimContext(lastError.replace(/^JSON\.parse:\s*/i, ""), 180) };
}

export function removeJsonTrailingCommas(input: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }
    if (char === ",") {
      let next = index + 1;
      while (next < input.length && /\s/.test(input[next])) next += 1;
      if (input[next] === "}" || input[next] === "]") continue;
    }
    output += char;
  }
  return output;
}

export function cancipActionCandidates(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return [parsed];
  for (const key of ["actions", "tool_calls", "toolCalls"]) {
    const value = parsed[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return [value];
  }
  for (const key of ["cancip-action", "cancipAction", "tool_call", "toolCall"]) {
    const value = parsed[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return [value];
  }
  return [parsed];
}

export function cancipActionBlockBodies(answer: string): string[] {
  const bodies: string[] = [];
  const patterns = [
    /```cancip-action[^\r\n]*(?:\r?\n)([\s\S]*?)```/gi,
    /```cancip-action\b[ \t]+([^\r\n][\s\S]*?)```/gi,
    /<cancip-action\b[^>]*>([\s\S]*?)<\/cancip-action>/gi,
    /<!--\s*cancip-action\b([\s\S]*?)-->/gi
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(answer)) !== null) {
      const body = match[1]?.trim();
      if (body) bodies.push(body);
    }
  }
  return uniqueStrings(bodies);
}

export function xmlToolCallValue(body: string, tag: string): string {
  const escaped = escapeRegExp(tag);
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i").exec(body);
  return decodeXmlToolCallText(match?.[1] ?? "").trim();
}

export function xmlActionAttributes(source: string): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  const attributeRegex = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attributeRegex.exec(source)) !== null) {
    const key = match[1]?.trim();
    if (!key) continue;
    attributes[key] = decodeXmlToolCallText(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

export function xmlToolCallParameters(body: string): Record<string, unknown> {
  const text = body.trim();
  if (!text) return {};
  const parsed = parseCancipActionJson(text);
  if (parsed.ok && isRecord(parsed.value)) return parsed.value;
  const parameters: Record<string, unknown> = {};
  const tagRegex = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const key = match[1]?.trim();
    if (!key || key === "parameters") continue;
    const value = decodeXmlToolCallText(match[2] ?? "").trim();
    if (!value) continue;
    const nested = parseCancipActionJson(value);
    parameters[key] = nested.ok ? nested.value : value;
  }
  return parameters;
}

export function xmlAssignedToolCallParameters(body: string): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  const parameterRegex = /<parameter\s*=\s*([A-Za-z][A-Za-z0-9_-]*)\s*>([\s\S]*?)<\/parameter>/gi;
  let match: RegExpExecArray | null;
  while ((match = parameterRegex.exec(body)) !== null) {
    const key = match[1]?.trim();
    if (!key) continue;
    const value = decodeXmlToolCallText(match[2] ?? "").trim();
    if (!value) continue;
    const nested = parseCancipActionJson(value);
    parameters[key] = nested.ok ? nested.value : value;
  }
  return parameters;
}

export function decodeXmlToolCallText(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

export function invalidCancipActionFailureReason(issue: string, chinese: boolean): string {
  const detail = trimContext(redactSensitiveText(issue.replace(/\s+/g, " ").trim()), 180);
  return chinese
    ? `模型返回了非空内容，但动作格式无效：${detail}`
    : `The model returned non-empty content, but its action format was invalid: ${detail}`;
}

export function extractJsonObjectAroundIndex(input: string, index: number): string {
  let start = index;
  while (start >= 0 && input[start] !== "{") start -= 1;
  if (start < 0) return "";
  return extractJsonValueAt(input, start);
}

export function extractFirstJsonValue(input: string): string {
  const brace = input.indexOf("{");
  const bracket = input.indexOf("[");
  const start = brace < 0 ? bracket : bracket < 0 ? brace : Math.min(brace, bracket);
  if (start < 0) return "";
  return extractJsonValueAt(input, start);
}

export function extractJsonValueAt(input: string, start: number): string {
  if (start < 0 || start >= input.length) return "";
  const opener = input[start];
  if (opener !== "{" && opener !== "[") return "";
  const closer = opener === "{" ? "}" : "]";
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }
    if (char === "}" || char === "]") {
      if (!stack.length || stack[stack.length - 1] !== char) return "";
      stack.pop();
      if (!stack.length) return input.slice(start, index + 1).trim();
    }
  }
  return closer && stack.length ? "" : input.slice(start).trim();
}

export function commandArgsFromLooseObsidianAction(input: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = isRecord(input.args) ? { ...input.args } : {};
  for (const key of ["id", "commandId", "command", "name", "query"]) {
    if (typeof args[key] === "string" && String(args[key]).trim()) return args;
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      args[key] = value.trim();
      return args;
    }
  }
  return args;
}

export function commandArgsFromLooseJsAction(input: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = isRecord(input.args) ? { ...input.args } : {};
  for (const key of ["code", "script", "js", "body", "expression", "timeoutMs", "maxChars"]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) continue;
    if (Object.prototype.hasOwnProperty.call(input, key)) args[key] = input[key];
  }
  return args;
}

export function commandArgsFromLooseToolAction(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const nestedArgs = normalizeLooseToolArgs(input.args)
    ?? normalizeLooseToolArgs(input.params)
    ?? normalizeLooseToolArgs(input.arguments)
    ?? normalizeLooseFunctionToolArgs(input.function);
  if (nestedArgs) {
    const merged: Record<string, unknown> = { ...nestedArgs };
    for (const [key, value] of Object.entries(input)) {
      if (isLooseToolControlKey(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = value;
    }
    return normalizeCommandArgsSynonyms(merged);
  }
  if (isRecord(input.args)) return input.args;
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isLooseToolControlKey(key)) continue;
    args[key] = value;
  }
  return Object.keys(args).length ? normalizeCommandArgsSynonyms(args) : undefined;
}

export function isLooseToolControlKey(key: string): boolean {
  return /^(?:type|action|tool|command|cmd|name|function|args|params|arguments)$/i.test(key);
}

export function normalizeLooseToolArgs(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return { ...value };
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? { ...parsed } : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeLooseFunctionToolArgs(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeLooseToolArgs(value.arguments);
}

export function normalizeCommandArgsSynonyms(args: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...args };
  if (!Object.prototype.hasOwnProperty.call(next, "query")) {
    for (const key of ["q", "search", "text", "target", "name", "path"]) {
      const value = next[key];
      if (typeof value === "string" && value.trim()) {
        next.query = value.trim();
        break;
      }
    }
  }
  if (typeof next.kind === "string" && !Object.prototype.hasOwnProperty.call(next, "targetKind")) next.targetKind = next.kind;
  if (typeof next.type === "string" && !Object.prototype.hasOwnProperty.call(next, "targetKind")) next.targetKind = next.type;
  return next;
}

export function isCommandBusToolActionType(actionType: string): boolean {
  return /^(?:cancip|obsidian|web|github|js|javascript|browser)\./i.test(actionType.trim());
}

export function isLooseDirectActionCommand(actionType: string): boolean {
  return /^(?:read|write|append|patch|config|todo|automation|mkdir|rename|move|copy|delete|remove|search)$/i.test(actionType.trim());
}

export function looseActionAliasKey(value: string): string {
  return value.trim().replace(/[\s_-]+/g, "").toLowerCase();
}

export function optionalActionNumber(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function optionalActionString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export function isTodoActionOperation(value: unknown): value is TodoActionOperation {
  return value === "set" || value === "add" || value === "update" || value === "remove" || value === "list" || value === "clear";
}

export function isAutomationActionOperation(value: unknown): value is AutomationActionOperation {
  return value === "add" || value === "update" || value === "remove" || value === "list" || value === "run";
}

export function isAutomationSchedule(value: unknown): value is AutomationSchedule {
  return value === "manual" || value === "hourly" || value === "daily";
}

export function isAutomationNotifyMode(value: unknown): value is AutomationNotifyMode {
  return value === "inherit" || value === "always" || value === "failure" || value === "never";
}

export function isAutomationRunStatus(value: unknown): value is AutomationRunStatus {
  return value === "ok" || value === "failed" || value === "skipped" || value === "pending";
}

export function automationNewFilePathMatches(task: AutomationTask, path: string): boolean {
  const patterns = (task.newFilePattern || "**/*")
    .split(/[\n,;；]+/)
    .map((item) => item.trim().replace(/\\/g, "/").replace(/^\/+/, ""))
    .filter(Boolean);
  return patterns.some((pattern) => automationGlobMatches(pattern, path));
}

export function automationGlobMatches(pattern: string, path: string): boolean {
  const tokenized = pattern
    .replace(/\*\*/g, "\uE000")
    .replace(/\*/g, "\uE001")
    .replace(/\?/g, "\uE002");
  const source = escapeRegExp(tokenized)
    .replace(/\uE000\//g, "(?:.*/)?")
    .replace(/\uE000/g, ".*")
    .replace(/\uE001/g, "[^/]*")
    .replace(/\uE002/g, "[^/]");
  return new RegExp(`^${source}$`, "i").test(normalizePath(path.replace(/\\/g, "/")));
}

export function isAutomationSessionMode(value: unknown): value is AutomationSessionMode {
  return value === "current" || value === "new" || value === "session";
}

export function normalizeTodoActionItems(raw: unknown): TodoActionItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter(isRecord)
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      text: typeof item.text === "string" ? item.text : "",
      done: typeof item.done === "boolean" ? item.done : undefined,
      sendToModel: typeof item.sendToModel === "boolean" ? item.sendToModel : undefined
    }))
    .filter((item) => item.text.trim());
}

export function normalizeActionPath(rawPath: string): string {
  const original = rawPath;
  const trimmed = rawPath.trim().replace(/\\/g, "/");
  if (!trimmed) throw new Error(`Invalid action path: ${original}`);
  if (trimmed.startsWith("/") || trimmed.startsWith("//")) throw new Error(`Invalid action path: ${original}`);
  if (/^[a-zA-Z]:/.test(trimmed)) throw new Error(`Invalid action path: ${original}`);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) throw new Error(`Invalid action path: ${original}`);

  const normalized = normalizePath(trimmed);
  if (!normalized || normalized === "." || normalized.startsWith("/") || normalized.startsWith("../")) {
    throw new Error(`Invalid action path: ${original}`);
  }
  if (normalized.split("/").includes("..")) throw new Error(`Invalid action path: ${original}`);
  return normalized;
}

export function aiMutationCapturePathInSourceScope(sourceText: string, rawPath: string): boolean {
  const path = normalizePath(rawPath).replace(/^\/+/, "");
  const volatilePluginData = path.match(/^\.obsidian\/plugins\/([^/]+)\/data\.json$/i);
  const source = sourceText.replace(/\\/g, "/").toLowerCase();
  if (/^\.obsidian\/workspace(?:-mobile)?\.json$/i.test(path)) return source.includes(path.toLowerCase());
  if (!volatilePluginData) return true;
  const pluginId = volatilePluginData[1].toLowerCase();
  const lowerPath = path.toLowerCase();
  return source.includes(lowerPath)
    || source.includes(`plugin:${pluginId}`)
    || source.includes(`/plugins/${pluginId}/`);
}

export function scoreVaultPathCandidate(target: string, targetWithMd: string, candidate: string): number {
  const lower = target.toLowerCase();
  const lowerWithMd = targetWithMd.toLowerCase();
  const candidateLower = candidate.toLowerCase();
  if (candidateLower === lower || candidateLower === lowerWithMd) return 1000;

  const targetCompact = compactVaultPathForMatch(target);
  const targetWithMdCompact = compactVaultPathForMatch(targetWithMd);
  const candidateCompact = compactVaultPathForMatch(candidate);
  if (candidateCompact === targetCompact || candidateCompact === targetWithMdCompact) return 960;

  const targetBase = target.split("/").pop() ?? target;
  const targetBaseWithMd = targetWithMd.split("/").pop() ?? targetWithMd;
  const candidateBase = candidate.split("/").pop() ?? candidate;
  const targetBaseCompact = compactVaultPathForMatch(targetBase);
  const targetBaseWithMdCompact = compactVaultPathForMatch(targetBaseWithMd);
  const candidateBaseCompact = compactVaultPathForMatch(candidateBase);
  if (candidateBaseCompact === targetBaseCompact || candidateBaseCompact === targetBaseWithMdCompact) return 930;

  const pathScore = Math.round(normalizedSimilarity(targetWithMdCompact || targetCompact, candidateCompact) * 100);
  const baseScore = Math.round(normalizedSimilarity(targetBaseWithMdCompact || targetBaseCompact, candidateBaseCompact) * 100);
  let score = Math.max(pathScore, baseScore);
  if (candidateLower.endsWith(`/${lower}`) || candidateLower.endsWith(`/${lowerWithMd}`)) score = Math.max(score, 92);
  if (targetBaseCompact && candidateBaseCompact && (candidateBaseCompact.includes(targetBaseCompact) || targetBaseCompact.includes(candidateBaseCompact))) {
    score = Math.max(score, Math.min(89, Math.max(targetBaseCompact.length, candidateBaseCompact.length)));
  }
  return score;
}

export function compactVaultPathForMatch(path: string): string {
  return normalizePath(path)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\\/\s\-_.()[\]{}【】（）《》<>「」『』·,:：，。"'`~!！?？、]+/g, "");
}

export async function renameApprovedPathWithLinks(app: App, oldPath: string, newPath: string): Promise<void> {
  const adapter = app.vault.adapter;
  const file = app.vault.getAbstractFileByPath(oldPath);
  const fallbackSources = collectApprovedMoveLinkSources(app, oldPath);
  if (file) {
    try {
      await app.fileManager.renameFile(file, newPath);
      return;
    } catch (error) {
      console.warn("Cancip approved rename via FileManager failed, falling back to adapter rename", error);
    }
  }
  await adapter.rename(oldPath, newPath);
  await repairApprovedMoveLinks(app, oldPath, newPath, fallbackSources);
}

export function collectApprovedMoveLinkSources(app: App, oldPath: string): string[] {
  const oldNorm = normalizePath(oldPath);
  const oldNoExt = oldNorm.replace(/\.md$/i, "");
  const oldBase = oldNoExt.split("/").pop() ?? oldNoExt;
  const sources = new Set<string>();
  for (const [sourcePath, targets] of Object.entries(app.metadataCache.resolvedLinks ?? {})) {
    for (const targetPath of Object.keys(targets ?? {})) {
      const normalizedTarget = normalizePath(targetPath);
      if (normalizedTarget === oldNorm || normalizedTarget.replace(/\.md$/i, "") === oldNoExt) {
        sources.add(normalizePath(sourcePath));
      }
    }
  }
  for (const [sourcePath, targets] of Object.entries(app.metadataCache.unresolvedLinks ?? {})) {
    for (const targetPath of Object.keys(targets ?? {})) {
      if (approvedMoveMetadataTargetMatches(targetPath, oldNorm, oldNoExt, oldBase)) {
        sources.add(normalizePath(sourcePath));
      }
    }
  }
  return Array.from(sources);
}

export function approvedMoveMetadataTargetMatches(target: string, oldPath: string, oldNoExt: string, oldBase: string): boolean {
  const normalized = normalizePath(target.trim()).replace(/\.md$/i, "");
  if (!normalized) return false;
  return normalized === oldNoExt || normalized === oldPath.replace(/\.md$/i, "") || normalized === oldBase;
}

export async function repairApprovedMoveLinks(app: App, oldPath: string, newPath: string, sourcePaths?: string[]): Promise<{ changedFiles: number; replacements: number }> {
  const oldNorm = normalizePath(oldPath);
  const newNorm = normalizePath(newPath);
  if (!oldNorm || !newNorm || oldNorm === newNorm) return { changedFiles: 0, replacements: 0 };
  const newFile = app.vault.getAbstractFileByPath(newNorm);
  const oldNoExt = oldNorm.replace(/\.md$/i, "");
  const oldBase = oldNoExt.split("/").pop() ?? oldNoExt;
  const sourceSet = sourcePaths?.length ? new Set(sourcePaths.map((path) => normalizePath(path))) : null;
  const markdownFiles = sourceSet
    ? app.vault.getMarkdownFiles().filter((file) => sourceSet.has(normalizePath(file.path)))
    : app.vault.getMarkdownFiles();
  const allowBaseOnlyMatch = !!sourceSet;
  let changedFiles = 0;
  let replacements = 0;
  for (const source of markdownFiles) {
    const oldText = await app.vault.cachedRead(source);
    const newLinkText = newFile instanceof TFile
      ? app.metadataCache.fileToLinktext(newFile, source.path, true)
      : newNorm.replace(/\.md$/i, "");
    const repaired = replaceApprovedMoveLinksInText(oldText, oldNorm, newNorm, oldNoExt, oldBase, newLinkText, allowBaseOnlyMatch);
    if (repaired.text === oldText) continue;
    await app.vault.modify(source, repaired.text);
    changedFiles += 1;
    replacements += repaired.replacements;
  }
  if (changedFiles) await waitForMetadataResolve(app, markdownFiles.map((file) => file.path));
  return { changedFiles, replacements };
}

export function replaceApprovedMoveLinksInText(
  text: string,
  oldPath: string,
  newPath: string,
  oldNoExt: string,
  oldBase: string,
  newLinkText: string,
  allowBaseOnlyMatch: boolean
): { text: string; replacements: number } {
  let replacements = 0;
  const next = text
    .replace(/(!?)\[\[([^\]\n]+)\]\]/g, (full, embed: string, body: string) => {
      const replaced = replaceApprovedMoveWikiBody(body, oldPath, oldNoExt, oldBase, newLinkText, allowBaseOnlyMatch);
      if (replaced === body) return full;
      replacements += 1;
      return `${embed}[[${replaced}]]`;
    })
    .replace(/(\[[^\]\n]*\]\()([^)#\n]+)(#[^)\n]*)?(\))/g, (full, prefix: string, rawTarget: string, hash: string | undefined, suffix: string) => {
      const cleanTarget = rawTarget.trim();
      if (!approvedMoveMarkdownTargetMatches(cleanTarget, oldPath, oldNoExt, oldBase, allowBaseOnlyMatch)) return full;
      replacements += 1;
      const encoded = encodeURI(newPath).replace(/[()]/g, (match) => `%${match.charCodeAt(0).toString(16).toUpperCase()}`);
      return `${prefix}${encoded}${hash ?? ""}${suffix}`;
    });
  return { text: next, replacements };
}

export function replaceApprovedMoveWikiBody(body: string, oldPath: string, oldNoExt: string, oldBase: string, newLinkText: string, allowBaseOnlyMatch: boolean): string {
  const pipeIndex = body.indexOf("|");
  const linkPart = pipeIndex >= 0 ? body.slice(0, pipeIndex) : body;
  const aliasPart = pipeIndex >= 0 ? body.slice(pipeIndex) : "";
  const hashIndex = linkPart.indexOf("#");
  const target = hashIndex >= 0 ? linkPart.slice(0, hashIndex) : linkPart;
  const subpath = hashIndex >= 0 ? linkPart.slice(hashIndex) : "";
  if (!approvedMoveWikiTargetMatches(target, oldPath, oldNoExt, oldBase, allowBaseOnlyMatch)) return body;
  return `${newLinkText}${subpath}${aliasPart}`;
}

export function approvedMoveWikiTargetMatches(target: string, oldPath: string, oldNoExt: string, oldBase: string, allowBaseOnlyMatch: boolean): boolean {
  const normalized = normalizePath(target.trim()).replace(/\.md$/i, "");
  if (!normalized) return false;
  return normalized === oldNoExt || normalized === oldPath.replace(/\.md$/i, "") || (allowBaseOnlyMatch && normalized === oldBase);
}

export function approvedMoveMarkdownTargetMatches(target: string, oldPath: string, oldNoExt: string, oldBase: string, allowBaseOnlyMatch: boolean): boolean {
  let decoded = target;
  try {
    decoded = decodeURI(target);
  } catch {
    decoded = target;
  }
  const clean = normalizePath(decoded.replace(/^<|>$/g, "").replace(/^\.\//, "")).replace(/\.md$/i, "");
  return clean === oldNoExt || clean === oldPath.replace(/\.md$/i, "") || (allowBaseOnlyMatch && clean === oldBase);
}

export async function waitForMetadataResolve(app: App, paths: string[], timeoutMs = 1200): Promise<void> {
  const wanted = new Set(paths.map((path) => normalizePath(path)).filter(Boolean));
  if (!wanted.size) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      app.metadataCache.offref(refResolved);
      app.metadataCache.offref(refResolve);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    const refResolved = app.metadataCache.on("resolved", finish);
    const refResolve = app.metadataCache.on("resolve", (file: TFile) => {
      if (wanted.has(normalizePath(file.path))) finish();
    });
  });
}

