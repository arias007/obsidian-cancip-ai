/*
 * Cancip model-api — extracted from src/main.ts by scripts/extract-main-modules.mjs.
 * Declarations here were proven to reference nothing left behind in main.ts, so this
 * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.
 */
import { loadPdfJs, TFile, TFolder } from "obsidian";
import { decodeDocumentText, normalizeDocumentArchiveEntryPath, readXlsxSheetDescriptors, trimContext } from "./office";
import { stableTextHash, uniqueStrings } from "./search";
import { ApiMode, ApiProfile, PrimeTtsPackageDefinition, SearchHit, TarEntry, TargetCandidate, TokenUsage, ZipEntry } from "./types-1";
import { normalizePdfTtsText } from "./ui";
import { isCredibleVaultTargetCandidate, isRecord, looksLikeExplicitVaultFileQuery, redactSensitiveText, sleep, withTimeout } from "./vault-2";

export function parseOfficeXml(xml: string, warnings: string[], name: string): XMLDocument {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const error = parsed.querySelector("parsererror")?.textContent?.trim();
  if (error) warnings.push(`${name}: XML parse warning`);
  return parsed;
}

export function descendantsByLocalName(parent: ParentNode, localName: string): Element[] {
  const withNamespaces = "getElementsByTagNameNS" in parent
    ? Array.from((parent as Document | Element).getElementsByTagNameNS("*", localName))
    : [];
  if (withNamespaces.length) return withNamespaces;
  return Array.from(parent.querySelectorAll("*")).filter((element) => element.localName === localName);
}

export function firstDescendantByLocalName(parent: ParentNode | null, localName: string): Element | null {
  return parent ? descendantsByLocalName(parent, localName)[0] ?? null : null;
}

export function childElementsByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((element) => element.localName === localName);
}

export function officeAttribute(element: Element | null, localName: string): string {
  if (!element) return "";
  return Array.from(element.attributes).find((attribute) => attribute.localName === localName)?.value ?? "";
}

export function officePartLabel(path: string): string {
  if (/header/i.test(path)) return "页眉";
  if (/footer/i.test(path)) return "页脚";
  if (/footnotes/i.test(path)) return "脚注";
  if (/endnotes/i.test(path)) return "尾注";
  return path;
}

export function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+.!|>-])/g, "\\$1");
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export async function extractPdfText(file: File, maxChars: number, warnings: string[], maxPages = 80): Promise<string> {
  let loadingTask: { promise?: Promise<unknown>; destroy?: () => Promise<void> | void } | null = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
    loadingTask = task;
    const document = await task.promise as {
      numPages: number;
      getPage: (pageNumber: number) => Promise<{ getTextContent: () => Promise<{ items?: unknown[] }> }>;
      cleanup?: () => Promise<void> | void;
    };
    const pages: string[] = [];
    const pageLimit = Math.min(Math.max(0, document.numPages || 0), Math.max(1, Math.floor(maxPages)));
    let chars = 0;
    for (let pageNumber = 1; pageNumber <= pageLimit && chars < maxChars; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const parts: string[] = [];
      for (const item of Array.isArray(content.items) ? content.items : []) {
        if (!isRecord(item) || typeof item.str !== "string") continue;
        const value = item.str.replace(/\s+/g, " ").trim();
        if (value) parts.push(value);
        if (item.hasEOL === true) parts.push("\n");
      }
      const pageText = normalizeExtractedText(parts.join(" ").replace(/\s+\n\s+/g, "\n"));
      if (pageText) {
        pages.push(pageText);
        chars += pageText.length;
      }
      if (pageNumber % 4 === 0) await sleep(0);
    }
    await document.cleanup?.();
    if (document.numPages > pageLimit) warnings.push(`Indexed the first ${pageLimit} of ${document.numPages} PDF pages.`);
    const text = trimContext(pages.join("\n\n"), maxChars);
    if (looksLikeReadableExtractedText(text)) return text;
    warnings.push(`PDF.js found no readable text layer in ${file.name}; trying the lightweight stream fallback.`);
  } catch (error) {
    warnings.push(`PDF.js: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      await loadingTask?.destroy?.();
    } catch {
      // PDF.js cleanup is best effort.
    }
  }
  const maxBytes = Math.min(file.size, 5 * 1024 * 1024);
  const bytes = new Uint8Array(await file.slice(0, maxBytes).arrayBuffer());
  const text = extractPdfTextFromBytes(bytes, file.name, maxChars, warnings);
  if (file.size > maxBytes) warnings.push(`Only scanned first ${formatFileSize(maxBytes)} of ${formatFileSize(file.size)} in the fallback parser.`);
  return text;
}

export function extractPdfTextFromBytes(bytes: Uint8Array, name: string, maxChars: number, warnings: string[]): string {
  const raw = latin1Decode(bytes);
  const chunks: string[] = [];
  const textObjectRegex = /BT([\s\S]*?)ET/g;
  for (const match of raw.matchAll(textObjectRegex)) {
    chunks.push(...extractPdfTextFragments(match[1]));
    if (chunks.join("\n").length >= maxChars) break;
  }
  if (!chunks.length) chunks.push(...extractPdfTextFragments(raw));
  const text = normalizePdfTtsText(chunks.join("\n"));
  if (!text || !looksLikeReadableExtractedText(text)) {
    warnings.push(`No readable uncompressed PDF text operators were found in ${name}. This may be scanned/OCR-only, encrypted, compressed, or requires a PDF text layer/OCR parser.`);
    return "";
  }
  return trimContext(text, maxChars);
}

export function extractPdfTextFragments(raw: string): string[] {
  const fragments: string[] = [];
  for (const match of raw.matchAll(/\((?:\\.|[^\\)]){1,500}\)\s*(?:Tj|'|"|TJ)?/g)) {
    const body = match[0].replace(/\)\s*(?:Tj|'|"|TJ)?\s*$/g, "").slice(1);
    const text = decodePdfLiteral(body);
    if (looksLikeReadableText(text)) fragments.push(text);
  }
  for (const match of raw.matchAll(/<([0-9A-Fa-f\s]{4,2000})>\s*(?:Tj|'|"|TJ)?/g)) {
    const text = decodePdfHexText(match[1]);
    if (looksLikeReadableText(text)) fragments.push(text);
  }
  return fragments;
}

export function decodePdfLiteral(input: string): string {
  return input
    .replace(/\\([nrtbf()\\])/g, (_full, code: string) => {
      if (code === "n" || code === "r") return "\n";
      if (code === "t") return "\t";
      if (code === "b" || code === "f") return " ";
      return code;
    })
    .replace(/\\([0-7]{1,3})/g, (_full, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

export function decodePdfHexText(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (/^feff/i.test(clean) && clean.length % 4 === 0) return decodeUtf16BeHex(clean.slice(4));
  const bytes: number[] = [];
  for (let index = 0; index + 1 < clean.length; index += 2) bytes.push(parseInt(clean.slice(index, index + 2), 16));
  const byteArray = new Uint8Array(bytes.filter((byte) => Number.isFinite(byte)));
  if (byteArray.length >= 3 && byteArray[0] === 0xef && byteArray[1] === 0xbb && byteArray[2] === 0xbf) return utf8Decode(byteArray.subarray(3));
  const utf8Text = utf8Decode(byteArray);
  if (looksLikeReadableText(utf8Text)) return utf8Text;
  if (clean.length % 4 === 0) {
    const utf16Text = decodeUtf16BeHex(clean);
    if (looksLikeReadableText(utf16Text)) return utf16Text;
  }
  return latin1Decode(byteArray);
}

export function decodeUtf16BeHex(hex: string): string {
  const chars: string[] = [];
  for (let index = 0; index + 3 < hex.length; index += 4) {
    const code = parseInt(hex.slice(index, index + 4), 16);
    if (Number.isFinite(code) && code > 0) chars.push(String.fromCharCode(code));
  }
  return chars.join("");
}

export function readZipEntries(bytes: Uint8Array, warnings: string[]): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipEntry[] = [];
  const start = Math.max(0, bytes.length - 66000);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= start; index -= 1) {
    if (readUint32(view, index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return entries;
  const totalEntries = readUint16(view, eocd + 10);
  const directoryOffset = readUint32(view, eocd + 16);
  let cursor = directoryOffset;
  for (let index = 0; index < totalEntries && cursor + 46 <= bytes.length; index += 1) {
    if (readUint32(view, cursor) !== 0x02014b50) break;
    const flags = readUint16(view, cursor + 8);
    const compression = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const nameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localOffset = readUint32(view, cursor + 42);
    if (cursor + 46 + nameLength + extraLength + commentLength > bytes.length || localOffset + 30 > bytes.length) break;
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const utf8Name = utf8Decode(nameBytes);
    const fallbackName = decodeDocumentText(nameBytes, true).text;
    const name = (flags & 0x0800) !== 0 || !utf8Name.includes("\ufffd") ? utf8Name : fallbackName || utf8Name;
    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (name && !name.endsWith("/") && dataOffset + compressedSize <= bytes.length) {
      entries.push({ name, flags, compression, compressedSize, uncompressedSize, dataOffset });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const unsupported = entries.filter((entry) => entry.compression !== 0 && entry.compression !== 8).length;
  if (unsupported) warnings.push(`${unsupported} ZIP entries use unsupported compression methods.`);
  const encrypted = entries.filter((entry) => (entry.flags & 1) !== 0).length;
  if (encrypted) warnings.push(`${encrypted} ZIP entries are encrypted and cannot be previewed.`);
  return entries;
}

export async function extractZipEntryText(entry: ZipEntry, bytes: Uint8Array, warnings: string[]): Promise<string> {
  return utf8Decode(await extractZipEntryBytes(entry, bytes, warnings));
}

export async function extractZipEntryBytes(entry: ZipEntry, bytes: Uint8Array, warnings: string[]): Promise<Uint8Array> {
  if ((entry.flags & 1) !== 0) {
    warnings.push(`${entry.name}: encrypted ZIP entries are not supported`);
    return new Uint8Array();
  }
  const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) {
    try {
      return await inflateRawBytes(compressed, entry.uncompressedSize);
    } catch (error) {
      warnings.push(`${entry.name}: inflate failed (${error instanceof Error ? error.message : String(error)})`);
      return new Uint8Array();
    }
  }
  warnings.push(`${entry.name}: unsupported ZIP compression method ${entry.compression}`);
  return new Uint8Array();
}

export function tarHeaderText(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(offset, offset + length)).replace(/\0.*$/s, "").trim();
}

export function tarHeaderNumber(bytes: Uint8Array, offset: number, length: number): number {
  const value = tarHeaderText(bytes, offset, length).replace(/[^0-7]/g, "");
  return value ? Number.parseInt(value, 8) : 0;
}

export function tarPaxPath(bytes: Uint8Array): string {
  const text = utf8Decode(bytes);
  for (const line of text.split("\n")) {
    const value = line.replace(/^\d+\s+/, "");
    if (value.startsWith("path=")) return value.slice(5).trim();
  }
  return "";
}

export function readTarEntries(bytes: Uint8Array, warnings: string[]): TarEntry[] {
  const entries: TarEntry[] = [];
  let cursor = 0;
  let pendingLongName = "";
  let pendingPaxPath = "";
  while (cursor + 512 <= bytes.byteLength) {
    const header = bytes.subarray(cursor, cursor + 512);
    if (header.every((value) => value === 0)) break;
    const size = tarHeaderNumber(bytes, cursor + 124, 12);
    const type = String.fromCharCode(bytes[cursor + 156] || 0);
    const dataOffset = cursor + 512;
    const spanEnd = dataOffset + Math.ceil(size / 512) * 512;
    if (!Number.isFinite(size) || size < 0 || spanEnd > bytes.byteLength) {
      warnings.push("TAR entry exceeds the archive boundary.");
      break;
    }
    const rawName = tarHeaderText(bytes, cursor, 100);
    const prefix = tarHeaderText(bytes, cursor + 345, 155);
    const headerName = normalizeDocumentArchiveEntryPath(prefix ? `${prefix}/${rawName}` : rawName);
    if (type === "L") {
      pendingLongName = normalizeDocumentArchiveEntryPath(utf8Decode(bytes.subarray(dataOffset, dataOffset + size)).replace(/\0+$/, ""));
    } else if (type === "x") {
      pendingPaxPath = normalizeDocumentArchiveEntryPath(tarPaxPath(bytes.subarray(dataOffset, dataOffset + size)));
    } else {
      const name = pendingPaxPath || pendingLongName || headerName;
      if (name && (type === "" || type === "\0" || type === "0" || type === "7")) {
        entries.push({ name, size, type, headerOffset: cursor, dataOffset, spanEnd });
      }
      pendingLongName = "";
      pendingPaxPath = "";
    }
    cursor = spanEnd;
  }
  return entries;
}

export function writeTarOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  const digits = Math.max(0, Math.floor(value)).toString(8);
  if (digits.length > length - 1) throw new Error("TAR entry is too large to encode safely");
  header.fill(0, offset, offset + length);
  const padded = digits.padStart(length - 1, "0");
  for (let index = 0; index < padded.length; index += 1) header[offset + index] = padded.charCodeAt(index);
}

export function concatenateDocumentBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function replaceTarEntryBytes(bytes: Uint8Array, path: string, replacement: Uint8Array): Uint8Array {
  const warnings: string[] = [];
  const normalized = normalizeDocumentArchiveEntryPath(path);
  const matches = readTarEntries(bytes, warnings).filter((entry) => normalizeDocumentArchiveEntryPath(entry.name) === normalized);
  if (matches.length !== 1) throw new Error(matches.length ? "Archive entry path is ambiguous" : "Archive entry was not found");
  const entry = matches[0];
  const header = bytes.slice(entry.headerOffset, entry.dataOffset);
  writeTarOctal(header, 124, 12, replacement.byteLength);
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, value) => sum + value, 0);
  const checksumText = checksum.toString(8).padStart(6, "0");
  for (let index = 0; index < 6; index += 1) header[148 + index] = checksumText.charCodeAt(index);
  header[154] = 0;
  header[155] = 0x20;
  const padding = new Uint8Array((512 - replacement.byteLength % 512) % 512);
  return concatenateDocumentBytes([
    bytes.subarray(0, entry.headerOffset),
    header,
    replacement,
    padding,
    bytes.subarray(entry.spanEnd)
  ]);
}

export function documentArchiveSingleGzipEntryPath(file: TFile): string {
  const name = file.name.replace(/\.gz$/i, "");
  return normalizeDocumentArchiveEntryPath(name || file.basename || "content");
}

export function primeTtsAssetPaths(basePath: string): { encoder: string; decoder: string; vocoder: string; meta: string; symbols: string; ortWasm: string; ortMjs: string } {
  return {
    encoder: `${basePath}/acoustic_encoder.onnx`,
    decoder: `${basePath}/acoustic_decoder.onnx`,
    vocoder: `${basePath}/vocoder.onnx`,
    meta: `${basePath}/meta.json`,
    symbols: `${basePath}/symbol_table.json`,
    ortWasm: `${basePath}/ort/ort-wasm-simd-threaded.wasm`,
    ortMjs: `${basePath}/ort/ort-wasm-simd-threaded.mjs`
  };
}

export function primeTtsPackageSupportsLanguage(pkg: PrimeTtsPackageDefinition, languageCode: string): boolean {
  const normalized = languageCode.toLowerCase();
  const base = normalized.split("-")[0];
  return pkg.languages.some((language) => {
    const candidate = language.toLowerCase();
    return candidate === normalized || candidate === base || candidate.split("-")[0] === base;
  });
}

export async function extractDocxText(entries: ZipEntry[], bytes: Uint8Array, maxChars: number, warnings: string[]): Promise<string> {
  const names = ["word/document.xml", ...entries.map((entry) => entry.name).filter((name) => /^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/i.test(name))];
  const parts: string[] = [];
  for (const name of uniqueStrings(names)) {
    const entry = entries.find((item) => item.name === name);
    if (!entry) continue;
    const xml = await extractZipEntryText(entry, bytes, warnings);
    if (!xml) continue;
    const text = extractXmlTextRuns(xml);
    if (text) parts.push(`## ${name}\n${text}`);
    if (parts.join("\n\n").length >= maxChars) break;
  }
  return trimContext(normalizeExtractedText(parts.join("\n\n")), maxChars);
}

export async function extractPptxText(entries: ZipEntry[], bytes: Uint8Array, maxChars: number, warnings: string[]): Promise<string> {
  const slideEntries = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => naturalNameNumber(a.name) - naturalNameNumber(b.name));
  const parts: string[] = [];
  for (const entry of slideEntries) {
    const xml = await extractZipEntryText(entry, bytes, warnings);
    const text = extractXmlTextRuns(xml);
    if (text) parts.push(`## ${entry.name}\n${text}`);
    if (parts.join("\n\n").length >= maxChars) break;
  }
  return trimContext(normalizeExtractedText(parts.join("\n\n")), maxChars);
}

export function normalizeZipPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

export function findZipEntry(entries: ZipEntry[], path: string): ZipEntry | undefined {
  const normalized = normalizeZipPath(path).toLocaleLowerCase();
  return entries.find((entry) => normalizeZipPath(entry.name).toLocaleLowerCase() === normalized);
}

export function resolveZipTarget(sourcePath: string, target: string): string {
  const normalizedTarget = target.trim().replace(/\\/g, "/");
  if (!normalizedTarget) return "";
  if (normalizedTarget.startsWith("/")) return normalizeZipPath(normalizedTarget.slice(1));
  const sourceParts = normalizeZipPath(sourcePath).split("/");
  sourceParts.pop();
  return normalizeZipPath([...sourceParts, normalizedTarget].join("/"));
}

export function xlsxWorksheetEntries(entries: ZipEntry[]): ZipEntry[] {
  return entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(normalizeZipPath(entry.name)))
    .sort((a, b) => naturalNameNumber(a.name) - naturalNameNumber(b.name));
}

export function xlsxWorksheetEntry(entries: ZipEntry[], path: string, index: number): ZipEntry | undefined {
  return findZipEntry(entries, path) ?? xlsxWorksheetEntries(entries)[index];
}

export async function extractXlsxText(entries: ZipEntry[], bytes: Uint8Array, maxChars: number, warnings: string[]): Promise<string> {
  const sharedStrings = await readXlsxSharedStrings(entries, bytes, warnings);
  const descriptors = await readXlsxSheetDescriptors(entries, bytes, warnings);
  const sheetEntries = xlsxWorksheetEntries(entries);
  const sheets = descriptors.length
    ? descriptors
    : sheetEntries.map((entry, index) => ({ name: `Sheet ${index + 1}`, path: entry.name }));
  const parts: string[] = [];
  for (const [index, sheet] of sheets.entries()) {
    const entry = xlsxWorksheetEntry(entries, sheet.path, index);
    if (!entry) continue;
    const xml = await extractZipEntryText(entry, bytes, warnings);
    const title = sheet.name || entry.name;
    const rows = extractXlsxRows(xml, sharedStrings).slice(0, 80);
    if (rows.length) parts.push(`## ${title}\n${rows.map((row) => row.join(" | ")).join("\n")}`);
    if (parts.join("\n\n").length >= maxChars) break;
  }
  return trimContext(normalizeExtractedText(parts.join("\n\n")), maxChars);
}

export async function extractZipText(entries: ZipEntry[], bytes: Uint8Array, maxChars: number, warnings: string[]): Promise<string> {
  const parts: string[] = [];
  for (const entry of entries) {
    if (!/\.(xml|txt|md|csv|json|html?)$/i.test(entry.name)) continue;
    const text = entry.name.endsWith(".xml")
      ? extractXmlTextRuns(await extractZipEntryText(entry, bytes, warnings))
      : await extractZipEntryText(entry, bytes, warnings);
    if (text) parts.push(`## ${entry.name}\n${trimContext(text, 4000)}`);
    if (parts.join("\n\n").length >= maxChars) break;
  }
  return trimContext(normalizeExtractedText(parts.join("\n\n")), maxChars);
}

export async function readXlsxSharedStrings(entries: ZipEntry[], bytes: Uint8Array, warnings: string[]): Promise<string[]> {
  const entry = findZipEntry(entries, "xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = await extractZipEntryText(entry, bytes, warnings);
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/gi)].map((match) => extractXmlTextRuns(match[0]));
}

export function extractXlsxRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[\s\S]*?<\/row>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const type = attrs.match(/\bt="([^"]+)"/i)?.[1] ?? "";
      const inline = body.match(/<is\b[\s\S]*?<\/is>/i)?.[0];
      const value = body.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
      if (type === "s") {
        cells.push(sharedStrings[Number(value)] ?? value);
      } else if (type === "inlineStr" && inline) {
        cells.push(extractXmlTextRuns(inline));
      } else {
        cells.push(decodeXmlEntities(value));
      }
    }
    const cleaned = cells.map((cell) => normalizeExtractedText(cell)).filter(Boolean);
    if (cleaned.length) rows.push(cleaned);
  }
  return rows;
}

export function extractXmlTextRuns(xml: string): string {
  const runs = [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi)].map((match) => decodeXmlEntities(stripXmlTags(match[1])));
  if (runs.length) return normalizeExtractedText(runs.join(" "));
  return normalizeExtractedText(decodeXmlEntities(stripXmlTags(xml)));
}

export function stripXmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ");
}

export function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_full, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_full, code: string) => String.fromCharCode(parseInt(code, 16)));
}

export function normalizeExtractedText(input: string): string {
  return input
    .split(String.fromCharCode(0)).join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksLikeReadableText(input: string): boolean {
  const text = input.trim();
  if (text.length < 2) return false;
  const readable = text.replace(/[^\p{L}\p{N}\p{Script=Han}\s.,;:!?，。！？、（）()_/-]/gu, "");
  return readable.length / Math.max(1, text.length) > 0.45;
}

export function looksLikeReadableExtractedText(input: string): boolean {
  const text = input.replace(/\s+/g, "");
  if (text.length < 2) return false;
  const controls = [...text].filter(isUnreadableControlChar).length;
  if (controls / Math.max(1, text.length) > 0.02) return false;
  const readable = text.replace(/[^\p{L}\p{N}\p{Script=Han}.,;:!?，。！？、（）()_/-]/gu, "");
  return readable.length / Math.max(1, text.length) > 0.55;
}

export function isUnreadableControlChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code === 0xfffd || (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31);
}

export function utf8Decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return latin1Decode(bytes);
  }
}

export function latin1Decode(bytes: Uint8Array): string {
  let output = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return output;
}

export function readUint16(view: DataView, offset: number): number {
  return offset >= 0 && offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0;
}

export function readUint32(view: DataView, offset: number): number {
  return offset >= 0 && offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0;
}

export function naturalNameNumber(name: string): number {
  const match = name.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

export async function inflateRawBytes(bytes: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  const decompression = (window as unknown as { DecompressionStream?: new (format: string) => DecompressionStream }).DecompressionStream;
  if (decompression) {
    const stream = new Blob([uint8ArrayToArrayBuffer(bytes)]).stream().pipeThrough(new decompression("deflate-raw"));
    const buffer = await new Response(stream).arrayBuffer();
    const output = new Uint8Array(buffer);
    if (expectedSize > 0 && output.byteLength !== expectedSize) {
      // Some ZIP writers report approximate sizes; keep extracted text if decoding succeeded.
    }
    return output;
  }
  const zlibLike = (window as unknown as { require?: (name: string) => unknown }).require?.("zlib") as
    | { inflateRawSync?: (input: Uint8Array) => Uint8Array | ArrayBuffer }
    | undefined;
  if (!zlibLike?.inflateRawSync) {
    throw new Error("deflate decompression bridge unavailable in this runtime");
  }
  const inflated = zlibLike.inflateRawSync(bytes);
  const output = inflated instanceof Uint8Array ? inflated : new Uint8Array(inflated);
  if (expectedSize > 0 && output.byteLength !== expectedSize) {
    // Some ZIP writers report approximate sizes; warn by letting caller keep extracted text.
  }
  return output;
}

export function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return arrayBufferToDataUrl(buffer, file.type || "application/octet-stream");
}

export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType = "application/octet-stream"): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function summarizeModelRequestBody(value: unknown): unknown {
  if (!isRecord(value)) {
    return typeof value === "string"
      ? { type: "string", chars: value.length }
      : { type: typeof value };
  }
  const summary: Record<string, unknown> = {
    model: typeof value.model === "string" ? value.model : undefined,
    temperature: typeof value.temperature === "number" ? value.temperature : undefined,
    max_tokens: typeof value.max_tokens === "number" ? value.max_tokens : undefined,
    max_output_tokens: typeof value.max_output_tokens === "number" ? value.max_output_tokens : undefined,
    has_previous_response_id: typeof value.previous_response_id === "string" && value.previous_response_id.length > 0
  };
  if (typeof value.instructions === "string") {
    summary.instructions_chars = value.instructions.length;
  }
  if (Array.isArray(value.messages)) {
    const messages = value.messages.map((message) => {
      if (!isRecord(message)) return { type: typeof message };
      return {
        role: typeof message.role === "string" ? message.role : "",
        content: summarizeRequestContent(message.content)
      };
    });
    summary.messages = messages;
    summary.input_chars = messages.reduce((total, message) => total + requestContentCharCount(message.content), 0);
  }
  if ("input" in value) {
    const input = summarizeRequestContent(value.input);
    summary.input = input;
    summary.input_chars = requestContentCharCount(input);
  }
  return Object.fromEntries(Object.entries(summary).filter(([, item]) => item !== undefined));
}

export function summarizeRequestContent(value: unknown): unknown {
  if (typeof value === "string") return { type: "text", chars: value.length };
  if (Array.isArray(value)) {
    const summaries = value.map((item) => summarizeRequestContent(item));
    return {
      type: "array",
      items: value.length,
      chars: summaries.reduce((total: number, item) => total + requestContentCharCount(item), 0),
      images: summaries.reduce((total: number, item) => total + requestContentImageCount(item), 0)
    };
  }
  if (!isRecord(value)) return { type: typeof value };
  if (typeof value.text === "string") return { type: String(value.type ?? "text"), chars: value.text.length };
  if (typeof value.image_url === "string" || isRecord(value.image_url)) return { type: String(value.type ?? "image"), images: 1 };
  if (typeof value.content === "string" || Array.isArray(value.content)) {
    const content = summarizeRequestContent(value.content);
    return { type: String(value.type ?? "message"), content, chars: requestContentCharCount(content), images: requestContentImageCount(content) };
  }
  return { type: String(value.type ?? "object"), keys: Object.keys(value).slice(0, 8) };
}

export function requestContentCharCount(summary: unknown): number {
  if (!isRecord(summary)) return 0;
  const chars = typeof summary.chars === "number" ? summary.chars : 0;
  const content = requestContentCharCount(summary.content);
  return chars + content;
}

export function requestContentImageCount(summary: unknown): number {
  if (!isRecord(summary)) return 0;
  const images = typeof summary.images === "number" ? summary.images : 0;
  const content = requestContentImageCount(summary.content);
  return images + content;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const precision = value >= 10 || index === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[index]}`;
}

export function stringOccurrences(content: string, query: string): number[] {
  const indexes: number[] = [];
  if (!query) return indexes;
  let cursor = 0;
  while (cursor <= content.length) {
    const index = content.indexOf(query, cursor);
    if (index < 0) break;
    indexes.push(index);
    cursor = index + Math.max(1, query.length);
  }
  return indexes;
}

export function snippetAroundIndex(content: string, index: number, maxLength: number): string {
  const safeMax = Math.max(200, maxLength);
  const start = Math.max(0, index - Math.floor(safeMax / 2));
  const end = Math.min(content.length, start + safeMax);
  const prefix = start > 0 ? `...[start ${start}]\n` : "";
  const suffix = end < content.length ? `\n...[end ${end}]` : "";
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

export function numberLines(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  const total = Math.max(1, lines.length);
  const safeStart = Math.max(1, Math.min(startLine, total));
  const safeEnd = Math.max(safeStart, Math.min(endLine, total));
  return lines
    .slice(safeStart - 1, safeEnd)
    .map((line, index) => `${safeStart + index}: ${line}`)
    .join("\n");
}

export function lineRangeAroundLine(content: string, line: number, maxLength: number): { startLine: number; endLine: number; text: string } {
  const lines = content.split(/\r?\n/);
  const total = Math.max(1, lines.length);
  const safeLine = Math.max(1, Math.min(line, total));
  const radius = Math.max(8, Math.floor(Math.max(500, maxLength) / 220));
  const startLine = Math.max(1, safeLine - radius);
  const endLine = Math.min(total, safeLine + radius);
  return { startLine, endLine, text: numberLines(content, startLine, endLine) };
}

export function lineRangeAroundIndex(content: string, index: number, maxLength: number): { startLine: number; endLine: number; text: string } {
  const before = content.slice(0, Math.max(0, Math.min(index, content.length)));
  const hitLine = before.split(/\r?\n/).length;
  return lineRangeAroundLine(content, hitLine, maxLength);
}

export function normalizePatchRegexFlags(rawFlags: string | undefined, all: boolean): string {
  const allowed = new Set(["i", "m", "s", "u"]);
  const flags: string[] = [];
  for (const flag of String(rawFlags ?? "")) {
    if (flag === "g") continue;
    if (allowed.has(flag) && !flags.includes(flag)) flags.push(flag);
  }
  if (all) flags.push("g");
  return flags.join("");
}

export function formatPatchFindFailure(path: string, current: string, find: string, regex: boolean): string {
  const hint = patchFailureHint(current, find);
  return [
    `patch ${regex ? "regex" : "find text"} was not found in ${path}.`,
    "Do not retry the same patch. First read the current file with a focused query, or use a smaller anchored patch.",
    `Suggested read action: {"type":"read","path":"${path}","query":"<short current anchor>","maxChars":8000}`,
    `file length: ${current.length}`,
    `missing ${regex ? "regex" : "find"}: ${trimContext(redactSensitiveText(find), 500)}`,
    hint ? `closest current snippet:\n${trimContext(redactSensitiveText(hint), 1200)}` : ""
  ].filter(Boolean).join("\n\n");
}

export function patchFailureHint(current: string, find: string): string {
  const candidates = patchFindCandidates(find);
  for (const candidate of candidates) {
    const index = current.indexOf(candidate);
    if (index >= 0) return snippetAroundIndex(current, index, 1200);
  }
  return "";
}

export function patchFindCandidates(find: string): string[] {
  const normalized = find.replace(/\s+/g, " ").trim();
  const candidates: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length >= 12 && !candidates.includes(trimmed)) candidates.push(trimmed);
  };
  push(normalized.slice(0, 160));
  if (normalized.length > 220) {
    push(normalized.slice(Math.max(0, Math.floor(normalized.length / 2) - 80), Math.floor(normalized.length / 2) + 80));
    push(normalized.slice(-160));
  }
  const tokenPattern = /[A-Za-z_$][A-Za-z0-9_$]{8,}|[\u4e00-\u9fff]{4,}/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(find)) !== null) {
    push(match[0]);
    if (candidates.length >= 8) break;
  }
  return candidates;
}

export function patchRecoveryQuery(find: string): string | undefined {
  const cleaned = find
    .replace(/\\s[+*?]?/g, " ")
    .replace(/\\([/\\.^$*+?()[\]{}|])/g, "$1")
    .replace(/\(\?:/g, "(")
    .replace(/\s+/g, " ");
  const stopWords = new Set([
    "function", "return", "const", "let", "var", "this", "type", "path",
    "patch", "regex", "replace", "find", "true", "false", "string",
    "number", "object", "undefined", "null"
  ]);
  const tokenPattern = /[.#]?[A-Za-z_$][A-Za-z0-9_$-]{5,}|[\u4e00-\u9fff]{3,}/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(cleaned)) !== null) {
    const token = match[0].trim();
    const normalized = token.replace(/^[.#]/, "").toLowerCase();
    if (stopWords.has(normalized)) continue;
    return token.slice(0, 80);
  }
  return patchFindCandidates(cleaned)[0]?.slice(0, 80);
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function parseGithubState(value: unknown): string {
  const state = typeof value === "string" ? value.trim().toLowerCase() : "";
  return state === "closed" || state === "all" ? state : "open";
}

export function encodePathParts(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function parseJsonFallback(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function formatGithubRepo(json: unknown): string {
  if (!isRecord(json)) return ensureDisplayText(json);
  const lines = [
    `${String(json.full_name ?? json.name ?? "repository")}`,
    `default_branch: ${String(json.default_branch ?? "")}`,
    `visibility: ${String(json.visibility ?? "")}`,
    `open_issues: ${String(json.open_issues_count ?? "")}`,
    `pushed_at: ${String(json.pushed_at ?? "")}`,
    `url: ${String(json.html_url ?? "")}`
  ];
  return lines.filter((line) => !line.endsWith(": ")).join("\n");
}

export function formatGithubRateLimit(json: unknown): string {
  const resources = isRecord(json) && isRecord(json.resources) ? json.resources : {};
  const core = isRecord(resources.core) ? resources.core : isRecord(json) && isRecord(json.rate) ? json.rate : {};
  const remaining = String(core.remaining ?? "");
  const limit = String(core.limit ?? "");
  const reset = typeof core.reset === "number" ? new Date(core.reset * 1000).toISOString() : String(core.reset ?? "");
  return [`limit: ${limit}`, `remaining: ${remaining}`, `reset: ${reset}`].filter((line) => !line.endsWith(": ")).join("\n");
}

export function formatGithubCommits(json: unknown): string {
  if (!Array.isArray(json)) return ensureDisplayText(json);
  if (!json.length) return "No commits.";
  return json
    .filter(isRecord)
    .map((item) => {
      const commit = isRecord(item.commit) ? item.commit : {};
      const author = isRecord(commit.author) ? commit.author : {};
      const message = String(commit.message ?? "").split(/\r?\n/, 1)[0];
      const sha = String(item.sha ?? "").slice(0, 12);
      const date = String(author.date ?? "");
      const url = String(item.html_url ?? "");
      return `- ${sha}${date ? ` ${date}` : ""}${message ? ` ${message}` : ""}${url ? `\n  ${url}` : ""}`.trim();
    })
    .join("\n");
}

export function formatGithubItems(json: unknown, kind: "issue" | "pull" | "release" | "branch"): string {
  if (!Array.isArray(json)) return ensureDisplayText(json);
  if (!json.length) return "No GitHub items.";
  return json
    .filter(isRecord)
    .map((item) => {
      if (kind === "branch") {
        const commit = isRecord(item.commit) ? String(item.commit.sha ?? "").slice(0, 12) : "";
        return `- ${String(item.name ?? "")}${commit ? ` (${commit})` : ""}`;
      }
      const number = item.number !== undefined ? `#${String(item.number)}` : "";
      const tag = typeof item.tag_name === "string" ? item.tag_name : "";
      const title = String(item.title ?? item.name ?? tag);
      const state = String(item.state ?? item.draft ?? "");
      const url = String(item.html_url ?? "");
      const assets = kind === "release" && Array.isArray(item.assets)
        ? item.assets.filter(isRecord).map((asset) => String(asset.name ?? "")).filter(Boolean)
        : [];
      return [
        `- ${number || tag} ${title}${state ? ` [${state}]` : ""}`.trim(),
        assets.length ? `  assets: ${assets.join(", ")}` : "",
        url ? `  ${url}` : ""
      ].filter(Boolean).join("\n");
    })
    .join("\n");
}

export function formatSearchHitsForCommand(hits: SearchHit[]): string {
  if (!hits.length) return "No Vault Search hits.";
  return hits
    .map((hit, index) => {
      const excerpt = hit.excerpt.trim();
      const score = Number.isFinite(hit.score) ? ` score=${hit.score}` : "";
      return excerpt
        ? `${index + 1}. ${hit.path}${score}\n${excerpt}`
        : `${index + 1}. ${hit.path}${score}`;
    })
    .join("\n\n");
}

export function formatUniversalSearchContext(hits: SearchHit[]): string {
  return hits
    .map((hit, index) => {
      const excerpt = trimContext(redactSensitiveText(hit.excerpt), 440).trim();
      return `${index + 1}. ${hit.path}${excerpt ? `\n${excerpt}` : ""}`;
    })
    .join("\n\n");
}

export function formatTargetCandidatesForCommand(candidates: TargetCandidate[], query: string): string {
  const visibleCandidates = looksLikeExplicitVaultFileQuery(query)
    ? candidates.filter((candidate, index) => isCredibleVaultTargetCandidate(query, candidate, candidates[index + 1]))
    : candidates;
  if (!visibleCandidates.length) {
    if (looksLikeExplicitVaultFileQuery(query)) {
      return [
        `Exact file target not found: ${query}`,
        "No credible filename/path match exists. Do not open or read another file unless the user explicitly requests fuzzy search."
      ].join("\n");
    }
    return [
      `No target candidates for: ${query}`,
      "Try broader terms, cancip.searchVault for content-only search, obsidian.listCommands for command inventory, or cancip.attachment.help for PDF/image parsing routes."
    ].join("\n");
  }
  const lines = [
    `Target discovery for: ${query}`,
    "Candidates combine weak filename/path/folder inference, text and attachment-content matches, attachment metadata, folder relations, and Obsidian command fuzzy matches.",
    ""
  ];
  for (const [index, candidate] of visibleCandidates.entries()) {
    lines.push(`${index + 1}. [${candidate.kind}] ${candidate.path} — ${candidate.title} [score ${Math.round(candidate.score)}]`);
    lines.push(`   reason: ${candidate.reason}`);
    if (candidate.detail?.trim()) {
      for (const line of trimContext(candidate.detail, 420).split(/\r?\n/)) lines.push(`   ${line}`);
    }
    if (candidate.next) lines.push(`   next: ${candidate.next}`);
  }
  return lines.join("\n");
}

export function formatGithubWorkflowRuns(json: unknown): string {
  const runs = isRecord(json) && Array.isArray(json.workflow_runs) ? json.workflow_runs : [];
  if (!runs.length) return "No workflow runs.";
  return runs
    .filter(isRecord)
    .map((run) => {
      const status = [run.status, run.conclusion].filter((item) => typeof item === "string" && item).join("/");
      return `- ${String(run.name ?? run.display_title ?? "workflow")} ${status ? `[${status}]` : ""}\n  ${String(run.html_url ?? "")}`.trim();
    })
    .join("\n");
}

export function formatGithubFile(json: unknown): string {
  if (Array.isArray(json)) {
    return json
      .filter(isRecord)
      .map((item) => `- ${String(item.type ?? "file")} ${String(item.path ?? item.name ?? "")}`)
      .join("\n") || "Empty directory.";
  }
  if (!isRecord(json)) return ensureDisplayText(json);
  const path = String(json.path ?? json.name ?? "");
  const size = String(json.size ?? "");
  const encoding = String(json.encoding ?? "");
  const content = typeof json.content === "string" && encoding === "base64" ? decodeBase64Text(json.content) : "";
  const header = `${path}${size ? ` (${size} bytes)` : ""}`;
  return content ? `${header}\n\n${trimContext(content, 6000)}` : `${header}\n${String(json.html_url ?? "")}`.trim();
}

export function formatGithubCreatedIssue(json: unknown): string {
  if (!isRecord(json)) return ensureDisplayText(json);
  return `Created issue #${String(json.number ?? "")}: ${String(json.title ?? "")}\n${String(json.html_url ?? "")}`.trim();
}

export function decodeBase64Text(input: string): string {
  const compact = input.replace(/\s+/g, "");
  try {
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      return decodeURIComponent(
        Array.from(window.atob(compact))
          .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
          .join("")
      );
    }
  } catch {
    return "";
  }
  return "";
}

export function apiUrlNormalizedRoot(rawUrl: string): string {
  return String(rawUrl ?? "").trim().replace(/\/+$/, "");
}

export function apiUrlPathname(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function apiUrlForRoot(root: string, mode: Exclude<ApiMode, "auto"> | "models"): string {
  const normalized = apiUrlNormalizedRoot(root);
  if (/\/chat\/completions$/i.test(normalized)) {
    if (mode === "models") return normalized;
    return mode === "responses" ? normalized.replace(/\/chat\/completions$/, "/responses") : normalized;
  }
  if (/\/responses$/i.test(normalized)) {
    if (mode === "models") return normalized;
    return mode === "responses" ? normalized : normalized.replace(/\/responses$/, "/chat/completions");
  }
  if (/\/models$/i.test(normalized)) return normalized;
  if (mode === "models") return `${normalized}/models`;
  return `${normalized}${mode === "responses" ? "/responses" : "/chat/completions"}`;
}

// A wrong endpoint shape shows up as a missing route, not as a model error.
// Only these failures are worth retrying against the next URL candidate.
export function isEndpointRoutingError(error: unknown): boolean {
  const reason = error instanceof Error ? error.message : String(error ?? "");
  // Deliberately narrow: a 400 usually means the model or payload is rejected,
  // not that the path is wrong. Retrying those would only mask the real error.
  return /HTTP\s*(?:404|405|501)\b|cannot\s+(?:POST|GET)\s|no\s+such\s+(?:route|path|endpoint)|unknown\s+(?:route|path|endpoint)|route\s+not\s+found/i.test(reason);
}

export function describeApiEndpointTarget(profile: Pick<ApiProfile, "name" | "apiUrl">, url: string): string {
  const label = profile.name?.trim() || profile.apiUrl?.trim() || "model source";
  return `${label} → ${url}`;
}

export function resolveApiMode(setting: ApiMode, endpoint: { explicit: ApiMode | null }): ApiMode {
  if (setting !== "auto") return setting;
  return endpoint.explicit ?? "auto";
}

export function estimateTokenCountFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 3));
}

export function estimateRequestTokens(system: string, inputText: string): number {
  return estimateTextTokens(`${system}\n\n${inputText}`);
}

export function estimateTextTokens(text: string): number {
  const normalized = String(text ?? "");
  if (!normalized) return 0;
  const cjk = (normalized.match(/[\u3400-\u9fff]/g) ?? []).length;
  const whitespace = (normalized.match(/\s/g) ?? []).length;
  const other = Math.max(0, normalized.length - cjk - whitespace);
  return Math.max(1, Math.ceil(cjk * 0.8 + other / 4));
}

export function tokenNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }
  return undefined;
}

export function usageValue(usage: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = tokenNumber(usage[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function nestedUsageValue(usage: Record<string, unknown>, objectKeys: string[], valueKeys: string[]): number | undefined {
  for (const objectKey of objectKeys) {
    const nested = usage[objectKey];
    if (!isRecord(nested)) continue;
    const value = usageValue(nested, valueKeys);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function extractTokenUsage(json: unknown, fallbackInput: number, fallbackOutputText: string): TokenUsage {
  const usage = isRecord(json) && isRecord(json.usage) ? json.usage : {};
  const input = usageValue(usage, ["input_tokens", "prompt_tokens", "inputTokens", "promptTokens"]);
  const output = usageValue(usage, ["output_tokens", "completion_tokens", "outputTokens", "completionTokens"]);
  const total = usageValue(usage, ["total_tokens", "totalTokens"]);
  const cacheRead = usageValue(usage, [
    "cache_read_input_tokens", "cache_read_tokens", "prompt_cache_hit_tokens", "cached_tokens", "cacheReadTokens"
  ]) ?? nestedUsageValue(usage, ["prompt_tokens_details", "input_tokens_details", "details"], ["cached_tokens", "cache_read_tokens", "cacheReadTokens"]);
  const cacheWrite = usageValue(usage, [
    "cache_creation_input_tokens", "cache_write_tokens", "prompt_cache_write_tokens", "cacheWriteTokens"
  ]) ?? nestedUsageValue(usage, ["input_tokens_details", "details"], ["cache_creation_input_tokens", "cache_write_tokens", "cacheWriteTokens"]);
  const reasoning = usageValue(usage, ["reasoning_tokens", "reasoningTokens"])
    ?? nestedUsageValue(usage, ["output_tokens_details", "completion_tokens_details", "details"], ["reasoning_tokens", "reasoningTokens"]);
  const hasRealUsage = input !== undefined || output !== undefined || total !== undefined;
  const estimatedOutput = estimateTextTokens(fallbackOutputText);

  if (!hasRealUsage) {
    return {
      inputTokens: fallbackInput,
      outputTokens: estimatedOutput,
      totalTokens: fallbackInput + estimatedOutput,
      cacheReadTokens: cacheRead ?? 0,
      cacheWriteTokens: cacheWrite ?? 0,
      reasoningTokens: reasoning ?? 0,
      estimated: true
    };
  }

  const inputTokens = input ?? (total !== undefined && output !== undefined ? Math.max(0, total - output) : fallbackInput);
  const outputTokens = output ?? (total !== undefined ? Math.max(0, total - inputTokens) : estimatedOutput);
  return {
    inputTokens,
    outputTokens,
    totalTokens: total ?? inputTokens + outputTokens,
    cacheReadTokens: cacheRead ?? 0,
    cacheWriteTokens: cacheWrite ?? 0,
    reasoningTokens: reasoning ?? 0,
    estimated: input === undefined || output === undefined || total === undefined
  };
}

export function nativeCancipActionToolForProfile(profile: Pick<ApiProfile, "model">, mode: Exclude<ApiMode, "auto">): Record<string, unknown> | null {
  if (!profileUsesNativeCancipActionProtocol(profile)) return null;
  const description = [
    "Execute exactly one Cancip action when Obsidian state or a mutation is required; otherwise answer normally.",
    "Never invent command names.",
    "Common routes: obsidian.ui.buttons {scope,query,includeSameLabel}; obsidian.ui.buttonRules {selector,scope}; obsidian.ui.applyButtonRules {rules|reset}; cancip.findTarget {query,targetKind,includeContent}; cancip.openFile {path}; cancip.searchVault {query}; cancip.tools.index {query}; cancip.tools.help {command}.",
    "If the exact route is unknown, call cancip.tools.index first and wait for its result."
  ].join(" ");
  const parameters = {
    type: "object",
    additionalProperties: true,
    properties: {
      type: { type: "string", description: "Cancip action type; use command for command-bus routes." },
      command: { type: "string", description: "Exact Cancip command name for command actions." },
      args: { type: "object", additionalProperties: true, description: "Arguments for the exact command." },
      path: { type: "string", description: "Vault-relative path for direct file actions." },
      content: { type: "string", description: "Content for direct write or append actions." },
      find: { type: "string", description: "Exact text for a direct patch action." },
      replace: { type: "string", description: "Replacement text for a direct patch action." }
    },
    required: ["type"]
  };
  if (mode === "responses") {
    return { type: "function", name: "cancip_action", description, parameters };
  }
  return {
    type: "function",
    function: { name: "cancip_action", description, parameters }
  };
}

export function profileUsesNativeCancipActionProtocol(profile: Pick<ApiProfile, "model">): boolean {
  const model = profile.model.trim().toLowerCase();
  return /(?:^|\/)gpt-5\.6-(?:sol|solar|terra|luna)(?:$|[-:@/])/.test(model);
}

export function extractResponseText(json: unknown): string {
  if (!isRecord(json)) return extractTextFragment(json);

  const outputText = extractTextFragment(json.output_text);
  if (outputText) return outputText;

  const choicesText = extractChoicesText(json.choices);
  if (choicesText) return choicesText;

  const responsesText = extractResponsesOutputText(json.output);
  if (responsesText) return responsesText;

  const directText = extractTextFragment(json.text);
  if (directText) return directText;

  return extractTextFragment(json.content);
}

export function extractResponseId(json: unknown): string {
  if (!isRecord(json)) return "";
  return typeof json.id === "string" ? json.id : "";
}

export function mergeModelContinuation(base: string, continuation: string): string {
  const left = base.trimEnd();
  const right = continuation.trimStart();
  if (!left) return right;
  if (!right) return left;
  if (right.startsWith(left)) return right;
  if (left.endsWith(right)) return left;
  const maxOverlap = Math.min(600, left.length, right.length);
  for (let size = maxOverlap; size >= 12; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) return `${left}${right.slice(size)}`;
  }
  const separator = /\s$/.test(base) || /^\s/.test(continuation) ? "" : "\n";
  return `${left}${separator}${right}`;
}

export function extractNonJsonText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "";
  return trimmed;
}

export function describeResponseShape(json: unknown): string {
  if (!isRecord(json)) return `type=${typeof json}`;
  const fields: string[] = [];
  if (typeof json.status === "string") fields.push(`status=${json.status}`);
  if (typeof json.model === "string") fields.push(`model=${json.model}`);
  if (Array.isArray(json.output)) fields.push(`output=${json.output.length}`);
  if (Array.isArray(json.choices)) fields.push(`choices=${json.choices.length}`);
  if (typeof json.output_text === "string") fields.push(`output_text=${json.output_text.length}`);
  if (isRecord(json.usage)) fields.push("usage=present");
  const keys = Object.keys(json).slice(0, 8).join(",");
  fields.push(`keys=${keys || "none"}`);
  return fields.join(", ");
}

export async function readClipboardText(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) return await withTimeout(navigator.clipboard.readText(), 1500, "Clipboard read timed out");
  } catch {
    // Some mobile WebViews require a user paste gesture; callers provide a manual paste modal.
  }
  return "";
}

export function copyTextWithHiddenTextarea(text: string): boolean {
  void text;
  return false;
}

export function extractCompatibleStreamDelta(json: unknown): string {
  if (!isRecord(json) || !Array.isArray(json.choices)) return "";
  return json.choices
    .map((choice) => {
      if (!isRecord(choice)) return "";
      const delta = isRecord(choice.delta) ? choice.delta : {};
      if (isReasoningResponseFragment(delta)) return "";
      return (
        extractTextFragment(delta.content) ||
        extractTextFragment(delta.text) ||
        extractTextFragment(choice.text) ||
        ""
      );
    })
    .filter(Boolean)
    .join("");
}

export function extractResponsesStreamDelta(json: unknown): string {
  if (!isRecord(json)) return "";
  const type = typeof json.type === "string" ? json.type.toLowerCase() : "";
  if (/(?:reasoning|thinking|thought|analysis)/i.test(type)) return "";
  if (type && !/(?:output_text\.delta|message\.delta|content\.delta|text\.delta|delta)/i.test(type)) return "";
  return (
    extractTextFragment(json.delta) ||
    extractTextFragment(json.text) ||
    extractTextFragment(json.output_text) ||
    extractCompatibleStreamDelta(json)
  );
}

export function extractChoicesText(choices: unknown): string {
  if (!Array.isArray(choices)) return "";
  return choices
    .map((choice) => {
      if (!isRecord(choice)) return extractTextFragment(choice);
      if (isRecord(choice.message)) {
        return extractTextFragment(choice.message.content) || extractTextFragment(choice.message.text);
      }
      return extractTextFragment(choice.text) || extractTextFragment(choice.content) || extractTextFragment(choice.delta);
    })
    .filter(Boolean)
    .join("\n");
}

export function extractResponsesOutputText(output: unknown): string {
  if (!Array.isArray(output)) return extractTextFragment(output);
  return output
    .map((item) => {
      if (!isRecord(item)) return extractTextFragment(item);
      return (
        extractTextFragment(item.content) ||
        extractTextFragment(item.text) ||
        extractTextFragment(item.message)
      );
    })
    .filter(Boolean)
    .join("\n");
}

export function extractModelReasoningSummary(value: unknown): string {
  const summaries: string[] = [];
  const seen = new Set<unknown>();
  const collect = (entry: unknown, reasoningScope = false, depth = 0): void => {
    if (depth > 10 || entry === null || entry === undefined || seen.has(entry)) return;
    if (typeof entry === "string") {
      if (reasoningScope && entry.trim()) summaries.push(entry.trim());
      return;
    }
    if (Array.isArray(entry)) {
      seen.add(entry);
      for (const item of entry) collect(item, reasoningScope, depth + 1);
      return;
    }
    if (!isRecord(entry)) return;
    seen.add(entry);
    const marker = [entry.type, entry.kind, entry.name, entry.category]
      .filter((item): item is string => typeof item === "string")
      .join(" ")
      .toLowerCase();
    const explicitSummary = /reasoning|thinking|thought|analysis/.test(marker)
      && /summary/.test(marker);
    for (const [key, child] of Object.entries(entry)) {
      const normalized = key.toLowerCase();
      const summaryKey = /^(?:reasoning[_-]?summary|thinking[_-]?summary|summary_text)$/.test(normalized);
      const nestedSummary = normalized === "summary" && (/reasoning|thinking|thought|analysis/.test(marker) || reasoningScope);
      const summaryTextChild = reasoningScope && /^(?:text|content|value|parts|delta|output_text)$/.test(normalized);
      collect(child, summaryKey || nestedSummary || explicitSummary || summaryTextChild, depth + 1);
    }
  };
  collect(value);
  return uniqueStrings(summaries).join("\n\n");
}

export function extractTextFragment(value: unknown, depth = 0): string {
  if (depth > 8 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => extractTextFragment(item, depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  if (!isRecord(value)) return "";
  if (isReasoningResponseFragment(value)) return "";

  return (
    extractTextFragment(value.text, depth + 1) ||
    extractTextFragment(value.output_text, depth + 1) ||
    extractTextFragment(value.content, depth + 1) ||
    extractTextFragment(value.parts, depth + 1) ||
    extractTextFragment(value.message, depth + 1) ||
    extractTextFragment(value.delta, depth + 1) ||
    extractTextFragment(value.value, depth + 1)
  );
}

export function isReasoningResponseFragment(value: Record<string, unknown>): boolean {
  const marker = ["type", "kind", "name", "category"]
    .map((key) => {
      const raw = value[key];
      return typeof raw === "string" ? raw.toLowerCase() : "";
    })
    .filter(Boolean)
    .join(" ");
  if (!marker) return false;
  if (/(?:reasoning|thinking|thought|analysis|chain[_\s-]?of[_\s-]?thought|\bcot\b)/i.test(marker)) {
    return !/(?:output[_\s-]?text|message|assistant|final|answer)/i.test(marker);
  }
  return false;
}

export function ensureDisplayText(value: unknown): string {
  const text = extractTextFragment(value);
  if (text) return text;
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value, null, 2);
    if (json) return json;
  } catch {
    // Fall through to String().
  }
  return String(value ?? "");
}

export function isMandatoryReasoningError(reason: string): boolean {
  return /reasoning\s+is\s+mandatory|cannot\s+be\s+disabled/i.test(reason || "");
}

export function reasoningMandatoryStorageKey(key: string): string {
  return `cancip-reasoning-mandatory:${stableTextHash(key).slice(0, 20)}`;
}

export function isStreamingUnavailableError(reason: string): boolean {
  return /(?:failed to fetch|streaming fetch unavailable|stream response body unavailable|networkerror|load failed|http\s+(?:401|403|405|406|415)\b)/i.test(reason);
}

export function modelRequestBodyText(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

export function safeJsonishDisplay(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  const seen = new WeakSet<object>();
  const win = activeDocument.defaultView;
  try {
    const json = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "function") return `[Function ${item.name || "anonymous"}]`;
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
        if (item instanceof TFile) return { type: "TFile", path: item.path, basename: item.basename, extension: item.extension };
        if (item instanceof TFolder) return { type: "TFolder", path: item.path, children: item.children.length };
        if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
        const element = item as HTMLElement;
        if (win && element.instanceOf(win.HTMLElement)) {
          return {
            type: "HTMLElement",
            tag: element.tagName.toLowerCase(),
            text: trimContext((element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(), 160),
            classes: String(element.className || "").trim()
          };
        }
      }
      return item;
    }, 2);
    if (json) return json;
  } catch {
    // Fall through to display text.
  }
  return ensureDisplayText(value);
}

