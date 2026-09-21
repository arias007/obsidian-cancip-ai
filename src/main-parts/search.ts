/*
 * Cancip search — extracted from src/main.ts by scripts/extract-main-modules.mjs.
 * Declarations here were proven to reference nothing left behind in main.ts, so this
 * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.
 */
import { type LocalAgentProvider } from "../agentBridge";
import { type ReviewGateInternalCategory, type ReviewGateManifestItem, type ReviewGateStructureChange, type ReviewGateStructureKind } from "../reviewGate";
import { type DataAdapter, normalizePath } from "obsidian";
import { clampInt, decodeXmlEntities, escapeRegExp, normalizeExtractedText } from "./model-api";
import { makeExcerpt, trimContext } from "./office";
import { AcceptanceCapabilityClass, AcceptanceResultQuality, AcceptanceResultStatus, AutomationTask, CancipAction, CancipSkill, CapabilityRoute, ContextSource, ExperienceSkillRecipe, InstalledPluginInfo, LineDeltaSummary, MentionKind, MentionTarget, NewsBriefItem, NewsBriefPeriod, NewsBriefSource, ObsidianCommandEntry, ObsidianCommandSnapshot, PluginCompatibilityActionDefinition, PluginCompatibilityRisk, ReviewDiffBlock, ReviewDiffBlockDecisionState, ReviewDiffHunk, ReviewDiffLine, ReviewGateExpectedState, ReviewGateExpectedStateMode, ReviewGateLightItem, ReviewGateTerminalDecision, SearchHit, SearchQueryIntent, SearchQueryKindConstraint, SearchResultCategory, SessionCleanupSchedule, SessionRetentionCandidate, ToolFeedbackEvent, TurnModelUsage, UniversalSearchDocument, UniversalSearchDocumentKind, UniversalSearchIndex, VaultCurationNewFileState, isSecretBearingVaultPath, localDateKey } from "./types-1";
import { normalizeActionPath } from "./ui";
import { capabilityPromptMentionsSkillOrExperienceSurface, classifyPromptIntent, isPathInFolder, isRecord, isTrivialChatPrompt, markdownFenceLines, pluginCapabilityTokens, promptNeedsExperienceSkillRoute, promptNeedsMemorySkillRoute, promptNeedsObsidianSkillRoute, promptNeedsSkillExperienceRoute, redactSensitiveText, sanitizePersonalizationText, stableCacheKey } from "./vault-2";

export function cancipCurationTextChangeMeaningful(before: string, after: string): boolean {
  if (before === after) return false;
  const normalizeStructural = (value: string): string => value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line
      .trim()
      .replace(/\s+/g, " ")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/[。！？!?.,，、；;：:]+$/g, "")
      .trim())
    .filter(Boolean)
    .join("\n");
  const left = normalizeStructural(before);
  const right = normalizeStructural(after);
  if (left === right) return false;
  const delta = Math.abs(right.length - left.length);
  if (delta >= 24) return true;
  const beforeLinks = (before.match(/\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)/g) ?? []).sort().join("\n");
  const afterLinks = (after.match(/\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)/g) ?? []).sort().join("\n");
  if (beforeLinks !== afterLinks) return true;
  const beforeTags = (before.match(/(^|\s)#[\p{L}\p{N}_/-]+/gu) ?? []).sort().join(" ");
  const afterTags = (after.match(/(^|\s)#[\p{L}\p{N}_/-]+/gu) ?? []).sort().join(" ");
  if (beforeTags !== afterTags) return true;
  return false;
}

export function normalizeVaultCurationNewFileState(raw: unknown): VaultCurationNewFileState | null {
  if (!isRecord(raw) || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) || !isRecord(raw.known) || !Array.isArray(raw.pending)) return null;
  const known: Record<string, number> = {};
  for (const [rawPath, rawCtime] of Object.entries(raw.known)) {
    const path = normalizePath(rawPath.replace(/\\/g, "/"));
    if (!path || typeof rawCtime !== "number" || !Number.isFinite(rawCtime)) continue;
    known[path] = rawCtime;
  }
  return {
    schemaVersion: raw.schemaVersion,
    initializedAt: typeof raw.initializedAt === "string" ? raw.initializedAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    known,
    pending: uniqueStrings(raw.pending.filter((path): path is string => typeof path === "string").map((path) => normalizePath(path.replace(/\\/g, "/"))).filter(Boolean))
  };
}

export function vaultCurationCandidatePathsFromPack(pack: string): string[] {
  const match = pack.match(/^- candidatePathsJson:\s*(\[[^\r\n]*\])\s*$/m);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueStrings(parsed.filter((path): path is string => typeof path === "string").map((path) => normalizePath(path.replace(/\\/g, "/"))).filter(Boolean));
  } catch {
    return [];
  }
}

export function vaultCurationScannedPathsFromPack(pack: string): string[] {
  const match = pack.match(/^- scannedPathsJson:\s*(\[[^\r\n]*\])\s*$/m);
  if (!match) return vaultCurationCandidatePathsFromPack(pack);
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueStrings(parsed.filter((path): path is string => typeof path === "string").map((path) => normalizePath(path.replace(/\\/g, "/"))).filter(Boolean));
  } catch {
    return [];
  }
}

export function vaultCurationSkippedPathsFromResult(content: string, candidatePaths: string[]): string[] {
  const candidates = new Map(candidatePaths.map((path) => {
    const normalized = normalizePath(path.replace(/\\/g, "/"));
    return [normalized.toLocaleLowerCase(), normalized] as const;
  }));
  const skipped: string[] = [];
  for (const match of content.matchAll(/<!--\s*cancip-curation-skip:\s*([^\r\n<>]+?)\s*-->/gi)) {
    const normalized = normalizePath((match[1] ?? "").trim().replace(/\\/g, "/"));
    const candidate = candidates.get(normalized.toLocaleLowerCase());
    if (candidate) skipped.push(candidate);
  }
  if (!skipped.length && candidatePaths.length === 1) {
    const candidate = normalizePath(candidatePaths[0].replace(/\\/g, "/"));
    if (content.includes(candidate) && /(?:跳过|无需(?:改动|处理|整理)|不需要(?:改动|处理|整理)|未修改|没有文件改动|no changes? needed|no file changes?|skipped)/i.test(content)) {
      skipped.push(candidate);
    }
  }
  return uniqueStrings(skipped);
}

export function isVaultDailyInboxLikePath(path: string): boolean {
  return /(^|\/)(Inbox|inbox|收件箱|待整理|临时|tmp|temp|未整理)(\/|$)/i.test(path);
}

export function isVaultDailyVagueFileName(basename: string): boolean {
  const name = basename.trim();
  if (!name) return false;
  if (/^(untitled|新建|未命名|tmp|temp|draft|草稿)([\s._-]?\d*)?$/i.test(name)) return true;
  if (/^\d{4}[-_.]?\d{1,2}[-_.]?\d{1,2}([-_.]\d+)?$/.test(name)) return true;
  if (/^\d{8,14}$/.test(name)) return true;
  if (/^[a-f0-9]{12,}$/i.test(name)) return true;
  return name.length > 60;
}

export function normalizeVaultDailyBasename(basename: string): string {
  return basename
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]?(copy|副本|备份|backup|bak|\(\d+\)|（\d+）)$/gi, "")
    .replace(/\d{4}[-_.]\d{1,2}[-_.]\d{1,2}$/g, "")
    .trim();
}

export function parseNewsBriefPeriod(value: unknown): NewsBriefPeriod {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return text === "evening" || text === "pm" || text === "night" || text === "晚间" || text === "晚报" ? "evening" : "morning";
}

export function parseRssItems(xml: string, source: NewsBriefSource, limit: number): NewsBriefItem[] {
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const entryBlocks = itemBlocks.length ? [] : xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;
  return blocks
    .map((block) => parseRssItemBlock(block, source))
    .filter((item): item is NewsBriefItem => item !== null)
    .slice(0, limit);
}

export function parseHtmlNewsItems(html: string, source: NewsBriefSource, limit: number): NewsBriefItem[] {
  const seen = new Set<string>();
  const items: NewsBriefItem[] = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,500}?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const title = decodeXmlText(match[2] ?? "");
    if (title.length < 8 || seen.has(title)) continue;
    seen.add(title);
    const rawLink = decodeXmlText(match[1] ?? "");
    let link = rawLink;
    try {
      link = rawLink ? new URL(rawLink, source.url).toString() : source.url;
    } catch {
      link = rawLink || source.url;
    }
    items.push({
      source: source.name,
      category: source.category,
      title,
      link,
      published: "",
      summary: title
    });
    if (items.length >= limit) break;
  }
  if (items.length) return items;
  const pageTitle = decodeXmlText(firstXmlTag(html, "title"));
  return pageTitle
    ? [{
        source: source.name,
        category: source.category,
        title: pageTitle,
        link: source.url,
        published: "",
        summary: decodeXmlText(html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ?? pageTitle)
      }]
    : [];
}

export function parseDuckDuckGoResults(html: string, limit: number): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set<string>();
  const blockRegex = /<div\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bresult\b|<\/body>|$)/gi;
  for (const blockMatch of html.matchAll(blockRegex)) {
    const block = blockMatch[1] ?? "";
    const anchor = block.match(/<a\b[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const url = normalizeSearchResultUrl(decodeXmlEntities(anchor[1] ?? ""));
    const title = htmlToReadableText(anchor[2] ?? "");
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const snippetHtml = block.match(/<a\b[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1]
      ?? block.match(/<div\b[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
      ?? "";
    results.push({ title, url, snippet: htmlToReadableText(snippetHtml) });
    if (results.length >= limit) break;
  }
  if (results.length) return results;
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,500}?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const url = normalizeSearchResultUrl(decodeXmlEntities(match[1] ?? ""));
    const title = htmlToReadableText(match[2] ?? "");
    if (!/^https?:\/\//i.test(url) || title.length < 3 || seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, snippet: "" });
    if (results.length >= limit) break;
  }
  return results;
}

export function normalizeSearchResultUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, "https://duckduckgo.com/");
    const redirected = url.searchParams.get("uddg") || url.searchParams.get("u");
    if (redirected && /^https?:\/\//i.test(redirected)) return redirected;
    if (/^https?:\/\//i.test(url.toString())) return url.toString();
  } catch {
    // Fall through.
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

export function extractHtmlTitle(html: string): string {
  return htmlToReadableText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

export function htmlToReadableText(html: string): string {
  return normalizeExtractedText(decodeXmlEntities(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(?:p|div|section|article|header|footer|main|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")));
}

export function parseRssItemBlock(block: string, source: NewsBriefSource): NewsBriefItem | null {
  const title = decodeXmlText(firstXmlTag(block, "title"));
  const link = decodeXmlText(firstXmlTag(block, "link")) || decodeXmlText(firstXmlAttribute(block, "link", "href"));
  const published = decodeXmlText(firstXmlTag(block, "pubDate") || firstXmlTag(block, "published") || firstXmlTag(block, "updated"));
  const summary = decodeXmlText(firstXmlTag(block, "description") || firstXmlTag(block, "summary") || firstXmlTag(block, "content:encoded"));
  if (!title && !summary) return null;
  return {
    source: source.name,
    category: source.category,
    title: title || trimContext(summary, 120),
    link,
    published,
    summary: trimContext(summary.replace(/\s+/g, " "), 360)
  };
}

export function firstXmlTag(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match?.[1] ?? "";
}

export function firstXmlAttribute(block: string, tag: string, attribute: string): string {
  const tagMatch = block.match(new RegExp(`<${tag}\\b[^>]*>`, "i"));
  if (!tagMatch) return "";
  const attrMatch = tagMatch[0].match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"));
  return attrMatch?.[1] ?? "";
}

export function decodeXmlText(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCharCode(value) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function formatNewsBriefSourcePack(items: NewsBriefItem[], failures: string[]): string {
  const lines = [
    `# 实时来源包`,
    `- fetchedAt: ${new Date().toISOString()}`,
    `- itemCount: ${items.length}`,
    ""
  ];
  for (const [index, item] of items.entries()) {
    lines.push(
      `## ${index + 1}. [${item.category}] ${item.title}`,
      `- source: ${item.source}`,
      `- published: ${item.published || "unknown"}`,
      `- link: ${item.link || "unknown"}`,
      `- summary: ${item.summary || "(no summary)"}`,
      ""
    );
  }
  if (failures.length) {
    lines.push("## 抓取失败或无有效条目的来源", ...failures.map((failure) => `- ${failure}`), "");
  }
  return trimContext(lines.join("\n"), 18000);
}

export function isAutomationDue(task: AutomationTask, now: Date): boolean {
  if (!task.enabled || task.schedule === "manual") return false;
  const lastRun = task.lastRunAt ? new Date(task.lastRunAt) : null;
  const failedRetryDue = task.lastStatus === "failed"
    && Boolean(lastRun && !Number.isNaN(lastRun.getTime()))
    && now.getTime() - (lastRun?.getTime() ?? now.getTime()) >= 20 * 60 * 1000;
  if (task.schedule === "hourly") {
    if (!lastRun || Number.isNaN(lastRun.getTime())) return true;
    return failedRetryDue || now.getTime() - lastRun.getTime() >= task.intervalMinutes * 60 * 1000;
  }
  const dueMinutes = task.hour * 60 + task.minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < dueMinutes) return false;
  if (!lastRun || Number.isNaN(lastRun.getTime())) return true;
  return failedRetryDue || localDateKey(lastRun) !== localDateKey(now);
}

export function automationCommandNeedsModel(command: string): boolean {
  return command.trim() === "cancip.newsBrief" || command.trim() === "cancip.vaultDailyReport";
}

export function formatAutomationSchedule(task: AutomationTask): string {
  if (task.schedule === "hourly") return `hourly/${task.intervalMinutes}m`;
  if (task.schedule === "daily") return `daily ${String(task.hour).padStart(2, "0")}:${String(task.minute).padStart(2, "0")}`;
  return task.schedule;
}

export function automationDedicatedSessionId(taskId: string): string {
  const slug = taskId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `automation-${slug || stableTextHash(taskId).slice(0, 12)}`;
}

export function automationWithDedicatedSession(task: AutomationTask, force = false): AutomationTask {
  const existing = task.sessionMode === "session" ? task.sessionId?.trim() ?? "" : "";
  if (!force && existing) {
    return existing === task.sessionId ? task : { ...task, sessionId: existing };
  }
  const dedicatedId = automationDedicatedSessionId(task.id);
  if (task.sessionMode === "session" && task.sessionId?.trim() === dedicatedId) return task;
  return {
    ...task,
    sessionMode: "session",
    sessionId: dedicatedId
  };
}

export function shouldCreateMissingAutomationSession(task: AutomationTask, sessionId: string): boolean {
  if (!sessionId) return false;
  if (sessionId === automationDedicatedSessionId(task.id)) return true;
  return sessionId.startsWith("automation-");
}

export function localVersionCommitId(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "Z").replace(/[:.]/g, "-");
}

export function stringArg(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function bridgeStringArg(value: unknown, maxChars: number): string {
  return trimContext(stringArg(value), maxChars);
}

export function optionalPositiveInt(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function isLocalAgentProvider(value: unknown): value is LocalAgentProvider {
  return value === "auto" || value === "codex" || value === "claude";
}

export function isLocalModelApiUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const match = host.match(/^172\.(\d{1,3})\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  } catch {
    return false;
  }
}

export function normalizeAgentBridgeToken(value: unknown): string {
  const token = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{32,200}$/.test(token) ? token : "";
}

export function sanitizeLocalAgentModel(value: unknown): string {
  const model = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._:/@+-]{0,200}$/.test(model) ? model : "";
}

export function snapshotFileName(path: string): string {
  const name = path.split("/").pop() || "file";
  const safeName = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
  return `${stableTextHash(path)}-${safeName}.txt`;
}

export function stableTextHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeSessionCleanupSchedule(value: unknown): SessionCleanupSchedule {
  return value === "never" || value === "daily" || value === "monthly" ? value : "weekly";
}

export function sessionCleanupScheduleIntervalMs(schedule: SessionCleanupSchedule): number {
  if (schedule === "daily") return 24 * 60 * 60 * 1000;
  if (schedule === "monthly") return 30 * 24 * 60 * 60 * 1000;
  if (schedule === "weekly") return 7 * 24 * 60 * 60 * 1000;
  return Number.POSITIVE_INFINITY;
}

export function sessionRetentionCleanLine(value: unknown, maxChars = 320): string {
  if (typeof value !== "string") return "";
  return trimContext(redactSensitiveText(value), maxChars)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sessionRetentionMessageLines(content: unknown): string[] {
  if (typeof content !== "string") return [];
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .split(/[\r\n]+|[。！？!?]+\s*/)
    .map((line) => sessionRetentionCleanLine(line))
    .filter((line) => line.length >= 4);
}

export function distillSessionRetentionMemory(candidate: SessionRetentionCandidate): string[] {
  if (candidate.kind === "session") {
    try {
      const snapshot = JSON.parse(candidate.raw) as unknown;
      if (!isRecord(snapshot)) return [];
      const messages = Array.isArray(snapshot.messages) ? snapshot.messages.filter(isRecord) : [];
      const userLines = messages
        .filter((message) => message.role === "user")
        .flatMap((message) => sessionRetentionMessageLines(message.content));
      const valuableUserLines = userLines.filter((line) => /记住|以后|默认|不要|不需要|必须|应该|改成|只要|固定|偏好|我需要|remember|prefer|default|must|should|never|always/i.test(line));
      const lastUserLine = [...userLines].reverse().find(Boolean) ?? "";
      const assistantLines = messages
        .filter((message) => message.role === "assistant")
        .flatMap((message) => sessionRetentionMessageLines(message.content));
      const outcomeLines = assistantLines.filter((line) => /已|完成|修复|实现|成功|结果|保存|安装|发布|优化|fixed|completed|implemented|saved|installed|released/i.test(line));
      return uniqueStrings([
        ...valuableUserLines.slice(0, 6).map((line) => `用户决定：${line}`),
        ...(lastUserLine && !valuableUserLines.includes(lastUserLine) ? [`最近任务：${lastUserLine}`] : []),
        ...outcomeLines.slice(-2).map((line) => `结果：${line}`)
      ]).slice(0, 10);
    } catch {
      return [];
    }
  }
  if (candidate.kind === "experience" || candidate.kind === "memory") {
    return uniqueStrings(candidate.raw
      .split(/\r?\n/)
      .map((line) => sessionRetentionCleanLine(line.replace(/^#{1,6}\s+|^[-*+]\s+/, ""), 360))
      .filter((line) => line.length >= 8 && !/^Cancip (Archived )?Experience$/i.test(line)))
      .slice(0, 12)
      .map((line) => `经验：${line}`);
  }
  return [];
}

export function sessionRetentionMemoryMarker(recordKey: string): string {
  return `<!-- cancip-session-retention:${stableTextHash(recordKey)} -->`;
}

export function sessionRetentionMemoryBlock(candidate: SessionRetentionCandidate, recordKey: string, lines: string[], extractedAt: string): string {
  if (!lines.length) return "";
  const title = sessionRetentionCleanLine(candidate.title || reviewFileName(candidate.path), 160) || "会话记忆";
  return [
    sessionRetentionMemoryMarker(recordKey),
    `## ${extractedAt.slice(0, 10)} · ${title}`,
    ...lines.map((line) => `- ${line}`)
  ].join("\n");
}

export function archiveMonthFromIso(value: string): string {
  const time = Date.parse(value);
  const date = Number.isFinite(time) ? new Date(time) : new Date();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function filterUniversalSearchIndexByKinds(index: UniversalSearchIndex, kinds: readonly UniversalSearchDocumentKind[]): UniversalSearchIndex {
  const allowed = new Set(kinds);
  return {
    ...index,
    complete: index.complete && index.documents.every((document) => allowed.has(document.kind)),
    documents: index.documents.filter((document) => allowed.has(document.kind))
  };
}

export function universalSearchIndexWriteKey(index: UniversalSearchIndex): string {
  return stableCacheKey({
    schemaVersion: index.schemaVersion,
    complete: index.complete,
    cursor: index.cursor,
    inventoryHash: index.inventoryHash,
    documents: index.documents.map((document) => ({
      path: document.path,
      title: document.title,
      kind: document.kind,
      mtime: document.mtime,
      size: document.size,
      indexedAt: document.indexedAt,
      textChars: document.textChars,
      bloom: document.bloom,
      signals: document.signals,
      ocrIndexed: document.ocrIndexed === true
    }))
  });
}

export function shouldSearchConfigsForQuery(query: string): boolean {
  return /(?:cancip|obsidian|plugin|plugins?|setting|settings?|config|command|api|automation|skill|memory|index|css|json|配置|设置|插件|命令|自动化|按钮|审核|模型|密钥|接口|能力|记忆|索引|样式|源码)/i.test(query);
}

export function shouldSearchAttachmentsForQuery(query: string): boolean {
  return /(?:pdf|docx|xlsx|pptx|office|image|images?|picture|photo|attachment|file|文件|附件|图片|照片|表格|文档|幻灯片|课件|扫描|预览|转换|导出|搜索全文)/i.test(query);
}

export function parseSearchQueryIntent(query: string): SearchQueryIntent {
  const definitions: Array<{ kind: SearchQueryKindConstraint; test: RegExp; strip: RegExp }> = [
    { kind: "image", test: /(?:图片|图像|照片|相片|截图|images?|pictures?|photos?|\.?(?:png|jpe?g|webp|gif|bmp|svg|avif)\b)/i, strip: /(?:图片|图像|照片|相片|截图|images?|pictures?|photos?|\.?(?:png|jpe?g|webp|gif|bmp|svg|avif)\b)/gi },
    { kind: "pdf", test: /(?:PDF|便携式文档)/i, strip: /(?:PDF|便携式文档)/gi },
    { kind: "note", test: /(?:笔记|Markdown|\.md\b)/i, strip: /(?:笔记|Markdown|\.md\b)/gi },
    { kind: "office", test: /(?:Office|Word|Excel|PowerPoint|DOCX?|XLSX?|PPTX?|表格文件|幻灯片|课件)/i, strip: /(?:Office|Word|Excel|PowerPoint|DOCX?|XLSX?|PPTX?|表格文件|幻灯片|课件)/gi },
    { kind: "archive", test: /(?:压缩包|归档包|ZIP|RAR|7Z|TAR)/i, strip: /(?:压缩包|归档包|ZIP|RAR|7Z|TAR)/gi },
    { kind: "audio", test: /(?:音频|录音|语音|音乐|audio|recording|\.?(?:mp3|wav|m4a|flac|ogg)\b)/i, strip: /(?:音频|录音|语音|音乐|audio|recording|\.?(?:mp3|wav|m4a|flac|ogg)\b)/gi },
    { kind: "video", test: /(?:视频|录像|影片|video|movie|\.?(?:mp4|mov|mkv|webm|avi)\b)/i, strip: /(?:视频|录像|影片|video|movie|\.?(?:mp4|mov|mkv|webm|avi)\b)/gi }
  ];
  const normalized = query.normalize("NFKC").trim();
  const requestedKinds: SearchQueryKindConstraint[] = [];
  let subject = normalized;
  for (const definition of definitions) {
    if (!definition.test.test(normalized)) continue;
    requestedKinds.push(definition.kind);
    subject = subject.replace(definition.strip, " ");
  }
  subject = subject
    .replace(/\b(?:find|search|show|list|locate|related|relevant|about|vault|file|files)\b/gi, " ")
    .replace(/(?:请|帮我|给我|查找|查询|搜索|搜一下|找出|找到|找一下|显示|列出|打开|库内|仓库内|相关的?|有关的?|文件|内容)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const genericTerms = new Set(["相关", "有关", "内容", "文件", "搜索", "查询", "查找", "find", "search", "file", "files", "related"]);
  const subjectTerms = uniqueStrings([
    subject,
    ...tokenize(subject),
    ...universalSearchQueryTerms(subject)
  ]).filter((term) => Array.from(term).length >= 2 && !genericTerms.has(term.toLowerCase())).slice(0, 24);
  return {
    requestedKinds: [...new Set(requestedKinds)],
    subjectQuery: subject,
    subjectTerms
  };
}

export function searchHitMatchesRequestedKind(hit: SearchHit, intent: SearchQueryIntent): boolean {
  if (!intent.requestedKinds.length) return true;
  const path = hit.path.normalize("NFKC").toLowerCase().replace(/[?#].*$/, "");
  return intent.requestedKinds.some((kind) => {
    if (kind === "image") return hit.kind === "image" || /\.(?:png|jpe?g|webp|gif|bmp|svg|avif)$/.test(path);
    if (kind === "pdf") return hit.kind === "pdf" || /\.pdf$/.test(path);
    if (kind === "note") return hit.kind === "note" || /\.(?:md|markdown)$/.test(path);
    if (kind === "office") return hit.kind === "office" || /\.(?:docx?|xlsx?|pptx?)$/.test(path);
    if (kind === "archive") return hit.kind === "archive" || /\.(?:zip|rar|7z|tar|gz|tgz)$/.test(path);
    if (kind === "audio") return /\.(?:mp3|wav|m4a|flac|ogg|aac|opus)$/.test(path);
    return /\.(?:mp4|mov|mkv|webm|avi|m4v)$/.test(path);
  });
}

export function searchIntentTextTier(intent: SearchQueryIntent, hit: SearchHit): number {
  if (!intent.subjectTerms.length) return 0;
  const titlePath = `${hit.title}\n${hit.path}`.normalize("NFKC").toLowerCase();
  const excerpt = hit.excerpt.normalize("NFKC").toLowerCase();
  const phrase = intent.subjectQuery.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const compactTitlePath = titlePath.replace(/\s+/g, "");
  const compactExcerpt = excerpt.replace(/\s+/g, "");
  if (phrase && compactTitlePath.includes(phrase)) return 0;
  const terms = intent.subjectTerms.map((term) => term.normalize("NFKC").toLowerCase());
  const threshold = Math.max(1, Math.ceil(terms.length * 0.6));
  if (terms.filter((term) => titlePath.includes(term)).length >= threshold) return 1;
  if (phrase && compactExcerpt.includes(phrase)) return 2;
  if (terms.filter((term) => excerpt.includes(term)).length >= threshold) return 3;
  return 6;
}

export function searchHitIntentRank(query: string, hit: SearchHit): number {
  const intent = parseSearchQueryIntent(query);
  if (!searchHitMatchesRequestedKind(hit, intent)) return 100;
  const textTier = searchIntentTextTier(intent, hit);
  if (textTier <= 3) return textTier * 10;
  if (hit.relation === "direct") return 40;
  if (hit.relation === "concept") return 50;
  if (hit.relation === "context") return 70;
  if (hit.relation === "style") return 80;
  if (hit.relation === "inspiration") return 90;
  return hit.route === "hard" ? 60 : 90;
}

export function rankSearchHitsForIntent(query: string, hits: SearchHit[]): SearchHit[] {
  return hits.map((hit, index) => ({ hit, index, rank: searchHitIntentRank(query, hit) }))
    .sort((left, right) => left.rank - right.rank
      || (left.hit.route === "hard" ? 0 : 1) - (right.hit.route === "hard" ? 0 : 1)
      || right.hit.score - left.hit.score
      || left.index - right.index)
    .map((item) => item.hit);
}

export function originalSearchQueryGroups(query: string): Array<Array<{ field: string; value: string; excluded: boolean }>> {
  return query.normalize("NFKC")
    .split(/\s+(?:OR|或)\s+/i)
    .map((group) => (group.match(/-?(?:[a-z]+:)?(?:"[^"]+"|'[^']+'|[^\s]+)/gi) ?? [])
      .map((raw) => {
        const excluded = raw.startsWith("-");
        const source = excluded ? raw.slice(1) : raw;
        const fieldMatch = source.match(/^(path|file|tag|content|line|section|block):/i);
        const field = fieldMatch?.[1]?.toLowerCase() ?? "all";
        const value = source.slice(fieldMatch?.[0]?.length ?? 0)
          .replace(/^(?:"|')|(?:"|')$/g, "")
          .normalize("NFKC")
          .toLowerCase()
          .trim();
        return { field, value, excluded };
      })
      .filter((clause) => clause.value && clause.value !== "and"));
}

export function searchHitOriginalContent(hit: SearchHit): string {
  return hit.excerpt
    .replace(/^\[[^\]\n]+\]\s*/u, "")
    .replace(/^(?:硬搜索|hard search)\s*·[^\n]*\n?/iu, "")
    .normalize("NFKC")
    .toLowerCase();
}

export function searchHitMatchesOriginalQuery(query: string, hit: SearchHit): boolean {
  const groups = originalSearchQueryGroups(query);
  if (!groups.length) return false;
  const path = normalizePath(hit.path).normalize("NFKC").toLowerCase();
  const title = hit.title.normalize("NFKC").toLowerCase();
  const content = searchHitOriginalContent(hit);
  const all = `${title}\n${path}\n${content}`;
  return groups.some((group) => {
    if (!group.length) return false;
    let positiveCount = 0;
    for (const clause of group) {
      const haystack = clause.field === "path"
        ? path
        : clause.field === "file"
          ? title
          : ["content", "line", "section", "block"].includes(clause.field)
            ? content
            : all;
      const needle = clause.field === "tag" ? clause.value.replace(/^#/, "") : clause.value;
      const matched = clause.field === "tag"
        ? haystack.includes(`#${needle}`) || haystack.includes(needle)
        : haystack.includes(needle);
      if (clause.excluded && matched) return false;
      if (!clause.excluded) {
        positiveCount += 1;
        if (!matched) return false;
      }
    }
    return positiveCount > 0;
  });
}

export function searchHitStrictKey(hit: SearchHit): string {
  return `${hit.kind}:${normalizePath(hit.path)}`;
}

export function partitionSearchHitsByOriginalQuery(
  query: string,
  hits: SearchHit[],
  keywordHitKeys?: ReadonlySet<string>
): { precise: SearchHit[]; more: SearchHit[] } {
  const precise: SearchHit[] = [];
  const more: SearchHit[] = [];
  for (const hit of hits) {
    const isKeywordHit = keywordHitKeys ? keywordHitKeys.has(searchHitStrictKey(hit)) : hit.route === "hard";
    (isKeywordHit && searchHitMatchesOriginalQuery(query, hit) ? precise : more).push(hit);
  }
  return { precise, more };
}

export function searchHitExplanationSignals(query: string, hit: SearchHit): { terms: string[]; locations: Array<"title" | "path" | "content"> } {
  const title = hit.title.normalize("NFKC").toLowerCase();
  const path = normalizePath(hit.path).normalize("NFKC").toLowerCase();
  const content = searchHitOriginalContent(hit);
  const terms: string[] = [];
  const locations = new Set<"title" | "path" | "content">();
  const candidates = uniqueStrings([
    ...originalSearchQueryGroups(query).flatMap((group) => group.filter((clause) => !clause.excluded).map((clause) => clause.value)),
    ...searchHighlightTerms(query)
  ]).filter((term) => {
    const length = Array.from(term.trim()).length;
    return length >= 2 && length <= 48;
  });
  for (const candidate of candidates) {
    const normalized = candidate.normalize("NFKC").toLowerCase().trim();
    if (!normalized) continue;
    let matched = false;
    if (title.includes(normalized)) {
      locations.add("title");
      matched = true;
    }
    if (path.includes(normalized)) {
      locations.add("path");
      matched = true;
    }
    if (content.includes(normalized)) {
      locations.add("content");
      matched = true;
    }
    if (matched) terms.push(candidate.trim());
  }
  return { terms: uniqueStrings(terms).slice(0, 2), locations: [...locations] };
}

export function compactSearchExplanationText(value: string, maxLength: number): string {
  const cleaned = value
    .replace(/```[\w-]*/g, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(cleaned);
  if (characters.length <= maxLength) return cleaned;
  return `${characters.slice(0, Math.max(1, maxLength - 1)).join("").trimEnd()}…`;
}

export function searchHitEvidenceSnippet(hit: SearchHit): string {
  const excerpt = hit.excerpt
    .replace(/^\[[^\]\n]+\]\s*/u, "")
    .replace(/^(?:硬搜索|hard search)\s*·[^\n]*\n?/iu, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = normalizePath(excerpt).normalize("NFKC").toLowerCase();
  const path = normalizePath(hit.path).normalize("NFKC").toLowerCase();
  const title = hit.title.normalize("NFKC").toLowerCase();
  if (!normalized || normalized === path || normalized === title || normalized === reviewFileName(path)) return "";
  return compactSearchExplanationText(excerpt, 52);
}

export function searchHitEvidenceQuality(hit: SearchHit): number {
  const snippet = searchHitEvidenceSnippet(hit);
  const reason = hit.reason?.trim() ?? "";
  return Math.min(180, Array.from(snippet).length)
    + Math.min(180, Array.from(reason).length * 2);
}

export function mergeSearchHitEvidence(existing: SearchHit, incoming: SearchHit): SearchHit {
  const incomingHasBetterEvidence = searchHitEvidenceQuality(incoming) >= searchHitEvidenceQuality(existing);
  const evidenceSource = incomingHasBetterEvidence ? incoming : existing;
  const incomingReason = incoming.reason?.trim() ?? "";
  const existingReason = existing.reason?.trim() ?? "";
  return {
    ...existing,
    ...incoming,
    path: existing.path || incoming.path,
    title: evidenceSource.title || existing.title || incoming.title,
    excerpt: evidenceSource.excerpt || existing.excerpt || incoming.excerpt,
    score: Math.max(existing.score, incoming.score),
    kind: incoming.kind ?? existing.kind,
    route: existing.route === "hard" || incoming.route === "hard" ? "hard" : incoming.route ?? existing.route,
    archived: incoming.archived ?? existing.archived,
    relation: incomingReason ? incoming.relation : existingReason ? existing.relation : incoming.relation ?? existing.relation,
    reason: incomingReason || existingReason || undefined
  };
}

export function searchDocumentSpecificEvidence(content: string, terms: string[], path: string): string {
  const diaryUpdate = content.match(/(?:^|\n)cancip_diary_update:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/iu);
  const diarySummary = diaryUpdate?.[1] ?? diaryUpdate?.[2] ?? diaryUpdate?.[3] ?? "";
  if (diarySummary.trim()) return compactSearchExplanationText(diarySummary, 52);
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningful = lines.filter((line) => {
    if (/^---$|^#{1,6}\s+/u.test(line)) return false;
    if (/^(?:tags?|aliases|cancip[_ -]?diary|cancip[_ -]?diary[_ -]updated)\s*:/iu.test(line)) return false;
    if (/^[-*]\s*["']?(?:日记|cancip)["']?$/iu.test(line)) return false;
    if (/^!\[|^\[\[.*(?:任务管理|日记前言).*\]\]$/u.test(line)) return false;
    if (/晚间22|\*{0,2}(?:日记待办|医务科工作|写交易日志)\*{0,2}/u.test(line)) return false;
    return compactSearchExplanationText(line, 72).length >= 4;
  });
  const normalizedTerms = terms.map((term) => term.normalize("NFKC").toLowerCase()).filter(Boolean);
  const preferred = meaningful.filter((line) => {
    const normalized = line.normalize("NFKC").toLowerCase();
    return normalizedTerms.some((term) => normalized.includes(term));
  });
  const selected = uniqueStrings([...preferred, ...meaningful]).slice(0, 3);
  if (selected.length) return compactSearchExplanationText(selected.join("；"), 72);
  const date = normalizePath(path).match(/\b(20\d{2}-\d{2}-\d{2})\b/u)?.[1] ?? "";
  const taskLabels = uniqueStrings(lines.flatMap((line) => (
    [...line.matchAll(/\*{0,2}(晚间22|日记待办|医务科工作|写交易日志)\*{0,2}/gu)].map((match) => match[1] ?? "")
  ))).filter(Boolean);
  if (taskLabels.length) {
    return compactSearchExplanationText(`仅模板待办：${taskLabels.join("、")}${date ? `（${date}）` : ""}`, 52);
  }
  return compactSearchExplanationText(makeExcerpt(content, terms), 52);
}

export function universalSearchProtectedContentPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return /(^|\/)(?:encript|encrypt|encrypted|encryption|加密)(\/|$)/i.test(normalized)
    || isSecretBearingVaultPath(normalized);
}

export function universalSearchKindPriority(kind: UniversalSearchDocumentKind): number {
  if (kind === "memory") return 0;
  if (kind === "session") return 1;
  if (kind === "note") return 2;
  if (kind === "config") return 3;
  if (kind === "pdf") return 4;
  if (kind === "office") return 5;
  if (kind === "image") return 6;
  if (kind === "archive") return 7;
  return 8;
}

export function universalSearchBinaryDocumentKind(kind: UniversalSearchDocumentKind): boolean {
  return kind === "pdf" || kind === "office" || kind === "archive";
}

export function universalSearchAttachmentDocumentKind(kind: UniversalSearchDocumentKind): boolean {
  return kind === "image" || universalSearchBinaryDocumentKind(kind);
}

export function searchResultCategoryForHit(hit: SearchHit): Exclude<SearchResultCategory, "all"> {
  const path = normalizePath(hit.path).toLowerCase().replace(/[?#].*$/, "");
  if (hit.kind === "image" || /\.(?:png|jpe?g|webp|gif|bmp|svg|avif|heic|heif|tiff?)$/.test(path)) return "image";
  if (/\.(?:mp4|mov|mkv|webm|avi|m4v|mpe?g|3gp|flv|mts|m2ts|ts)$/.test(path)) return "video";
  if (/\.(?:mp3|wav|m4a|flac|ogg|opus|aac|wma|amr|aiff?)$/.test(path)) return "audio";
  if (hit.kind === "note" || /\.(?:md|markdown)$/.test(path)) return "note";
  if (hit.kind === "pdf" || /\.pdf$/.test(path)) return "pdf";
  if (hit.kind === "office" || /\.(?:docx?|xlsx?|pptx?|odt|ods|odp)$/.test(path)) return "office";
  if (hit.kind === "archive" || /\.(?:zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(path)) return "archive";
  return "other";
}

export function searchHitsForCategory(hits: SearchHit[], category: SearchResultCategory): SearchHit[] {
  return category === "all" ? hits : hits.filter((hit) => searchResultCategoryForHit(hit) === category);
}

export function searchResultIcon(kind?: UniversalSearchDocumentKind, path = ""): string {
  const normalizedPath = normalizePath(path).toLowerCase().replace(/[?#].*$/, "");
  if (/\.(?:mp4|mov|mkv|webm|avi|m4v|mpe?g|3gp|flv|mts|m2ts|ts)$/.test(normalizedPath)) return "video";
  if (/\.(?:mp3|wav|m4a|flac|ogg|opus|aac|wma|amr|aiff?)$/.test(normalizedPath)) return "audio-lines";
  if (kind === "session") return "messages-square";
  if (kind === "memory") return "brain-circuit";
  if (kind === "config") return "settings-2";
  if (kind === "pdf") return "file-type-2";
  if (kind === "office") return "file-spreadsheet";
  if (kind === "image") return "image";
  if (kind === "archive") return "archive";
  return "file-text";
}

export function universalSearchTerms(path: string, title: string, text: string): string[] {
  const values = [path, title, text]
    .map((value) => value.normalize("NFKC").toLowerCase())
    .filter(Boolean);
  const terms = new Set<string>();
  const add = (term: string): void => {
    const normalized = term.trim().replace(/^[/._-]+|[/._-]+$/g, "");
    if (normalized && normalized.length <= 96) terms.add(normalized);
  };
  for (const value of values) {
    for (const term of tokenize(value)) {
      add(term);
      for (const variant of searchWordRootVariants(term)) add(variant);
    }
    for (const part of value.split(/[^a-z0-9_\-\u4e00-\u9fff]+/g)) {
      if (part.length >= 2) add(part);
    }
    for (const match of value.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
      const sequence = match[0];
      for (let index = 0; index < sequence.length - 1; index += 1) add(sequence.slice(index, index + 2));
    }
  }
  return [...terms];
}

export function universalSearchSemanticSignals(path: string, title: string, text: string): string {
  const normalized = redactSensitiveText(text.replace(/\r\n?/g, "\n")).trim();
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const structural = lines.filter((line) => (
    /^#{1,4}\s+/.test(line)
    || /^(?:title|aliases|tags|type|status|summary|description|project|主题|标签|状态|摘要|说明)\s*[:：]/i.test(line)
    || /\[\[[^\]]+\]\]/.test(line)
  )).slice(0, 18);
  const body = lines.filter((line) => !/^---$/.test(line) && !structural.includes(line));
  const samples: string[] = [];
  if (body.length) {
    const positions = uniqueStrings(["0", String(Math.floor(body.length / 3)), String(Math.floor(body.length * 2 / 3)), String(body.length - 1)]);
    for (const position of positions) {
      const index = Number(position);
      if (Number.isFinite(index) && body[index]) samples.push(body[index]);
    }
  }
  return trimContext(uniqueStrings([
    `Title: ${title || reviewFileName(path)}`,
    `Path: ${path}`,
    ...structural,
    ...body.slice(0, 8),
    ...samples
  ]).join("\n"), 1200);
}

export function normalizeAiSearchSignalList(value: unknown[], originalQuery: string): string[] {
  const normalizedQuery = originalQuery.normalize("NFKC").toLowerCase();
  return uniqueStrings(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizePersonalizationText(item, 64, true))
    .filter((item) => item.length >= 2 && item.normalize("NFKC").toLowerCase() !== normalizedQuery))
    .slice(0, 4);
}

export function diversifiedUniversalSearchDocuments(documents: UniversalSearchDocument[], limit: number): UniversalSearchDocument[] {
  const sorted = [...documents].sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path));
  const selected: UniversalSearchDocument[] = [];
  const perFolder = new Map<string, number>();
  for (const document of sorted) {
    const folder = normalizePath(document.path).split("/").slice(0, -1).join("/") || "/";
    const used = perFolder.get(folder) ?? 0;
    if (used >= 2 && sorted.length > limit) continue;
    selected.push(document);
    perFolder.set(folder, used + 1);
    if (selected.length >= Math.max(0, limit)) break;
  }
  return selected;
}

export function universalSearchHash(term: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < term.length; index += 1) {
    hash ^= term.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  return hash >>> 0;
}

export function searchWordRootVariants(word: string): string[] {
  const normalized = word.normalize("NFKC").toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  if (!/^[a-z][a-z0-9_-]{3,}$/.test(normalized)) return [];
  const roots = new Set<string>();
  const add = (value: string): void => {
    const candidate = value.replace(/([b-df-hj-np-tv-z])\1$/i, "$1");
    if (candidate.length >= 3 && candidate !== normalized) roots.add(candidate);
  };
  if (normalized.endsWith("ies") && normalized.length > 4) add(`${normalized.slice(0, -3)}y`);
  if (normalized.endsWith("ing") && normalized.length > 5) add(normalized.slice(0, -3));
  if (normalized.endsWith("ed") && normalized.length > 4) add(normalized.slice(0, -2));
  if (normalized.endsWith("es") && normalized.length > 4) add(normalized.slice(0, -2));
  if (normalized.endsWith("s") && normalized.length > 3) add(normalized.slice(0, -1));
  return [...roots];
}

export function searchHighlightTerms(query: string, signals: string[] = []): string[] {
  const terms = new Set<string>();
  for (const value of [query, ...signals]) {
    for (const term of universalSearchQueryTerms(value)) {
      const normalized = term.normalize("NFKC").trim();
      const visibleLength = Array.from(normalized).length;
      if (visibleLength < 2 || visibleLength > 48) continue;
      if (/^[a-z]$/i.test(normalized) || /^\d$/.test(normalized)) continue;
      terms.add(normalized);
    }
  }
  return [...terms].sort((left, right) => right.length - left.length || left.localeCompare(right)).slice(0, 36);
}

export function appendHighlightedSearchText(parent: HTMLElement, text: string, terms: string[]): void {
  if (!text || !terms.length) {
    parent.setText(text);
    return;
  }
  const pattern = terms.map(escapeRegExp).filter(Boolean).join("|");
  if (!pattern) {
    parent.setText(text);
    return;
  }
  const expression = new RegExp(pattern, "giu");
  const document = parent.ownerDocument;
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? -1;
    if (index < cursor || !match[0]) continue;
    if (index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, index)));
    parent.createEl("mark", { cls: "obcc-search-match", text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
}

export function universalSearchQueryTerms(query: string): string[] {
  const normalized = query.normalize("NFKC").toLowerCase();
  const terms = new Set<string>(tokenize(normalized));
  for (const word of normalized.match(/[a-z0-9_\-/]{2,}/g) ?? []) {
    terms.add(word);
    for (const variant of searchWordRootVariants(word)) terms.add(variant);
  }
  for (const match of normalized.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    const sequence = match[0];
    for (let index = 0; index < sequence.length - 1; index += 1) terms.add(sequence.slice(index, index + 2));
  }
  return [...terms].filter((term) => term.length <= 96).slice(0, 32);
}

export async function readImageSearchSidecarText(adapter: DataAdapter, path: string, maxChars: number): Promise<string> {
  const normalized = normalizePath(path);
  const withoutExtension = normalized.replace(/\.[^./]+$/, "");
  const candidates = uniqueStrings([
    `${withoutExtension}.md`,
    `${withoutExtension}.txt`,
    `${withoutExtension}.ocr.md`,
    `${withoutExtension}.ocr.txt`,
    `${normalized}.md`,
    `${normalized}.txt`,
    `${normalized}.ocr.md`,
    `${normalized}.ocr.txt`
  ]).filter((candidate) => candidate !== normalized);
  const chunks = [`Image: ${normalized}`, `File name: ${reviewFileName(normalized)}`];
  if (/\.svg$/i.test(normalized)) {
    try {
      if (await adapter.exists(normalized)) chunks.push(trimContext(await adapter.read(normalized), Math.min(maxChars, 20000)));
    } catch {
      // Filename and sidecars remain searchable when SVG text cannot be read.
    }
  }
  for (const candidate of candidates) {
    if (chunks.join("\n").length >= maxChars) break;
    try {
      if (!(await adapter.exists(candidate))) continue;
      chunks.push(`Sidecar: ${candidate}\n${trimContext(await adapter.read(candidate), maxChars - chunks.join("\n").length)}`);
    } catch {
      // One unreadable sidecar must not suppress the other candidates.
    }
  }
  return trimContext(chunks.join("\n\n"), maxChars);
}

export function searchTextFromSessionSnapshot(raw: string, maxChars: number): string {
  try {
    const snapshot = JSON.parse(raw) as unknown;
    if (!isRecord(snapshot)) return trimContext(redactSensitiveText(raw), maxChars);
    const parts: string[] = [];
    const add = (label: string, value: unknown): void => {
      if (typeof value === "string" && value.trim()) parts.push(`${label}: ${value.trim()}`);
      else if (typeof value === "number" || typeof value === "boolean") parts.push(`${label}: ${String(value)}`);
    };
    for (const key of ["sessionId", "title", "status", "mode", "sessionCreatedAt", "startedAt", "updatedAt", "completedAt", "stoppedAt", "failedAt"]) add(key, snapshot[key]);
    for (const key of ["resumableTask", "taskControl", "manualTodos", "queuedPrompts"]) {
      const value = snapshot[key];
      if (value !== undefined) parts.push(`${key}: ${JSON.stringify(value)}`);
    }
    const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
    for (const [index, message] of messages.entries()) {
      if (!isRecord(message)) continue;
      const role = typeof message.role === "string" ? message.role : "message";
      add(`${role} ${index + 1}`, message.content);
      if (Array.isArray(message.sources)) parts.push(`${role} ${index + 1} sources: ${JSON.stringify(message.sources)}`);
      if (Array.isArray(message.progressSteps)) parts.push(`${role} ${index + 1} process: ${JSON.stringify(message.progressSteps)}`);
    }
    const contexts = Array.isArray(snapshot.draftContext) ? snapshot.draftContext : [];
    for (const context of contexts) {
      if (!isRecord(context)) continue;
      parts.push(`context: ${JSON.stringify({ label: context.label, path: context.path, content: context.content })}`);
    }
    return trimContext(redactSensitiveText(parts.join("\n\n")), maxChars);
  } catch {
    return trimContext(redactSensitiveText(raw), maxChars);
  }
}

export function searchableVaultText(path: string, raw: string, maxChars: number): string {
  if (/\.html?$/i.test(path)) {
    try {
      const document = new DOMParser().parseFromString(raw, "text/html");
      document.querySelectorAll("script, style, template, noscript").forEach((element) => element.remove());
      const text = [document.title, document.body?.textContent ?? ""]
        .filter(Boolean)
        .join("\n")
        .replace(/[\t ]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text) return trimContext(text, maxChars);
    } catch {
      // Fall through to raw text when the document is malformed.
    }
  }
  if (/\.xml$/i.test(path)) {
    try {
      const document = new DOMParser().parseFromString(raw, "application/xml");
      const text = (document.documentElement?.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) return trimContext(text, maxChars);
    } catch {
      // Fall through to raw text when XML parsing is unavailable.
    }
  }
  return trimContext(raw, maxChars);
}

export function shouldRecordToolExperience(event: ToolFeedbackEvent): boolean {
  if (event.status !== "executed") return true;
  const actions = Array.isArray(event.action) ? event.action : event.action ? [event.action] : [];
  if (!actions.length) return !/^(read|list|status|help|读取|列出|状态|帮助)\b/i.test(event.summary.trim());
  return actions.some((action) => {
    if (action.type === "read") return false;
    if (action.type === "todo" && action.op === "list") return false;
    if (action.type === "automation" && action.op === "list") return false;
    if (action.type !== "command") return true;
    return !/(?:\.help|\.list|\.status)$/.test(action.command)
      && !["obsidian.currentView", "obsidian.listCommands", "cancip.tools.index", "cancip.capability.resolve", "cancip.sessionHistory"].includes(action.command);
  });
}

export function experienceActionTemplate(action: CancipAction | CancipAction[]): unknown {
  const sanitize = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) return value.slice(0, 8).map((item) => sanitize(item, key));
    if (isRecord(value)) {
      const next: Record<string, unknown> = {};
      for (const [childKey, childValue] of Object.entries(value)) next[childKey] = sanitize(childValue, childKey);
      return next;
    }
    if (typeof value !== "string") return value;
    if (/api.?key|token|password|secret|authorization/i.test(key)) return "<secret>";
    if (/^(content|chunks|data|dataUrl)$/i.test(key)) return "<task-content>";
    if (/^(code|script|js|body|expression)$/i.test(key)) return "<task-specific-code>";
    if (/^(find|replace)$/i.test(key) && value.length > 120) return `<task-${key}>`;
    return trimContext(redactSensitiveText(value).replace(/\s+/g, " "), 180);
  };
  return sanitize(action);
}

export function buildExperienceSkillRecipes(raw: string): ExperienceSkillRecipe[] {
  const groups = new Map<string, { summary: string; detail: string; failureDetail: string; action: string; count: number; failureCount: number; lastAt: string }>();
  for (const block of raw.split(/\n(?=##\s+)/)) {
    const heading = block.match(/^\s*##\s+(.+?)\s*·\s*(executed|failed)\b/im);
    if (!heading) continue;
    const at = heading[1]?.trim() ?? "";
    const status = heading[2] === "failed" ? "failed" : "executed";
    const summary = block.match(/^\s*-\s*Step:\s*(.+)$/im)?.[1]?.trim() ?? "";
    const action = block.match(/^\s*-\s*Action:\s*(.+)$/im)?.[1]?.trim() ?? "";
    const detail = block.match(/^\s*-\s*Result:\s*(.+)$/im)?.[1]?.trim() ?? "";
    if (!summary || shouldSkipExperienceSkillSummary(summary)) continue;
    const title = experienceSkillTitle(summary);
    if (isGenericExperienceSkillTitle(title)) continue;
    const key = normalizeExperienceSkillKey(summary);
    const existing = groups.get(key);
    if (existing) {
      if (status === "failed") existing.failureCount += 1;
      else existing.count += 1;
      if (at >= existing.lastAt) {
        existing.summary = summary;
        if (action) existing.action = action;
        if (status === "failed") existing.failureDetail = detail;
        else existing.detail = detail;
        existing.lastAt = at;
      }
    } else {
      groups.set(key, {
        summary,
        action,
        detail: status === "failed" ? "" : detail,
        failureDetail: status === "failed" ? detail : "",
        count: status === "failed" ? 0 : 1,
        failureCount: status === "failed" ? 1 : 0,
        lastAt: at
      });
    }
  }
  return [...groups.entries()]
    .filter(([, group]) => group.count >= 2)
    .sort((a, b) => (b[1].count + b[1].failureCount) - (a[1].count + a[1].failureCount) || b[1].lastAt.localeCompare(a[1].lastAt) || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([key, group]) => {
      const title = experienceSkillTitle(group.summary);
      const id = `experience-${stableTextHash(key).slice(0, 8)}`;
      const fileName = `${id}-${experienceSkillFileStem(title)}.skill.md`;
      const detail = trimContext(group.detail.replace(/\s+/g, " "), 700);
      const failureDetail = trimContext(group.failureDetail.replace(/\s+/g, " "), 700);
      const summary = trimContext(group.summary.replace(/\s+/g, " "), 260);
      const actionTemplate = trimContext(group.action, 1200);
      const triggers = experienceSkillTriggers(group.summary);
      const content = [
        "---",
        `name: ${yamlSingleLine(`Cancip 经验：${title}`)}`,
        `description: ${yamlSingleLine(`从成功/失败执行记录沉淀的可复用流程：${summary}`)}`,
        "triggers:",
        ...triggers.map((trigger) => `  - ${yamlSingleLine(trigger)}`),
        "priority: 92",
        "source: cancip-experience",
        `updated: ${new Date().toISOString()}`,
        "---",
        "",
        `# Cancip 经验：${title}`,
        "",
        "## 适用场景",
        "",
        `当用户任务与“${summary}”相似时，优先复用这个流程；不要重新泛泛试错。`,
        "",
        "## 快速执行",
        "",
        "1. 先用最小只读动作定位目标、确认当前状态和路径。",
        "2. 需要改动时输出小批量可验证动作，避免一次性吞入整库上下文。",
        "3. 写入、移动、配置或命令执行后必须读回或用状态命令验证。",
        "4. 如果目标是普通 Vault 笔记内容改动，遵守 Cancip 审核/批准流程。",
        "",
        "## 已验证动作模式",
        "",
        `- 成功次数：${group.count}`,
        `- 失败次数：${group.failureCount}`,
        `- 最近动作：${summary}`,
        detail ? `- 最近结果：${detail}` : "- 最近结果：见经验日志",
        failureDetail ? `- 最近失败避坑：${failureDetail}` : "- 最近失败避坑：无",
        actionTemplate ? "- 可复用动作模板：" : "",
        ...(actionTemplate ? markdownFenceLines(actionTemplate, "json") : []),
        "",
        "## 手机端注意",
        "",
        "优先使用 Cancip 命令总线、Vault 相对路径和小片段读写；避免依赖桌面窗口或本机 shell。",
        ""
      ].join("\n");
      return { id, title, summary, detail, count: group.count, fileName, content };
    });
}

export function shouldSkipExperienceSkillSummary(summary: string): boolean {
  const text = summary.trim();
  if (!text) return true;
  if (/^(read|读取)\s/i.test(text) && text.length < 80) return true;
  if (/^(todo|计划|manual|queue)\b/i.test(text)) return true;
  if (/cancip\.skills\.refresh|cancip\.experience\.harvest/i.test(text)) return true;
  if (/obsidian\.eval|javascript\.eval|browser\.eval|js\.eval/i.test(text) && !/(notedraw|pdftion|插件|按钮|界面|笔记|pdf|tts|标签页|工作区|涂鸦|高亮|朗读)/i.test(text)) return true;
  return false;
}

export function isGenericExperienceSkillTitle(title: string): boolean {
  const compact = title.replace(/\s+/g, "");
  return !compact || compact.length < 4 || /^(文件|目录|操作|命令|动作|可复用流程|file|command|action)$/i.test(compact);
}

export function normalizeExperienceSkillKey(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/["'`][^"'`]{1,180}["'`]/g, "<text>")
    .replace(/(?:^|[\s:])(?:\.cancip|ai\/cancip|[\w\u4e00-\u9fff ._-]+\/)+[\w\u4e00-\u9fff ._@()-]+\.[a-z0-9]{1,8}/gi, " <file>")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d{4}-\d{2}-\d{2}[t\s][\d:.-]+z?/gi, "<date>")
    .replace(/\s+/g, " ")
    .trim();
}

export function experienceSkillTitle(summary: string): string {
  const cleaned = summary
    .replace(/\b[0-9a-f]{8,}\b/gi, "")
    .replace(/(?:\.cancip|AI\/Cancip|[\w\u4e00-\u9fff ._-]+\/)+[\w\u4e00-\u9fff ._@()-]+\.[a-z0-9]{1,8}/gi, "文件")
    .replace(/\s+/g, " ")
    .trim();
  return trimContext(cleaned || "可复用流程", 42);
}

export function experienceSkillFileStem(title: string): string {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return safe || "recipe";
}

export function experienceSkillTriggers(summary: string): string[] {
  const fixed = ["cancip", "经验", "复用", "workflow"];
  const tokens = tokenize(summary).filter((token) => token.length >= 2).slice(0, 14);
  return uniqueStrings([...fixed, ...tokens, summary]).slice(0, 18);
}

export function yamlSingleLine(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, " ").trim());
}

export function personalizedDiaryDocument(current: string, addition: string, at: Date): string {
  const normalized = current.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const frontmatterMatch = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1].split("\n") : [];
  const body = frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized;
  ensurePersonalizedDiaryTags(frontmatter, ["日记", "cancip"]);
  upsertPersonalizedDiaryProperty(frontmatter, "cancip_diary", "true");
  upsertPersonalizedDiaryProperty(frontmatter, "cancip_diary_updated", yamlSingleLine(at.toISOString()));
  upsertPersonalizedDiaryProperty(
    frontmatter,
    "cancip_diary_update",
    yamlSingleLine(trimContext(addition.replace(/\s+/g, " ").trim(), 1200))
  );
  return `---\n${frontmatter.join("\n").trim()}\n---\n${body}`;
}

export function ensurePersonalizedDiaryTags(lines: string[], required: string[]): void {
  const index = lines.findIndex((line) => /^tags\s*:/i.test(line));
  if (index < 0) {
    if (lines.length && lines.at(-1)?.trim()) lines.push("");
    lines.push("tags:", ...required.map((tag) => `  - ${yamlSingleLine(tag)}`));
    return;
  }
  const line = lines[index] ?? "tags:";
  const raw = line.replace(/^tags\s*:/i, "").trim();
  if (raw) {
    const existing = raw.startsWith("[") && raw.endsWith("]")
      ? raw.slice(1, -1).split(",")
      : [raw];
    const tags = uniqueStrings(existing
      .map((value) => value.trim().replace(/^['\"]|['\"]$/g, "").replace(/^#/, ""))
      .filter(Boolean)
      .concat(required));
    lines[index] = `tags: [${tags.map(yamlSingleLine).join(", ")}]`;
    return;
  }
  let end = index + 1;
  const existing = new Set<string>();
  while (end < lines.length && (/^\s+/.test(lines[end] ?? "") || !(lines[end] ?? "").trim())) {
    const match = /^\s*-\s*(.+?)\s*$/.exec(lines[end] ?? "");
    if (match?.[1]) existing.add(match[1].replace(/^['\"]|['\"]$/g, "").replace(/^#/, ""));
    end += 1;
  }
  const missing = required.filter((tag) => !existing.has(tag));
  if (missing.length) lines.splice(end, 0, ...missing.map((tag) => `  - ${yamlSingleLine(tag)}`));
}

export function upsertPersonalizedDiaryProperty(lines: string[], key: string, value: string): void {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*:`, "i");
  const index = lines.findIndex((line) => pattern.test(line));
  if (index >= 0) {
    lines[index] = `${key}: ${value}`;
    return;
  }
  lines.push(`${key}: ${value}`);
}

export async function sha256Text(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256ArrayBuffer(input: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function tokenize(input: string): string[] {
  const lower = input.toLowerCase();
  const matches = lower.match(/[a-z0-9_\-/]{2,}|[\u4e00-\u9fff]{1,2}/g) ?? [];
  const stop = new Set([
    "the", "and", "for", "with", "this", "that",
    "hi", "hello", "hey", "test", "ping", "ok",
    "你", "我", "的", "了", "是", "在", "和", "就", "都", "把",
    "你好", "您好", "测试", "試試", "在吗", "在嗎", "哈喽", "哈囉"
  ]);
  return [...new Set(matches.filter((token) => !stop.has(token)))];
}

export function isDistinctVaultLinkCandidateName(input: string): boolean {
  const compact = input.replace(/\s+/g, "").trim();
  if (!compact || /^\d{4}(?:[-_.]\d{1,2}){0,2}$/.test(compact)) return false;
  const latinOrNumber = compact.match(/[a-z0-9][a-z0-9_-]{3,}/i)?.[0] ?? "";
  if (latinOrNumber.length >= 4) return true;
  const hanCount = (compact.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return hanCount >= 5 && tokenize(compact).length >= 3;
}

export function extractHistoryKeyTerms(input: string): string[] {
  const text = redactSensitiveText(input);
  const pathTerms = text.match(/(?:^|[\s"'`])(?:\.?[A-Za-z0-9_\-\u4e00-\u9fff]+\/)+[A-Za-z0-9_\-\u4e00-\u9fff.]+/g) ?? [];
  const codeTerms = text.match(/(?:session-\d{4}-\d{2}-\d{2}T[\d-]+Z(?:-\d{2,})?|\.cancip|Obsidian config|Cancip|ntfy|nfty|Obsidian|GitHub|API|RAG|Vault|Plan|Full access|Ask for approval|Responses|compatible|Claude Code)/gi) ?? [];
  const naturalTerms = tokenize(text)
    .filter((token) => token.length >= 2 && token.length <= 36)
    .filter((token) => !/^\d+$/.test(token));
  const ranked = [...pathTerms, ...codeTerms, ...naturalTerms]
    .map((term) => term.trim().replace(/^[\s"'`]+/, "").replace(/[\s"'`，。；,;]+$/, ""))
    .filter(Boolean);
  return uniqueStrings(ranked).slice(0, 32);
}

export function extractMentionTokens(input: string): string[] {
  const tokens: string[] = [];
  const regex = /(^|[\s([{，。；,;])(?:@\[([^\]]+)\]|@([^\s@#|，。；,;]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    const mentionToken = normalizeMentionQuery(match[2] || match[3] || "");
    if (mentionToken) tokens.push(mentionToken);
  }
  return [...new Set(tokens)];
}

export function normalizeMentionQuery(input: string): string {
  return input
    .trim()
    .replace(/^@/, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\\/g, "/")
    .trim();
}

export function mentionIcon(kind: MentionKind): string {
  if (kind === "category") return "layout-list";
  if (kind === "session") return "messages-square";
  if (kind === "automation") return "calendar-clock";
  if (kind === "command") return "terminal";
  if (kind === "folder") return "folder";
  if (kind === "skill") return "sparkles";
  if (kind === "action") return "wrench";
  return "file-text";
}

export function mentionTargetKey(target: MentionTarget): string {
  return `${target.kind}:${target.source}:${target.path}`;
}

export function uniqueMentionTargets(targets: MentionTarget[]): MentionTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = mentionTargetKey(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function contextChipName(path: string, fallback: string): string {
  const raw = (path || fallback).trim().replace(/\\/g, "/");
  const last = raw.split("/").filter(Boolean).pop() || fallback || raw;
  return trimContext(last, 36);
}

export function contextChipKey(kind: string, path: string): string {
  return `${kind}:${path}`;
}

export function normalizeReviewGateLogicalPath(path: string): string {
  return normalizePath(String(path ?? "").normalize("NFC").replace(/\\/g, "/")).normalize("NFC");
}

export function reviewGateLogicalPathKey(path: string): string {
  return normalizeReviewGateLogicalPath(path).toLocaleLowerCase("en-US");
}

export function uniqueReviewGatePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = normalizeReviewGateLogicalPath(path);
    const key = reviewGateLogicalPathKey(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function reviewGateDisplayName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const folder = parts.length >= 2 ? parts[parts.length - 2] : normalized;
  return folder || normalized;
}

export function reviewGateCompactTitle(title: string): string {
  const cleaned = title
    .replace(/^Cancip\s+(AI Change|Applied Action|Pending Action)\s+Review:\s*/i, "")
    .replace(/^write\s+/i, "")
    .trim();
  return cleaned || title;
}

export function isReviewGateAttentionExcluded(path: string): boolean {
  const name = reviewGateDisplayName(path).toLowerCase();
  return name.startsWith("test-markdown-features") || name.includes("markdown-review-render-test");
}

export function isPathInVaultFolder(path: string, folder: string): boolean {
  const normalizedPath = normalizePath(String(path ?? "").replace(/\\/g, "/").replace(/^\/+/, ""));
  const normalizedFolder = normalizePath(String(folder ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
  if (!normalizedPath || !normalizedFolder) return false;
  return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}

export function reviewGatePackageFolder(path: string): string {
  const normalized = normalizePath(path.replace(/\\/g, "/"));
  if (normalized.endsWith("/manifest.json")) {
    return normalized.slice(0, -"/manifest.json".length);
  }
  return normalized.replace(/\/[^/]+$/, "");
}

export function reviewFileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

export function isDotFolderVaultPath(path: string): boolean {
  const normalized = normalizePath(String(path ?? "").replace(/\\/g, "/"));
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return false;
  return parts.slice(0, -1).some((part) => part.startsWith("."));
}

export function isDotFolderPathOrSelf(path: string): boolean {
  return normalizePath(String(path ?? "").replace(/\\/g, "/"))
    .split("/")
    .filter(Boolean)
    .some((part) => part.startsWith("."));
}

export function reviewItemAllOpenPaths(item: ReviewGateManifestItem): string[] {
  const structure = normalizeReviewStructureChanges(item.structure);
  return uniqueStrings([
    item.path,
    ...structure.flatMap((change) => [change.new_path, change.old_path])
  ].map((path) => normalizePath(String(path ?? "").replace(/\\/g, "/"))))
}

export function reviewGatePathsTouch(candidatePath: string, path: string): boolean {
  try {
    const candidate = normalizeActionPath(candidatePath);
    const target = normalizeActionPath(path);
    return candidate === target || isPathInFolder(target, candidate) || isPathInFolder(candidate, target);
  } catch {
    return false;
  }
}

export function reviewGateItemTouchesAnyPath(item: ReviewGateManifestItem, paths: Set<string>): boolean {
  if (!paths.size) return true;
  for (const candidate of reviewItemAllOpenPaths(item)) {
    for (const path of paths) {
      if (reviewGatePathsTouch(candidate, path)) return true;
    }
  }
  return false;
}

export function reviewGateExpectedStatesForItem(item: ReviewGateManifestItem, mode: ReviewGateExpectedStateMode = "new"): ReviewGateExpectedState[] {
  const states = new Map<string, ReviewGateExpectedState>();
  const changes = item.changes ?? [];
  const expectedText = mode === "old" ? item.old_text ?? "" : item.new_text ?? "";
  const addState = (rawPath: string, text: string, exists: boolean, role: ReviewGateExpectedState["role"]): void => {
    try {
      const path = normalizeActionPath(rawPath);
      states.set(reviewGateLogicalPathKey(path), { path, text, exists, role });
    } catch {
      // Invalid stored paths cannot be compared safely; leave them reviewable.
    }
  };
  const textPath = item.path;
  const hasDelete = changes.includes("delete");
  const structure = normalizeReviewStructureChanges(item.structure);
  if (mode === "old") {
    for (const change of structure) {
      const oldPath = change.old_path || textPath;
      const newPath = change.new_path || textPath;
      if ((change.kind === "rename" || change.kind === "move") && oldPath) {
        addState(oldPath, expectedText, true, "old-path");
        continue;
      }
      if (change.kind === "copy" && newPath) {
        addState(newPath, expectedText, !changes.includes("create"), "new-path");
        continue;
      }
      if (newPath) addState(newPath, expectedText, !changes.includes("create"), "new-path");
    }
    if (!structure.length || reviewItemHasContentChange(item)) {
      addState(textPath, expectedText, !changes.includes("create"), "content");
    }
    return [...states.values()];
  }
  for (const change of structure) {
    const oldPath = change.old_path || textPath;
    const newPath = change.new_path || textPath;
    if ((change.kind === "rename" || change.kind === "move") && oldPath && newPath && oldPath !== newPath) {
      addState(oldPath, "", false, "old-path");
      addState(newPath, expectedText, !hasDelete, "new-path");
      continue;
    }
    if (change.kind === "copy" && newPath) {
      addState(newPath, expectedText, !hasDelete, "new-path");
      continue;
    }
    if (newPath) addState(newPath, expectedText, !hasDelete, "new-path");
  }
  if (!structure.length) {
    addState(textPath, expectedText, !hasDelete, "content");
  } else if (reviewItemHasContentChange(item)) {
    const textPathIsOldOnly = structure.some((change) => {
      if (change.kind !== "rename" && change.kind !== "move") return false;
      const oldPath = change.old_path || textPath;
      const newPath = change.new_path || textPath;
      return reviewGatePathsTouch(oldPath, textPath) && !reviewGatePathsTouch(newPath, textPath);
    });
    if (!textPathIsOldOnly && !states.has(reviewGateLogicalPathKey(textPath))) {
      addState(textPath, expectedText, !hasDelete, "content");
    }
  }
  return [...states.values()];
}

export function reviewGateExpectedStateForPath(item: ReviewGateManifestItem, path: string): ReviewGateExpectedState | null {
  for (const expected of reviewGateExpectedStatesForItem(item)) {
    if (reviewGatePathsTouch(expected.path, path)) return expected;
  }
  return null;
}

export function reviewGateItemTextWasTruncated(item: ReviewGateManifestItem): boolean {
  return (item.old_text ?? "").includes("[truncated by Cancip review gate]")
    || (item.new_text ?? "").includes("[truncated by Cancip review gate]");
}

export function vaultPathWikilink(path: string): string {
  const normalized = normalizePath(path.replace(/\\/g, "/"));
  if (!normalized) return path;
  const target = normalized.toLowerCase().endsWith(".md") ? normalized.slice(0, -3) : normalized;
  const label = reviewFileName(normalized);
  return `[[${escapeWikilinkPart(target)}|${escapeWikilinkPart(label)}]]`;
}

export function escapeWikilinkPart(value: string): string {
  return value.replace(/\|/g, "¦").replace(/\]/g, ")");
}

export function countTextLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function formatLineDeltaLabel(delta: LineDeltaSummary | null): string {
  if (!delta) return "";
  const parts: string[] = [];
  if (delta.added) parts.push(`+${delta.added}`);
  if (delta.removed) parts.push(`-${delta.removed}`);
  if (!parts.length) return "";
  return `${delta.estimated ? "≈" : ""}${parts.join("/")}`;
}

export function reviewItemLineDelta(item: ReviewGateManifestItem): LineDeltaSummary {
  const summaryLineDelta = (item as ReviewGateLightItem).summaryLineDelta;
  if (summaryLineDelta) return summaryLineDelta;
  const lines = makeReviewDiffLines(item.old_text ?? "", item.new_text ?? "");
  const added = lines.filter((line) => line.kind === "added").length;
  const removed = lines.filter((line) => line.kind === "removed").length;
  return { added, removed, estimated: false };
}

export function reviewItemHasContentChange(item: ReviewGateManifestItem): boolean {
  return (item.old_text ?? "") !== (item.new_text ?? "")
    || (item.changes ?? []).some((change) => change === "create" || change === "delete" || change === "write" || change === "append" || change === "patch");
}

export function reviewItemHasStructureChange(item: ReviewGateManifestItem): boolean {
  return normalizeReviewStructureChanges(item.structure).length > 0;
}

export function isReviewGateItemChanged(item: ReviewGateManifestItem): boolean {
  return reviewItemHasContentChange(item) || reviewItemHasStructureChange(item) || item.changes.length > 0;
}

export function isReviewGateInternalCategory(value: unknown): value is ReviewGateInternalCategory {
  return value === "automation"
    || value === "button"
    || value === "command"
    || value === "config"
    || value === "memory"
    || value === "plugin"
    || value === "skill"
    || value === "other";
}

export function reviewGateCategoryDefaultLabel(category: ReviewGateInternalCategory): string {
  const labels: Record<ReviewGateInternalCategory, string> = {
    automation: "自动化任务",
    button: "按钮与界面规则",
    command: "命令与执行路线",
    config: "配置文件",
    memory: "记忆与经验",
    plugin: "插件文件与数据",
    skill: "Skill 与能力路线",
    other: "其他内部改动"
  };
  return labels[category];
}

export function reviewGateChangeDefaultLabel(change: string): string {
  const labels: Record<string, string> = {
    create: "新建",
    write: "修改内容",
    append: "追加内容",
    patch: "局部修改",
    config: "配置更新",
    delete: "删除",
    rename: "重命名",
    move: "移动",
    copy: "复制",
    merge: "合并",
    split: "拆分",
    folder: "文件夹结构调整"
  };
  const normalized = change.trim().toLocaleLowerCase();
  return labels[normalized] ?? change.trim();
}

export function isTerminalReviewGateDecision(decision: string): decision is ReviewGateTerminalDecision {
  return decision === "approved" || decision === "correction" || decision === "cancelled" || decision === "rejected";
}

export function normalizeReviewGateItems(raw: unknown): ReviewGateManifestItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ReviewGateManifestItem[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const path = typeof item.path === "string" ? normalizePath(item.path.replace(/\\/g, "/")) : "";
    if (!path.trim()) continue;
    const oldText = typeof item.old_text === "string" ? item.old_text : typeof item.oldText === "string" ? item.oldText : "";
    const newText = typeof item.new_text === "string" ? item.new_text : typeof item.newText === "string" ? item.newText : oldText;
    items.push({
      path,
      old_text: oldText,
      new_text: newText,
      changes: Array.isArray(item.changes) ? item.changes.filter((value): value is string => typeof value === "string") : [],
      links: isRecord(item.links) ? item.links : {},
      structure: normalizeReviewStructureChanges(item.structure),
      ...(isReviewGateInternalCategory(item.category) ? { category: item.category } : {}),
      ...(typeof item.review_summary === "string" && item.review_summary.trim() ? { review_summary: item.review_summary } : {}),
      ...(Array.isArray(item.review_details) ? { review_details: item.review_details.filter((value): value is string => typeof value === "string") } : {}),
      ...(typeof item.review_source === "string" && item.review_source.trim() ? { review_source: item.review_source } : {})
    });
  }
  return items;
}

export function normalizeReviewStructureChanges(raw: unknown): ReviewGateStructureChange[] {
  if (!Array.isArray(raw)) return [];
  const changes: ReviewGateStructureChange[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    changes.push({
      kind: isReviewGateStructureKind(item.kind) ? item.kind : "folder",
      old_path: typeof item.old_path === "string" ? normalizePath(item.old_path.replace(/\\/g, "/")) : "",
      new_path: typeof item.new_path === "string" ? normalizePath(item.new_path.replace(/\\/g, "/")) : "",
      reason: typeof item.reason === "string" ? item.reason : "",
      related_files: Array.isArray(item.related_files)
        ? item.related_files.filter((value): value is string => typeof value === "string")
        : undefined
    });
  }
  return changes;
}

export function isReviewGateStructureKind(value: unknown): value is ReviewGateStructureKind {
  return value === "rename" || value === "move" || value === "copy" || value === "merge" || value === "split" || value === "folder";
}

export function markdownReviewTestItem(): ReviewGateManifestItem {
  const oldText = [
    "# Cancip Markdown 审核测试",
    "",
    "这是一份用于测试审核面板变化渲染的旧版 Markdown。",
    "",
    "## 任务列表",
    "- [ ] 旧任务：检查差异面板",
    "- [x] 已完成：基础对照",
    "",
    "## 表格",
    "| 模块 | 状态 | 备注 |",
    "| --- | --- | --- |",
    "| Diff | 旧 | 显示上下文太多 |",
    "| Render | 旧 | 还未支持变化渲染 |",
    "",
    "## 代码块",
    "```ts",
    "const mode = \"source\";",
    "console.log(mode);",
    "```",
    "",
    "> [!note] 旧提示",
    "> 这里是旧 callout 内容。",
    "",
    "<div class=\"cancip-test\">旧 HTML 块</div>",
    "",
    "链接：[[AI/Cancip/Memory/CANCIP_INDEX]]",
    "",
    "结尾：旧版内容。"
  ].join("\n");
  const newText = [
    "# Cancip Markdown 审核测试",
    "",
    "这是一份用于测试审核面板变化渲染的新版 Markdown。",
    "",
    "## 任务列表",
    "- [x] 新任务：检查完整文件和变化块",
    "- [x] 已完成：基础对照",
    "- [ ] 新增：渲染模式检查表格、代码和 callout",
    "",
    "## 表格",
    "| 模块 | 状态 | 备注 |",
    "| --- | --- | --- |",
    "| Diff | 新 | 完整上下文与变化块 |",
    "| Render | 新 | 支持变化渲染 |",
    "| Review | 新增 | 手机上查看更紧凑 |",
    "",
    "## 代码块",
    "```ts",
    "const mode = \"render\";",
    "console.log({ mode, fullFile: true });",
    "```",
    "",
    "> [!success] 新提示",
    "> 这里是新的 callout 内容。",
    "> 完整文件保留上下文，变化块可左滑决定。",
    "",
    "<div class=\"cancip-test\">新版 HTML 块</div>",
    "",
    "链接：[[AI/Cancip/Memory/CANCIP_INDEX]]、[[AI/Cancip/Review]]",
    "",
    "结尾：新版内容。"
  ].join("\n");
  return {
    path: "AI/Cancip/Test/Markdown审核特性测试.md",
    old_text: oldText,
    new_text: newText,
    changes: ["markdown-render", "diff-only", "mobile-review"],
    links: {
      current: ["AI/Cancip/Memory/CANCIP_INDEX"],
      added: ["AI/Cancip/Review"]
    },
    structure: []
  };
}

export function makeReviewDiffLines(oldText: string, newText: string): ReviewDiffLine[] {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const pairBudget = oldLines.length * newLines.length;
  if (pairBudget <= 30000) return makeReviewDiffLinesByLcs(oldLines, newLines);
  const rows: ReviewDiffLine[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine === newLine) {
      rows.push({ kind: "context", oldLine: index + 1, newLine: index + 1, text: oldLine ?? "" });
      continue;
    }
    if (oldLine !== undefined) rows.push({ kind: "removed", oldLine: index + 1, text: oldLine });
    if (newLine !== undefined) rows.push({ kind: "added", newLine: index + 1, text: newLine });
  }
  return rows;
}

export function reviewDiffHunks(oldText: string, newText: string, contextRadius = 2): ReviewDiffHunk[] {
  const lines = makeReviewDiffLines(oldText, newText);
  const changedIndexes = lines
    .map((line, index) => line.kind === "added" || line.kind === "removed" ? index : -1)
    .filter((index) => index >= 0);
  if (!changedIndexes.length) return [];
  const selected = new Set<number>();
  for (const index of changedIndexes) {
    for (let cursor = Math.max(0, index - contextRadius); cursor <= Math.min(lines.length - 1, index + contextRadius); cursor += 1) {
      selected.add(cursor);
    }
  }
  const ranges: Array<{ start: number; end: number }> = [];
  let currentStart = -1;
  let previous = -2;
  for (const index of [...selected].sort((a, b) => a - b)) {
    if (currentStart < 0) {
      currentStart = index;
      previous = index;
      continue;
    }
    if (index > previous + 1) {
      ranges.push({ start: currentStart, end: previous });
      currentStart = index;
    }
    previous = index;
  }
  if (currentStart >= 0) ranges.push({ start: currentStart, end: previous });
  return ranges.map((range) => ({ lines: lines.slice(range.start, range.end + 1) }));
}

export function reviewDiffBlocks(oldText: string, newText: string): ReviewDiffBlock[] {
  const blocks: ReviewDiffBlock[] = [];
  let current: ReviewDiffLine[] = [];
  const push = () => {
    if (!current.length) return;
    const signature = current.map((line) => `${line.kind}:${line.oldLine ?? 0}:${line.newLine ?? 0}:${line.text}`).join("\n");
    blocks.push({ id: stableTextHash(signature), lines: current });
    current = [];
  };
  for (const line of makeReviewDiffLines(oldText, newText)) {
    if (line.kind === "context") {
      push();
      continue;
    }
    current.push(line);
  }
  push();
  return blocks;
}

export function reviewTextForBlockDecisions(
  oldText: string,
  newText: string,
  state: ReviewDiffBlockDecisionState
): string {
  const rows = makeReviewDiffLines(oldText, newText);
  const output: string[] = [];
  let changed: ReviewDiffLine[] = [];
  const pushChanged = () => {
    if (!changed.length) return;
    const signature = changed.map((line) => `${line.kind}:${line.oldLine ?? 0}:${line.newLine ?? 0}:${line.text}`).join("\n");
    const id = stableTextHash(signature);
    const decision = state.decisions[id] ?? state.base;
    const kind = decision === "approved" ? "added" : "removed";
    output.push(...changed.filter((line) => line.kind === kind).map((line) => line.text));
    changed = [];
  };
  for (const row of rows) {
    if (row.kind === "context") {
      pushChanged();
      output.push(row.text);
    } else {
      changed.push(row);
    }
  }
  pushChanged();
  const source = state.base === "approved" ? newText : oldText;
  return `${output.join("\n")}${source.endsWith("\n") ? "\n" : ""}`;
}

export function reviewChangedMarkdownRows(oldText: string, newText: string): Array<ReviewDiffLine & { markdown: string }> {
  const hunks = reviewDiffHunks(oldText, newText, 1);
  if (!hunks.length) return [];
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  return hunks
    .flatMap((hunk) => hunk.lines)
    .map((line) => ({
      ...line,
      markdown: reviewMarkdownForDiffLine(line, oldLines, newLines)
    }));
}

export function reviewMarkdownForDiffLine(line: ReviewDiffLine, oldLines: string[], newLines: string[]): string {
  const sourceLines = line.kind === "removed" ? oldLines : newLines;
  const lineNo = line.kind === "removed" ? line.oldLine : line.newLine;
  if (!lineNo) return line.text;
  const index = lineNo - 1;
  const extras = new Set<number>([index]);
  const tableHeader = reviewFindTableHeader(sourceLines, index);
  if (tableHeader !== null) {
    extras.add(tableHeader);
    if (sourceLines[tableHeader + 1] && isMarkdownTableSeparator(sourceLines[tableHeader + 1])) extras.add(tableHeader + 1);
  }
  const fence = reviewFindFenceRange(sourceLines, index);
  if (fence) {
    extras.add(fence.start);
    extras.add(fence.end);
  }
  const calloutStart = reviewFindCalloutStart(sourceLines, index);
  if (calloutStart !== null) extras.add(calloutStart);
  const ordered = [...extras].filter((lineIndex) => lineIndex >= 0 && lineIndex < sourceLines.length).sort((a, b) => a - b);
  return ordered.map((lineIndex) => sourceLines[lineIndex] ?? "").join("\n");
}

export function reviewFindTableHeader(lines: string[], index: number): number | null {
  if (!looksLikeMarkdownTableLine(lines[index] ?? "")) return null;
  for (let cursor = index; cursor >= Math.max(0, index - 8); cursor -= 1) {
    if (isMarkdownTableSeparator(lines[cursor] ?? "")) {
      const header = cursor - 1;
      return header >= 0 && looksLikeMarkdownTableLine(lines[header] ?? "") ? header : null;
    }
  }
  return null;
}

export function looksLikeMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && trimmed.length > 1;
}

export function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

export function reviewFindFenceRange(lines: string[], index: number): { start: number; end: number } | null {
  let start = -1;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (/^\s*(```|~~~)/.test(lines[cursor] ?? "")) {
      start = cursor;
      break;
    }
  }
  if (start < 0) return null;
  let end = -1;
  for (let cursor = start + 1; cursor < lines.length; cursor += 1) {
    if (/^\s*(```|~~~)\s*$/.test(lines[cursor] ?? "")) {
      end = cursor;
      break;
    }
  }
  if (end < 0 || index <= start || index >= end) return null;
  return { start, end };
}

export function reviewFindCalloutStart(lines: string[], index: number): number | null {
  const current = lines[index] ?? "";
  if (!/^\s*>\s?/.test(current)) return null;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const line = lines[cursor] ?? "";
    if (/^\s*>\s?\[![^\]]+\]/.test(line)) return cursor;
    if (!/^\s*>\s?/.test(line)) break;
  }
  return null;
}

export function makeReviewDiffLinesByLcs(oldLines: string[], newLines: string[]): ReviewDiffLine[] {
  const rows: ReviewDiffLine[] = [];
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const table: number[][] = Array.from({ length: oldCount + 1 }, (): number[] => Array.from({ length: newCount + 1 }, () => 0));
  for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newCount - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }

  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldCount || newIndex < newCount) {
    if (oldIndex < oldCount && newIndex < newCount && oldLines[oldIndex] === newLines[newIndex]) {
      rows.push({
        kind: "context",
        oldLine: oldIndex + 1,
        newLine: newIndex + 1,
        text: oldLines[oldIndex] ?? ""
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (newIndex < newCount && (oldIndex >= oldCount || table[oldIndex][newIndex + 1] >= table[oldIndex + 1][newIndex])) {
      rows.push({ kind: "added", newLine: newIndex + 1, text: newLines[newIndex] ?? "" });
      newIndex += 1;
      continue;
    }
    if (oldIndex < oldCount) {
      rows.push({ kind: "removed", oldLine: oldIndex + 1, text: oldLines[oldIndex] ?? "" });
      oldIndex += 1;
    }
  }
  return rows;
}

export function isContextSource(value: unknown): value is ContextSource {
  return value === "file" || value === "folder" || value === "virtual";
}

export function mentionKindRank(kind: MentionKind): number {
  if (kind === "category") return 0;
  if (kind === "session") return 1;
  if (kind === "skill") return 2;
  if (kind === "automation") return 3;
  if (kind === "action") return 4;
  if (kind === "command") return 5;
  if (kind === "file") return 6;
  return 7;
}

export function mentionPathKeywords(path: string, title: string): string[] {
  const parts = path.split(/[/\\._\s-]+/).filter(Boolean);
  return uniqueStrings([path, title, path.replace(/\.[^.]+$/, ""), ...parts]);
}

export function frontmatterKeywords(frontmatter: Record<string, unknown> | undefined): string[] {
  if (!frontmatter) return [];
  const keys = ["aliases", "alias", "tags", "tag", "title", "name", "summary", "description"];
  const values: string[] = [];
  for (const key of keys) {
    values.push(...flattenKeywordValue(frontmatter[key]));
  }
  return values;
}

export function flattenKeywordValue(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => flattenKeywordValue(item));
  return [];
}

export function rankSkillsForQuery(skills: CancipSkill[], query: string): CancipSkill[] {
  const normalized = query.toLocaleLowerCase();
  const tokens = uniqueStrings(normalized.split(/[^\p{L}\p{N}_.-]+/u).filter((token) => token.length >= 2));
  return skills
    .map((skill) => {
      const name = `${skill.name} ${skill.id}`.toLocaleLowerCase();
      const haystack = `${name} ${skill.path} ${skill.description} ${skill.triggers.join(" ")}`.toLocaleLowerCase();
      const score = tokens.reduce((sum, token) => sum + (name.includes(token) ? 8 : haystack.includes(token) ? 3 : 0), 0)
        + (/(?:pdf|ocr|文档解析|解析pdf)/i.test(normalized) && /(?:pdf|ocr)/i.test(haystack) ? 20 : 0)
        + skill.priority;
      return { skill, score };
    })
    .filter((item) => item.score > item.skill.priority || !tokens.length)
    .sort((a, b) => b.score - a.score || b.skill.priority - a.skill.priority || a.skill.name.localeCompare(b.skill.name))
    .map((item) => item.skill);
}

export function builtinCapabilityRoutes(chinese: boolean): CapabilityRoute[] {
  const local = (zh: string, en: string): string => chinese ? zh : en;
  return [
    {
      id: "vault-file-workflow",
      title: local("Vault 文件读写", "Vault file read/write"),
      purpose: local("读取、搜索、编辑、移动或打开笔记和附件。", "Read, search, edit, move, or open notes and attachments."),
      first: local("目标不清先 cancip.findTarget；明确后用 read 或小批量 patch/write/config。", "Use cancip.findTarget when the target is unclear; then read or apply a small patch/write/config action."),
      verify: local("写入后 read 回目标文件；打开后检查当前视图和活动文件。", "Read the target back after writes; inspect the current view and active file after opening."),
      fallback: local("目标仍不唯一就返回候选；读取失败换精确路径或小片段，不重复同一动作。", "If the target is still ambiguous, return candidates; on read failure use an exact path or smaller snippet instead of retrying unchanged."),
      source: "cancip.findTarget + read/write/patch + cancip.outcome.verify",
      keywords: ["vault", "file", "folder", "note", "markdown", "attachment", "文件", "文件夹", "笔记", "库", "读写", "打开"],
      priority: 100
    },
    {
      id: "obsidian-command-workflow",
      title: local("Obsidian 命令与界面", "Obsidian commands and UI"),
      purpose: local("查命令、按钮、标签页、当前视图和 UI 路线。", "Discover commands, buttons, tabs, the current view, and UI routes."),
      first: local("先 obsidian.listCommands/resolveCommand 或 obsidian.currentView、obsidian.ui.buttons；明确 ID 后再执行。", "Start with obsidian.listCommands/resolveCommand or currentView/ui.buttons; execute only after the exact ID or target is clear."),
      verify: local("用 cancip.outcome.observe/verify 对照视图、工作区、文件或插件状态。", "Use cancip.outcome.observe/verify against the view, workspace, file, or plugin state."),
      fallback: local("命令不通再查 UI、公开 API 或 obsidian.js.help/probe；不要直接猜 eval。", "If the command fails, inspect UI, public API, or obsidian.js.help/probe; do not guess with eval."),
      source: "obsidian.listCommands + currentView/ui.buttons + outcome.verify",
      keywords: ["obsidian", "command", "ui", "button", "tab", "workspace", "dom", "命令", "按钮", "标签页", "工作区", "界面"],
      priority: 96
    },
    {
      id: "plugin-discovery-workflow",
      title: local("插件能力发现", "Plugin capability discovery"),
      purpose: local("让 AI 先了解已安装插件的命令、公开 API、配置和 UI 入口。", "Discover installed-plugin commands, public APIs, settings, and UI entry points before acting."),
      first: local("用 cancip.pluginCapabilities 或 cancip.pluginRoute 查版本、命令、runtime/api、data.json 和文件入口。", "Use cancip.pluginCapabilities or cancip.pluginRoute to inspect version, commands, runtime/api, data.json, and file entry points."),
      verify: local("执行后验证插件状态、当前视图、目标文件或可见 UI 效果。", "Verify plugin state, current view, target file, or visible UI after execution."),
      fallback: local("没有公开入口时再查插件文件、obsidian.js.help/probe 或官方文档；把失败路线记入经验。", "If no public route is exposed, inspect plugin files, obsidian.js.help/probe, or official docs and record the failed route."),
      source: "cancip.pluginCapabilities -> pluginRoute/pluginAction -> outcome.verify",
      keywords: ["plugin", "plugins", "api", "runtime", "manifest", "data.json", "notedraw", "pdftion", "插件", "公开接口", "能力", "配置"],
      priority: 94
    },
    {
      id: "skill-experience-workflow",
      title: local("Skill 与成功经验", "Skills and verified experience"),
      purpose: local("复用已经成功的常见流程，避免每次从头试错。", "Reuse successful workflows instead of rediscovering them on every task."),
      first: local("先 cancip.skills.list/read，再查 cancip.experience.list；只注入最匹配的一两项。", "Use cancip.skills.list/read first, then cancip.experience.list; inject only the one or two closest routes."),
      verify: local("实际执行并读回/观察验证；只有有证据的成功才沉淀。", "Execute and verify with read-back or observation; promote only evidence-backed success."),
      fallback: local("没有命中就查库内相关指南或插件能力，不直接宣称不存在；重复成功后 harvest。", "If nothing matches, search targeted Vault guides or plugin capability data instead of declaring it unavailable; harvest after repeated success."),
      source: "cancip.skills.list/read + experience.list/harvest",
      keywords: ["skill", "skills", "workflow", "recipe", "experience", "memory", "经验", "技能", "流程", "配方", "复用", "沉淀"],
      priority: 92
    },
    {
      id: "memory-vault-search-workflow",
      title: local("记忆与库内检索", "Memory and Vault retrieval"),
      purpose: local("按需查询记忆、会话、自动化、Skill、笔记和配置，而不是全库预加载。", "Query memory, sessions, automations, Skills, notes, and config on demand instead of preloading the Vault."),
      first: local("先读 CANCIP_INDEX/RULES 和轻量索引；不足时用 cancip.searchVault/cancip.sessionHistory 精确命中。", "Read CANCIP_INDEX/RULES and lightweight indexes first; use cancip.searchVault/sessionHistory only when needed."),
      verify: local("确认命中文件、会话 ID、更新时间和片段与当前问题一致。", "Confirm the matched path, session ID, timestamp, and excerpt actually fit the current task."),
      fallback: local("硬搜索无结果再查相邻路径或软搜索/网络；不把未读过的内容当事实。", "If hard search misses, try adjacent paths or soft/web search; never treat unread content as fact."),
      source: "memory index + universal search + session history",
      keywords: ["memory", "search", "session", "history", "automation", "wiki", "记忆", "搜索", "会话", "历史", "自动化", "知识库"],
      priority: 90
    },
    {
      id: "document-attachment-workflow",
      title: local("PDF、Office 与外部文件", "PDF, Office, and external files"),
      purpose: local("预览、解析、编辑或转换 PDF、DOCX、XLSX、PPTX、HTML 和图片。", "Preview, parse, edit, or convert PDF, DOCX, XLSX, PPTX, HTML, and images."),
      first: local("先 cancip.documents.help/attachment.help，按文件类型选择工作台、解析器或转换入口。", "Start with cancip.documents.help/attachment.help and choose the workbench, parser, or converter by file type."),
      verify: local("保存或转换后读回原/输出文件，并核对视图、页数、表格或文字。", "Read the source/output back after saving or converting and check view, pages, tables, or text."),
      fallback: local("文本层/编码不对就换解析路线；原文件受保护时输出编辑稿，不假报原位保存。", "If text or encoding is wrong, change the parser; when the original is protected, use an edit copy and do not claim in-place save."),
      source: "documents.help/open/convert + attachment.help + outcome.verify",
      keywords: ["pdf", "docx", "xlsx", "pptx", "html", "image", "office", "attachment", "文件预览", "转换", "表格", "图片"],
      priority: 86
    },
    {
      id: "automation-background-workflow",
      title: local("自动化与后台任务", "Automations and background tasks"),
      purpose: local("查询、运行和验证自动化，不把后台任务蹭进当前会话。", "List, run, and verify automations without mixing background work into the current chat."),
      first: local("用 cancip.automation.list/templates 找任务，明确任务后 cancip.automation.run。", "Use cancip.automation.list/templates, then run the selected task with cancip.automation.run."),
      verify: local("检查运行状态、专用会话、结果路径、通知/静默设置和实际输出。", "Check run status, dedicated session, result path, notification/silent settings, and actual output."),
      fallback: local("显示成功但无结果时读运行记录和专用会话，按真实错误修路线，不重复点击。", "If it says success without output, inspect the run record and dedicated session, then correct the real error instead of clicking again."),
      source: "automation.list/templates/run + sessionHistory + outcome.verify",
      keywords: ["automation", "background", "schedule", "task", "silent", "notification", "自动化", "后台", "定时", "任务", "静默", "通知"],
      priority: 84
    },
    {
      id: "verification-recovery-workflow",
      title: local("执行验证与失败恢复", "Verification and recovery"),
      purpose: local("把模型说成功和真实效果分开，形成执行、核对、纠偏闭环。", "Separate model claims from actual effects with an execute-check-correct loop."),
      first: local("动作前明确 precondition，动作后用 read/status/currentView/outcome.observe 检查。", "State the precondition, then check with read/status/currentView/outcome.observe after the action."),
      verify: local("只接受文件内容、插件状态、视图或工作区等可观察证据。", "Accept only observable evidence from file content, plugin state, view, or workspace."),
      fallback: local("只修测到的差异，有限重试；仍失败就返回具体动作、错误和缺失能力。", "Correct only measured differences with bounded retries; otherwise report the exact action, error, and missing capability."),
      source: "cancip.outcome.observe/verify/capture + tool result loop",
      keywords: ["verify", "observe", "result", "failure", "retry", "evidence", "验证", "核对", "失败", "恢复", "结果", "证据"],
      priority: 82
    }
  ];
}

export function scoreCapabilityRoute(route: CapabilityRoute, query: string): number {
  const normalized = query.toLocaleLowerCase().trim();
  if (!normalized) return route.priority;
  const compact = normalized.replace(/\s+/g, "");
  let score = route.priority;
  if (compact.includes(route.id.replace(/-/g, ""))) score += 120;
  const tokens = uniqueStrings(normalized.split(/[^\p{L}\p{N}_.-]+/u).filter((token) => token.length >= 2));
  const haystack = `${route.id} ${route.title} ${route.purpose} ${route.keywords.join(" ")}`.toLocaleLowerCase();
  for (const token of tokens) {
    if (haystack.includes(token)) score += route.keywords.some((keyword) => keyword.toLocaleLowerCase().includes(token)) ? 12 : 5;
  }
  return score;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function newsBriefLooksExplicitlyOld(item: NewsBriefItem, currentYear: number): boolean {
  const text = `${item.title} ${item.summary} ${item.link}`;
  const years = [...text.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map((match) => Number.parseInt(match[1], 10));
  return years.some((year) => Number.isFinite(year) && year <= currentYear - 2);
}

export function defaultAcceptanceCapabilityClasses(): AcceptanceCapabilityClass[] {
  return [
    {
      id: "mobile-shell",
      title: "启动、侧边栏、键盘和移动布局",
      source: "清单 2/3/11",
      priority: "P0",
      route: "observe currentView/dom -> outcome.verify layout -> only fix measured CSS/DOM deltas",
      expected: ["无白屏或重复空页", "输入框、@ 菜单、底部审核不被键盘/状态栏挡住"],
      variants: [
        "冷启动后打开 Cancip，输入三行文字再收起键盘",
        "PDF 或右侧栏页面返回 Cancip 后再点 @ 菜单",
        "横竖屏切换后展开软键盘，确认输入框和聊天底部仍可见",
        "大字体模式从工作台返回侧边栏，确认不白屏、不新建空标签页"
      ]
    },
    {
      id: "simple-final",
      title: "简单任务直接短答",
      source: "清单 2/4.1",
      priority: "P0",
      route: "no tool unless needed -> concise final -> programmatic stats only",
      expected: ["不硬塞计划和工具", "最终回答只有用户要的答案和程序化统计"],
      variants: [
        "当前 Cancip 是什么版本？只回答版本号",
        "你好，用一句话回答",
        "2 加 3 等于多少？只回答数字",
        "用五个字以内说明当前交流语言"
      ]
    },
    {
      id: "continue-final",
      title: "复杂任务继续、验证和最终回答",
      source: "清单 4.2/4.3/4.4",
      priority: "P0",
      route: "minimal inspect -> action -> read/observe verify -> final only after verified or exact blocker",
      expected: ["计划不冒充最终回答", "失败说清动作、原因、最小介入"],
      variants: [
        "检查当前文件重复标题；有就修复并验证",
        "先说明怎么核对当前文件链接，再真正核对到结论",
        "核对当前笔记 frontmatter；缺少 updated 就补上并读回",
        "分析当前文件中的失效链接，能确定的修复，不能确定的给出具体阻塞"
      ]
    },
    {
      id: "process-records",
      title: "过程记录、原始收发和可追溯反馈",
      source: "清单 5/10/18",
      priority: "P0",
      route: "visible concise steps -> folded raw sent/received/tool detail -> copy/wrap available",
      expected: ["发了什么、收了什么、工具结果都分层", "可读摘要具体，不显示废话或大段 JSON"],
      variants: [
        "读取这轮发给模型和模型返回的原始内容，只放过程记录",
        "连续工具失败后查看过程记录，确认每次结果和下一步不同",
        "执行读文件再打开文件，核对每个序号步骤只有一份原始发送和接收",
        "任务结束后手动展开一个原文，确认不会联动展开其他原文或自动折叠"
      ]
    },
    {
      id: "context-token",
      title: "Token、上下文裁剪和去重",
      source: "清单 5",
      priority: "P0",
      route: "payload policy -> relevant memory/skills only -> dedupe prompts/tool results",
      expected: ["用户原话不重复发送", "长会话不无限增长，不串其他会话"],
      variants: [
        "我是谁？只给三条最重要的信息",
        "长会话里再次问同一件事，只带必要上下文",
        "询问一个明确记忆偏好，确认无关插件经验没有挤掉核心记忆",
        "连续两次工具返回相同结果，确认第二轮不会重复发送完整旧结果"
      ]
    },
    {
      id: "memory-skill-search",
      title: "记忆、Skill、工具和搜索路由",
      source: "清单 6",
      priority: "P1",
      route: "CANCIP_INDEX/RULES -> skills.list/read -> experience.list -> targeted vault/plugin search",
      expected: ["先查索引再读具体项", "成熟路线优先复用，失败沉淀"],
      variants: [
        "我的 OB 整理偏好是什么？只读必要记忆",
        "找一个适合解析 PDF 的 Skill，并说明实际入口",
        "把 noredraw 当作可能的插件错拼，找出最可能目标并说明置信度",
        "记忆索引过期时从实际文件和插件状态恢复目标，不直接回答没有"
      ]
    },
    {
      id: "read-write-review",
      title: "读取、写入、批准和审核闭环",
      source: "清单 7",
      priority: "P0",
      route: "find/read target -> write/patch through access mode -> review gate -> readback verify",
      expected: ["只读不询问", "写入进审核，审核数量准确，取消可恢复"],
      variants: [
        "读取 Cancip验收测试清单.md 的标题和更新时间，不修改",
        "在 Cancip验收-临时/创建含表格的测试笔记并读回",
        "修改 Cancip验收-临时/手机 写入 测试.md 两次，审核只保留人工基线到最新版",
        "拒绝 Cancip验收-临时/测试(1).md 的待执行改动，确认文件和审核数字恢复"
      ]
    },
    {
      id: "obsidian-command-plugin",
      title: "Obsidian 命令、插件发现和 JS Bridge",
      source: "清单 8/16",
      priority: "P0",
      route: "list/resolve/pluginCapabilities/js.probe -> execute/pluginAction/eval -> outcome.verify",
      expected: ["命令执行后验证可见效果", "新插件不靠写死名称"],
      variants: [
        "打开今日日记并验证当前文件路径",
        "只读分析当前安装插件的命令/API/UI 可执行路线",
        "用英文命令用途查找阅读视图候选，只解析不执行",
        "用只读 JS probe 返回 activeFile、activeView 和启用插件数量"
      ]
    },
    {
      id: "plan-queue-background",
      title: "计划、排队、继续和后台运行",
      source: "清单 9",
      priority: "P1",
      route: "todo action for real plans -> queue state -> resumable task -> session running indicators",
      expected: ["简单任务不硬凑计划", "停止/失败后可继续且不丢状态"],
      variants: [
        "把检查当前笔记链接的问题分成必要步骤并执行",
        "任务运行时排队发送第二条检查标题层级",
        "排队三条任务后删除中间项并把最后一项拖到第一位",
        "停止一个两步任务后继续，确认从最近真实工具结果恢复"
      ]
    },
    {
      id: "session-history-sync",
      title: "会话历史、事件审计和同步",
      source: "清单 10",
      priority: "P0",
      route: "sessionHistory/events -> lazy load -> canonical synced files -> stale-state repair",
      expected: ["历史打开快，不串台", "同步设备数量一致或能说明滞后文件"],
      variants: [
        "打开历史后返回当前会话，运行状态不丢",
        "读取指定 session 并分析失败原因，不串入当前会话",
        "会话索引滞后但 session 文件存在时刷新历史并恢复该会话",
        "运行中切到另一会话再返回，确认原会话工具和最终回答不串台"
      ]
    },
    {
      id: "mention-attachment",
      title: "输入框、@ 菜单、选区和附件",
      source: "清单 11",
      priority: "P1",
      route: "mention categories -> lazy filtered lists -> attachment parser help -> chip state verify",
      expected: ["@ 分类人能看懂", "取消附件不创建空 chip，同名不互串"],
      variants: [
        "@ 自动化后按后续输入匹配任务并运行",
        "选择 PDF/Excel/未知扩展名附件后说明实际发送内容",
        "@ 当前文件和 @ Skill 连续选择后编辑引用，取消弹窗不丢输入框",
        "取消系统附件选择器，确认没有空附件和错误提示"
      ]
    },
    {
      id: "model-api-recovery",
      title: "模型、API 和失败恢复",
      source: "清单 12",
      priority: "P0",
      route: "bound model source -> retries/backoff -> partial continuation -> exact model/source errors",
      expected: ["空回复/截断/429 不假成功", "模型源大小写和绑定稳定"],
      variants: [
        "低级模型执行常规读写任务不中途停住",
        "切换模型源后模型列表仍可用",
        "模拟空回复后按慢退避重试并保留原会话",
        "模拟截断或 429 后从缺口继续，不重复完整结果"
      ]
    },
    {
      id: "tts-markdown-pdf",
      title: "TTS、Markdown 和 PDF",
      source: "清单 13/16",
      priority: "P1",
      route: "tts.help/status/readActive -> current view/PDF probe -> visible highlight verification",
      expected: ["朗读提示正确", "高亮位置和播放状态稳定"],
      variants: [
        "从 Markdown 当前屏幕顶部开始朗读并停止",
        "朗读 PDF 当前可见区域后继续到文件结束",
        "朗读中英数字混合待办，切换上一块后自动继续",
        "停止扫描型 PDF 朗读，确认提示具体解析限制且悬浮窗不复活"
      ]
    },
    {
      id: "automation-curation",
      title: "自动化、零点整理和新文件整理",
      source: "清单 14",
      priority: "P1",
      route: "automation.list/status -> dedicated session -> startup grace -> real result/log/status verify",
      expected: ["静默只是不自动打开", "0 点未跑当天补跑，新文件候选准确"],
      variants: [
        "手动运行新文件整理并查看候选/跳过原因",
        "检查每日整理是否汇总成功失败、记忆和 Skill",
        "零点任务错过计划时间后启动 Obsidian，确认当天只补跑一次",
        "同时新建混乱长文和整洁短文，确认只整理必要候选并记录链接依据"
      ]
    },
    {
      id: "button-statusbar",
      title: "按钮管理和状态栏",
      source: "清单 15",
      priority: "P1",
      route: "ui.buttons/buttonRules -> apply rules -> DOM/status verify",
      expected: ["长按设置不误触原功能", "状态栏数字/蓝标不闪断"],
      variants: [
        "隐藏一个按钮再显示所有隐藏按钮",
        "调整文件列表置顶顺序并取消置顶",
        "长按纯图标按钮进入设置后取消，确认不触发原命令",
        "复制一个按钮到同级区域并重载，确认图标、命令和排序保持"
      ]
    },
    {
      id: "workbench-docs",
      title: "工作台、HTML/Office/PDF 转换和 NoteDraw 互通",
      source: "清单 11/13/20 扩散",
      priority: "P1",
      route: "documents.help/open/convert -> workbench state -> NoteDraw/annotation route -> save/readback",
      expected: ["常见文件默认工作台打开", "预览/源码/编辑保存后原文件或导出文件可验证"],
      variants: [
        "用工作台打开 xlsx 并搜索/朗读可见内容",
        "编辑 html 预览文字并保存读回验证",
        "把未知文本后缀按 Markdown 源码打开，编辑后确认原文件同步变化",
        "在工作台预览上调用 NoteDraw 涂鸦，滚动后位置稳定并可跨重载恢复"
      ]
    },
    {
      id: "autocomplete",
      title: "侧边栏和笔记自动补全",
      source: "近期用户反馈扩散",
      priority: "P1",
      route: "cursor/context gate -> one active request -> candidates/children cache -> usage preference ledger",
      expected: ["无光标不请求，有光标才补", "选择后立即显示预加载下一级"],
      variants: [
        "笔记编辑视图有光标但未输入时触发补全",
        "侧边栏输入为空显示问 Cancip 且不转圈",
        "光标后紧贴文字时不补全，移到行尾后只发起一个请求",
        "选择一级补全后立即显示已预载子项，并仅在请求下一级时转圈"
      ]
    },
    {
      id: "github-release",
      title: "GitHub 只读和发布闭环",
      source: "清单 17",
      priority: "P1",
      route: "github.help/status/repo/releases/workflowRuns -> publish only when explicitly requested",
      expected: ["只读不暴露 token", "发布核对版本、commit、tag、release 资产"],
      variants: [
        "查看 Cancip 仓库最新 commit 和最近 release",
        "明确推 GitHub 时提交、推送、release 并核验",
        "只读查看最近一次 Actions 状态，不输出 token 或旧缓存",
        "发布前发现三件套版本不一致时停止发布并给出具体差异"
      ]
    },
    {
      id: "resource-learning",
      title: "Vault/插件预学习和实时学习",
      source: "用户根因要求 + 清单 6/8/18",
      priority: "P0",
      route: "necessary context first -> targeted vault/skill/automation/session/memory/plugin resources -> experience/skill harvest",
      expected: ["不熟悉时先查本地资源", "成功失败及时沉淀，重复失败不原样重试"],
      variants: [
        "让 Cancip 分析一个失败会话并提出通用修复路线",
        "新插件能力未知时只读发现命令/API/UI 并保存可复用路线",
        "重复完成同类 Vault 写入后复用已有经验，减少工具步骤",
        "插件版本变化使旧路线失败时刷新能力指纹并替换失效经验"
      ]
    },
    {
      id: "acceptance-loop",
      title: "验收变异测试和反馈循环改良",
      source: "清单 18/19/20 + 当前用户要求",
      priority: "P0",
      route: "acceptance.plan -> run distinct variants -> observe/verify -> acceptance.record -> status -> fix root cause -> rerun",
      expected: ["每类基准任务和三个不同变体全部高质量通过才完成", "记录问题、模型、结果、时间、步骤、token"],
      variants: [
        "从验收清单抽取 P0 能力并给出待测缺口",
        "记录一个失败用例后生成下一次不同变异测试",
        "同类已有三条通过时显示仍缺一条，不提前标记完成",
        "失败修复后重跑原任务和新变体，证据不足时不得记录 high/pass"
      ]
    }
  ];
}

export function acceptanceStatusFromArg(value: unknown): AcceptanceResultStatus {
  const text = String(value ?? "").trim().toLowerCase();
  if (/^(pass|passed|ok|success|✅|通过|成功)$/.test(text)) return "pass";
  if (/^(warn|warning|partial|⚠️|警告|部分|勉强)$/.test(text)) return "warn";
  if (/^(skip|skipped|⏭️|跳过|略过)$/.test(text)) return "skip";
  if (/^(fail|failed|error|❌|失败|错误)$/.test(text)) return "fail";
  return "fail";
}

export function acceptanceQualityFromArg(value: unknown, status: AcceptanceResultStatus): AcceptanceResultQuality {
  const text = String(value ?? "").trim().toLowerCase();
  if (/^(high|good|excellent|stable|高|高质量|稳定)$/.test(text)) return "high";
  if (/^(ok|medium|acceptable|一般|可接受|中)$/.test(text)) return "ok";
  if (/^(low|bad|poor|低|差)$/.test(text)) return "low";
  if (status === "pass") return "high";
  if (status === "warn") return "ok";
  return "low";
}

export function acceptanceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value.filter((item): item is string => typeof item === "string").map((item) => trimContext(redactSensitiveText(item), 500)).filter(Boolean));
  if (typeof value === "string" && value.trim()) {
    return uniqueStrings(value.split(/\r?\n|[,，;；]/).map((item) => trimContext(redactSensitiveText(item.trim()), 500)).filter(Boolean));
  }
  return [];
}

export function acceptanceTokenUsageFromValue(value: unknown): TurnModelUsage | null {
  if (!isRecord(value)) return null;
  return {
    calls: clampInt(value.calls, 0, 0, 999),
    inputChars: clampInt(value.inputChars, 0, 0, 999999999),
    outputChars: clampInt(value.outputChars, 0, 0, 999999999),
    inputTokens: clampInt(value.inputTokens, 0, 0, 999999999),
    outputTokens: clampInt(value.outputTokens, 0, 0, 999999999),
    totalTokens: clampInt(value.totalTokens, 0, 0, 999999999),
    cacheReadTokens: clampInt(value.cacheReadTokens, 0, 0, 999999999),
    cacheWriteTokens: clampInt(value.cacheWriteTokens, 0, 0, 999999999),
    reasoningTokens: clampInt(value.reasoningTokens, 0, 0, 999999999),
    estimated: value.estimated === true
  };
}

export function acceptanceStatusBadge(status: AcceptanceResultStatus): string {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  if (status === "skip") return "⏭️";
  return "❌";
}

export function upsertMarkedTextBlock(existing: string, startMarker: string, endMarker: string, block: string): string {
  const start = existing.indexOf(startMarker);
  if (start < 0) return [existing.trimEnd(), block].filter(Boolean).join("\n\n");
  const end = existing.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return `${existing.slice(0, start).trimEnd()}\n\n${block}`;
  return `${existing.slice(0, start).trimEnd()}\n\n${block}\n\n${existing.slice(end + endMarker.length).trimStart()}`.trimEnd();
}

export function updateAcceptanceReportCaseStatus(content: string, caseId: string, status: string): string {
  return content.split(/\r?\n/).map((line) => {
    if (!line.startsWith("|")) return line;
    const cells = line.split("|");
    if (cells.length < 6 || cells[1]?.trim() !== caseId) return line;
    cells[cells.length - 2] = ` ${status} `;
    return cells.join("|");
  }).join("\n");
}

export function parseSimpleFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const raw = match[1] ?? "";
  const result: Record<string, unknown> = {};
  let currentKey = "";
  let blockKey = "";
  let blockIndent = 0;
  let blockLines: string[] = [];
  const flushBlock = () => {
    if (!blockKey) return;
    result[blockKey] = blockLines.map((line) => line.trimEnd()).join("\n").trim();
    blockKey = "";
    blockIndent = 0;
    blockLines = [];
  };
  for (const line of raw.split(/\r?\n/)) {
    if (blockKey) {
      if (!line.trim()) {
        blockLines.push("");
        continue;
      }
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      const startsNewKey = indent === 0 && /^([A-Za-z0-9_-]+):\s*/.test(line);
      if (!startsNewKey && indent >= blockIndent) {
        blockLines.push(line.slice(Math.min(blockIndent, line.length)));
        continue;
      }
      flushBlock();
    }
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValue) {
      currentKey = keyValue[1];
      const rawValue = keyValue[2] ?? "";
      if (rawValue.trim() === ">" || rawValue.trim() === "|") {
        blockKey = currentKey;
        blockIndent = 2;
        blockLines = [];
      } else {
        result[currentKey] = parseFrontmatterScalar(rawValue);
      }
      continue;
    }
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentKey) {
      const existing = result[currentKey];
      const values = Array.isArray(existing) ? existing : existing ? [existing] : [];
      values.push(parseFrontmatterScalar(listItem[1] ?? ""));
      result[currentKey] = values;
    }
  }
  flushBlock();
  return result;
}

export function parseFrontmatterScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

export function firstStringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) return item.trim();
      }
    }
  }
  return "";
}

export function firstUsefulSkillParagraph(content: string): string {
  const body = content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    const trimmed = block
      .replace(/^#+\s+.+$/gm, "")
      .replace(/^\s*[-*]\s+/gm, "")
      .trim();
    if (trimmed.length >= 20) return trimContext(trimmed.replace(/\s+/g, " "), 240);
  }
  return "";
}

export function skillIdFromPathAndName(path: string, name: string): string {
  const raw = (name || path)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || stableTextHash(path).slice(0, 10);
}

export function normalizeSkillDedupeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function skillMentionKeywords(skill: CancipSkill): string[] {
  return uniqueStrings([
    skill.id,
    skill.name,
    skill.path,
    skill.folder,
    skill.description,
    ...skill.triggers,
    ...mentionPathKeywords(skill.path, skill.name)
  ]);
}

export function isSkillListQuery(query: string): boolean {
  const compact = query.toLowerCase().replace(/\s+/g, "");
  return compact === "skill" || compact === "skills" || compact === "技能" || compact === "能力" || compact === "skillob";
}

export function shouldAutoSelectSkills(prompt: string): boolean {
  if (isTrivialChatPrompt(prompt)) return false;
  if (extractMentionTokens(prompt).some((token) => token.toLowerCase().includes("skill") || /技能|能力/.test(token))) return true;
  if (promptNeedsSkillExperienceRoute(prompt) || capabilityPromptMentionsSkillOrExperienceSurface(prompt)) return true;
  return classifyPromptIntent(prompt) !== "trivial";
}

export function promptNeedsAdhdSkillRoute(prompt: string): boolean {
  if (/(?:^|\s)\/adhd\b|adhd\s*(?:mode|模式)|使用\s*adhd|用\s*adhd|发散模式/i.test(prompt)) return true;
  if (/(?:\bquick\b|\bstandard\b|\bcanonical\b|\btextbook\b|\bone[- ]?line\b|快速|直接回答|只要一个|一句话|标准答案|教科书答案)/i.test(prompt)) return false;
  const openEnded = /(brainstorm|ideat(?:e|ion)|divergent|alternatives?|multiple approaches|architecture|public api|schema design|naming|fuzzy debug|unknown root cause|头脑风暴|发散|创意|多个方案|多种方案|不同方案|架构|接口设计|命名|根因不明|模糊问题|多角度)/i.test(prompt);
  const consequential = /(architecture|public api|schema|product|system design|strategy|workflow|high[- ]?stakes|unknown root cause|架构|公共接口|数据模型|产品|系统设计|策略|工作流|长期|关键决策|高风险|根因不明)/i.test(prompt);
  return openEnded && consequential;
}

export function promptNeedsCavemanSkillRoute(prompt: string): boolean {
  return /(caveman|原始人|低\s*token|省\s*token|少\s*token|token\s*(?:少|低|压缩)|less\s+tokens?|token\s+efficien|be\s+brief|concise|精简|简洁|简短|少废话|高信息密度|压缩回复|回复短一点)/i.test(prompt);
}

export function preferredBuiltinSkillIdsForPrompt(prompt: string): string[] {
  const ids: string[] = [];
  if (promptNeedsMemorySkillRoute(prompt)) ids.push("memory-system");
  if (promptNeedsAdhdSkillRoute(prompt)) ids.push("adhd");
  if (promptNeedsCavemanSkillRoute(prompt)) ids.push("caveman");
  return ids;
}

export function scoreSkillForPrompt(skill: CancipSkill, prompt: string): number {
  const normalizedPrompt = prompt.toLowerCase();
  const tokens = tokenize(prompt);
  if (!tokens.length && !normalizedPrompt.trim()) return 0;
  const fields = [
    skill.id,
    skill.name,
    skill.path,
    skill.folder,
    skill.description,
    ...skill.triggers
  ].map((item) => item.toLowerCase()).filter(Boolean);
  let score = 0;
  const compactPrompt = normalizedPrompt.replace(/\s+/g, "");
  const compactName = skill.name.toLowerCase().replace(/\s+/g, "");
  const fieldText = fields.join("\n");
  if (compactPrompt.includes(compactName)) score += 120;
  if (compactPrompt.includes(skill.id.toLowerCase())) score += 100;
  for (const token of tokens) {
    for (const field of fields) {
      if (field === token) score += 20;
      else if (field.startsWith(token)) score += 12;
      else if (field.includes(token)) score += 6;
    }
  }
  if (/skill|技能|能力|agent|代理|智能体/i.test(prompt) && skill.priority >= 90) score += 18;
  if (promptNeedsMemorySkillRoute(prompt) && /(memory|remember|preference|profile|wal|context|记忆|偏好|规则|用户)/i.test(fieldText)) score += 42;
  if (promptNeedsExperienceSkillRoute(prompt) && /(experience|workflow|skill|harvest|observer|optimizer|recipe|复盘|经验|流程|沉淀|收割|优化)/i.test(fieldText)) score += 38;
  if (promptNeedsObsidianSkillRoute(prompt) && /(obsidian|vault|markdown|plugin|command|pdf|note|button|automation|\bob\b|插件|笔记|命令|按钮|自动化)/i.test(fieldText)) score += 34;
  if (promptNeedsSkillExperienceRoute(prompt) && /(skill|agent|capability|workflow|mcp|openclaw|hermes|claude|技能|能力|智能体)/i.test(fieldText)) score += 24;
  if (score > 0) score += Math.min(24, skill.priority / 5);
  return score;
}

export function isSkillLikeMention(path: string, title: string): boolean {
  const text = `${path}\n${title}`.toLowerCase();
  return /(^|[/\\._\s-])skills?($|[/\\._\s-])/.test(text) || text.includes("skillob") || text.includes("skill.md") || /技能|能力/.test(text);
}

export function mentionQueryParts(query: string): string[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const parts = q.split(/[\s/\\._:-]+/).filter(Boolean);
  const cjk = q.match(/[\u4e00-\u9fff]/g) ?? [];
  return uniqueStrings([q, ...parts, ...cjk]);
}

export function scoreMentionTarget(target: MentionTarget, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return target.score;

  const path = target.path.toLowerCase();
  const title = target.title.toLowerCase();
  const detail = target.detail.toLowerCase();
  const fields = [path, title, detail, ...target.keywords.map((keyword) => keyword.toLowerCase())];
  let score = 0;
  let matched = false;

  if (title === q || path === q || `${target.kind}:${path}` === q) {
    score += 140;
    matched = true;
  }
  if ((target.source === "file" || target.kind === "skill") && path.replace(/\.[^.]+$/, "") === q) {
    score += 120;
    matched = true;
  }
  if (title.startsWith(q)) {
    score += 92;
    matched = true;
  }
  if (path.startsWith(q)) {
    score += 72;
    matched = true;
  }
  if (title.includes(q)) {
    score += 58;
    matched = true;
  }
  if (path.includes(q)) {
    score += 42;
    matched = true;
  }

  for (const part of mentionQueryParts(q)) {
    for (const field of fields) {
      if (field === part) {
        score += 24;
        matched = true;
      } else if (field.startsWith(part)) {
        score += 16;
        matched = true;
      } else if (field.includes(part)) {
        score += 9;
        matched = true;
      }
    }
  }

  if (!matched) return 0;
  score += Math.min(target.score, 35);
  if (target.kind === "category") score += 12;
  if (target.kind === "session") score += 9;
  if (target.kind === "automation") score += 8;
  if (target.kind === "action") score += 8;
  if (target.kind === "command") score += 7;
  if (target.kind === "skill") score += 6;
  if (target.source === "folder") score += Math.min(10, target.path.split("/").length * 2);
  if (path.includes("skillob") || title.includes("skillob")) score += 30;
  return score;
}

export function formatObsidianCommandHotkeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!isRecord(item)) return "";
      const modifiers = Array.isArray(item.modifiers)
        ? item.modifiers.filter((modifier): modifier is string => typeof modifier === "string" && modifier.trim().length > 0)
        : [];
      const key = typeof item.key === "string" ? item.key.trim() : "";
      return [...modifiers, key].filter(Boolean).join("+");
    })
    .filter(Boolean);
}

export function sameObsidianCommandSnapshot(a: ObsidianCommandSnapshot, b: ObsidianCommandSnapshot): boolean {
  return a.activeFile === b.activeFile
    && a.viewType === b.viewType
    && a.displayText === b.displayText
    && a.editorTextHash === b.editorTextHash
    && a.editorCursor === b.editorCursor
    && a.modalText === b.modalText
    && a.activeLeafText === b.activeLeafText
    && a.workspaceText === b.workspaceText
    && a.sideDockText === b.sideDockText
    && a.statusText === b.statusText;
}

export function formatObsidianCommandSnapshot(snapshot: ObsidianCommandSnapshot): string {
  const parts = [
    snapshot.activeFile ? `activeFile=${snapshot.activeFile}` : "activeFile=",
    snapshot.viewType ? `viewType=${snapshot.viewType}` : "",
    snapshot.displayText ? `displayText=${trimContext(snapshot.displayText, 80)}` : "",
    snapshot.editorTextHash ? `editorHash=${snapshot.editorTextHash}` : "",
    snapshot.editorCursor ? `cursor=${snapshot.editorCursor}` : "",
    snapshot.activeLeafText ? `activeLeaf=${trimContext(snapshot.activeLeafText, 100)}` : "",
    snapshot.modalText ? `modal=${trimContext(snapshot.modalText, 80)}` : "",
    snapshot.workspaceText ? `workspace=${trimContext(snapshot.workspaceText, 110)}` : "",
    snapshot.sideDockText ? `sidedock=${trimContext(snapshot.sideDockText, 70)}` : "",
    snapshot.statusText ? `status=${trimContext(snapshot.statusText, 80)}` : ""
  ].filter(Boolean);
  return parts.join("; ");
}

export function obsidianEvalCodeWithImplicitReturn(rawCode: string): string {
  const code = rawCode.trim();
  if (!code || /\breturn\b/.test(code)) return rawCode;
  const lines = code.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || /^\/\//.test(trimmed)) continue;
    if (/^\(?\s*(?:async\s+)?function\b/.test(trimmed)) return rawCode;
    if (/^\s*(?:if|for|while|switch|try|catch|finally|class|const|let|var|await|throw|return|import|export)\b/.test(trimmed)) return rawCode;
    if (!/^(?:\([\s\S]*\)|\[[\s\S]*\]|\{[\s\S]*\})\s*;?$/.test(trimmed)) return rawCode;
    const indent = line.match(/^\s*/)?.[0] ?? "";
    lines[index] = `${indent}return ${trimmed.replace(/;$/, "")};`;
    return lines.join("\n");
  }
  return rawCode;
}

export function isObsidianEvalCommandAlias(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return normalized === "obsidian.eval"
    || normalized === "obsidian.js"
    || normalized === "obsidian.js.eval"
    || normalized === "obsidian.runjs"
    || normalized === "js.eval"
    || normalized === "js.run"
    || normalized === "javascript.eval"
    || normalized === "javascript.run"
    || normalized === "browser.eval"
    || normalized === "browser.js";
}

export function isObsidianJsHelpCommandAlias(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return normalized === "obsidian.js.help"
    || normalized === "obsidian.eval.help"
    || normalized === "js.help"
    || normalized === "javascript.help"
    || normalized === "browser.js.help";
}

export function isObsidianJsProbeCommandAlias(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  return normalized === "obsidian.js.probe"
    || normalized === "obsidian.eval.probe"
    || normalized === "js.probe"
    || normalized === "javascript.probe"
    || normalized === "browser.js.probe";
}

export function looksLikeDirectObsidianCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed || trimmed.includes("\n")) return false;
  if (/^(?:cancip|github|web|javascript|browser|js)\./i.test(trimmed)) return false;
  return /^[a-z0-9_-]+:[a-z0-9_:/.-]+$/i.test(trimmed);
}

export function normalizeObsidianCommandSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-:：/\\()[\]{}.,;，。；!！?？]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function obsidianCommandSearchTokens(input: string): string[] {
  const normalized = normalizeObsidianCommandSearchText(input);
  const words = normalized.split(/\s+/).filter((part) => part.length >= 2);
  const cjkPairs = normalized.match(/[\u4e00-\u9fff]{1,2}/g) ?? [];
  return uniqueStrings([...words, ...cjkPairs, ...tokenize(input), ...obsidianCommandSearchSynonyms(input)]).filter((token) => token.length >= 1);
}

export function obsidianCommandSearchSynonyms(input: string): string[] {
  const text = input.toLowerCase();
  const synonyms: string[] = [];
  const add = (...items: string[]) => synonyms.push(...items);
  if (/移动端|手机|安卓|android|mobile/.test(text)) add("mobile", "android");
  if (/导出|输出|汇出|匯出|export/.test(text)) add("export");
  if (/导入|输入|汇入|匯入|import/.test(text)) add("import");
  if (/打开|开启|開啟|显示|前往|进入|跳转|open|show|goto/.test(text)) add("open", "show");
  if (/关闭|关掉|close/.test(text)) add("close");
  if (/切换|转换|toggle|switch/.test(text)) add("toggle", "switch");
  if (/侧边|側邊|边栏|邊欄|面板|panel|sidebar|sidepanel/.test(text)) add("side", "sidebar", "sidepanel", "panel");
  if (/命令面板|命令菜单|command palette/.test(text)) add("command", "palette");
  if (/日记|日誌|每日|今天|今日|daily/.test(text)) add("daily", "note");
  if (/笔记|笔記|note/.test(text)) add("note");
  if (/文件|file/.test(text)) add("file");
  if (/标签页|頁籤|tab/.test(text)) add("tab");
  if (/涂鸦|塗鴉|绘图|繪圖|画图|畫圖|draw|drawing|sketch/.test(text)) add("draw", "drawing");
  if (/高亮|批注|標註|标注|annotation|annotate|highlight/.test(text)) add("annotation", "annotate", "highlight");
  if (/pdf|pdftion/.test(text)) add("pdf", "pdftion");
  if (/复习|複習|间隔重复|間隔重複|卡片|闪卡|閃卡|spaced|repetition|flashcard|srs|review/.test(text)) add("spaced", "repetition", "flashcard", "review", "srs");
  if (/预览|預覽|preview/.test(text)) add("preview");
  if (/刷新|重载|重建|refresh|reload|rebuild/.test(text)) add("refresh", "reload", "rebuild");
  if (/任务|任務|待办|待辦|task|todo/.test(text)) add("task", "tasks", "todo");
  if (/搜索|查找|find|search/.test(text)) add("search", "find");
  if (/复制|拷贝|copy/.test(text)) add("copy");
  if (/保存|save/.test(text)) add("save");
  return synonyms;
}

export function obsidianCommandRequiredVerbTokens(input: string): string[] {
  const text = input.toLowerCase();
  const verbs: string[] = [];
  const add = (token: string) => {
    if (!verbs.includes(token)) verbs.push(token);
  };
  if (/编辑|編輯|修改|edit/.test(text)) add("edit");
  if (/新建|创建|建立|create/.test(text)) add("create");
  if (/打开|开启|開啟|进入|跳转|open|goto/.test(text)) add("open");
  if (/显示|展示|show/.test(text)) add("show");
  if (/关闭|关掉|close/.test(text)) add("close");
  if (/切换|转换|toggle|switch/.test(text)) add("toggle");
  if (/导出|输出|汇出|匯出|export/.test(text)) add("export");
  if (/导入|输入|汇入|匯入|import/.test(text)) add("import");
  if (/刷新|重载|重建|refresh|reload|rebuild/.test(text)) add("refresh");
  if (/保存|save/.test(text)) add("save");
  if (/复制|拷贝|copy/.test(text)) add("copy");
  if (/删除|移除|delete|remove/.test(text)) add("delete");
  if (/搜索|查找|find|search/.test(text)) add("search");
  return verbs;
}

export function scoreObsidianCommand(entry: ObsidianCommandEntry, query: string): number {
  const raw = query.trim();
  if (!raw) return 0;
  const rawLower = raw.toLowerCase();
  const idLower = entry.id.toLowerCase();
  const nameLower = entry.name.toLowerCase();
  if (idLower === rawLower) return 1000;
  if (nameLower === rawLower) return 980;

  const q = normalizeObsidianCommandSearchText(raw);
  const qCompact = q.replace(/\s+/g, "");
  const id = normalizeObsidianCommandSearchText(entry.id);
  const name = normalizeObsidianCommandSearchText(entry.name);
  const hotkeys = normalizeObsidianCommandSearchText(entry.hotkeys.join(" "));
  const field = `${id} ${name} ${hotkeys}`.trim();
  const fieldCompact = field.replace(/\s+/g, "");
  const idNamespace = normalizeObsidianCommandSearchText(entry.id.split(":")[0] ?? "").replace(/\s+/g, "");
  let score = 0;

  if (id === q) score += 930;
  if (name === q) score += 900;
  if (id.startsWith(q)) score += 240;
  if (name.startsWith(q)) score += 230;
  if (field.includes(q)) score += 190;
  if (qCompact.length >= 3 && fieldCompact.includes(qCompact)) score += 175;
  if (/(移动端|手机|安卓|android|mobile)/i.test(raw) && idLower.includes("mobile-pdf-exporter")) score += 95;
  if (/\bpdftion\b|pdftion|批注|标注/i.test(raw) && idLower.startsWith("pdftion:")) score += 95;
  if (/spaced\s*repetition|flashcard|srs|间隔重复|复习|卡片|闪卡/i.test(raw) && idLower.startsWith("obsidian-spaced-repetition:")) score += 95;

  const tokens = obsidianCommandSearchTokens(raw);
  const idParts = id.split(/\s+/);
  const nameParts = name.split(/\s+/);
  const hotkeyParts = hotkeys.split(/\s+/);
  let matchedTokens = 0;
  let namespaceBonusApplied = false;
  for (const token of tokens) {
    const t = normalizeObsidianCommandSearchText(token);
    if (!t) continue;
    const tCompact = t.replace(/\s+/g, "");
    const shortAsciiToken = /^[a-z0-9]{1,2}$/i.test(t);
    const inId = shortAsciiToken ? idParts.some((part) => part === t) : id.includes(t);
    const inName = shortAsciiToken ? nameParts.some((part) => part === t) : name.includes(t);
    const inHotkey = shortAsciiToken ? hotkeyParts.some((part) => part === t) : hotkeys.includes(t);
    if (inId || inName || inHotkey) {
      matchedTokens += 1;
      score += inName ? 32 : inId ? 26 : 18;
      if (id.split(/\s+/).some((part) => part.startsWith(t))) score += 10;
      if (name.split(/\s+/).some((part) => part.startsWith(t))) score += 12;
    }
    if (!namespaceBonusApplied && idNamespace && tCompact && (idNamespace === tCompact || idNamespace.includes(tCompact) || tCompact.includes(idNamespace))) {
      score += idNamespace === tCompact ? 120 : 72;
      namespaceBonusApplied = true;
    }
  }
  if (tokens.length && matchedTokens === tokens.length) score += 90;
  if (tokens.length >= 2 && matchedTokens < Math.ceil(tokens.length * 0.6)) score -= 40;
  if (tokens.length >= 3 && matchedTokens < 2) score -= 140;
  for (const verb of obsidianCommandRequiredVerbTokens(raw)) {
    if (!field.includes(verb)) score -= 80;
  }
  if (/^(app|editor|workspace|file|command|obsidian)$/i.test(raw)) score -= 90;
  return Math.max(0, Math.round(score));
}

export function inferredPluginMethodRisk(method: string): PluginCompatibilityRisk {
  return /^(?:get|list|read|find|search|query|inspect|status|has|is|can|export|preview|snapshot)/i.test(method)
    ? "read"
    : /(?:delete|remove|destroy|reset|clear|purge|overwrite|replaceall|drop)/i.test(method)
      ? "high"
      : /(?:write|save|update|set|create|insert|append|move|rename|import)/i.test(method)
        ? "write"
        : "effect";
}

export function normalizePluginCompatibilityText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s_./:\\-]+/g, " ").trim();
}

export function scorePluginCompatibilityAction(action: PluginCompatibilityActionDefinition, query: string): number {
  const normalizedQuery = normalizePluginCompatibilityText(query);
  const id = normalizePluginCompatibilityText(action.id);
  const title = normalizePluginCompatibilityText(action.title);
  const haystack = normalizePluginCompatibilityText([action.id, action.title, action.description ?? "", ...(action.keywords ?? [])].join(" "));
  if (!normalizedQuery) return 0;
  let score = 0;
  if (id === normalizedQuery || title === normalizedQuery) score += 260;
  else if (id.includes(normalizedQuery) || title.includes(normalizedQuery)) score += 150;
  else if (haystack.includes(normalizedQuery)) score += 110;
  const tokens = pluginCapabilityTokens(query);
  const matched = tokens.filter((token) => haystack.includes(normalizePluginCompatibilityText(token)));
  score += matched.length * 24;
  if (tokens.length && matched.length === tokens.length) score += 60;
  return score;
}

export function scorePluginUiTarget(element: HTMLElement, label: string, plugin: InstalledPluginInfo, intent: string): number {
  const intentText = normalizePluginCompatibilityText(intent);
  const labelText = normalizePluginCompatibilityText(label);
  const elementEvidence = normalizePluginCompatibilityText([
    label,
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("title") ?? "",
    element.getAttribute("placeholder") ?? "",
    element.id,
    String(element.className || ""),
    ...Object.entries(element.dataset).flatMap(([key, value]) => [key, value ?? ""]),
    ...Array.from({ length: 3 }, (_, index) => {
      let parent: HTMLElement | null = element;
      for (let depth = 0; depth <= index; depth += 1) parent = parent?.parentElement ?? null;
      return parent ? `${parent.id} ${String(parent.className || "")} ${parent.getAttribute("data-type") ?? ""}` : "";
    })
  ].join(" "));
  let score = 0;
  if (labelText === intentText) score += 260;
  else if (labelText.includes(intentText) || intentText.includes(labelText)) score += 170;
  else if (elementEvidence.includes(intentText)) score += 110;
  const tokens = pluginCapabilityTokens(intent);
  const matched = tokens.filter((token) => elementEvidence.includes(normalizePluginCompatibilityText(token)));
  score += matched.length * 24;
  if (tokens.length && matched.length === tokens.length) score += 55;
  const pluginTokens = pluginCapabilityTokens(`${plugin.id} ${plugin.name}`);
  if (pluginTokens.some((token) => elementEvidence.includes(normalizePluginCompatibilityText(token)))) score += 32;
  if (element.matches("button, [role='button'], [role='menuitem']")) score += 8;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") score -= 180;
  return score;
}

export function pluginCompatibilityUiOperation(args: Record<string, unknown>): "click" | "input" | "select" | "toggle" | "key" {
  const requested = String(args.operation ?? args.op ?? "").trim().toLowerCase();
  if (requested === "input" || requested === "type" || requested === "fill") return "input";
  if (requested === "select" || requested === "choose") return "select";
  if (requested === "toggle" || requested === "check" || requested === "uncheck") return "toggle";
  if (requested === "key" || requested === "keypress") return "key";
  if (Object.prototype.hasOwnProperty.call(args, "text") || Object.prototype.hasOwnProperty.call(args, "value")) return "input";
  return "click";
}

export function pluginCompatibilityActionInput(args: Record<string, unknown>): Record<string, unknown> {
  const omitted = new Set(["pluginId", "id", "name", "query", "actionId", "action", "intent", "maxChars"]);
  return Object.fromEntries(Object.entries(args).filter(([key]) => !omitted.has(key)));
}

export function pluginUiControlValue(element: HTMLElement): string {
  const win = element.ownerDocument.defaultView ?? window;
  if (element.instanceOf(win.HTMLInputElement) || element.instanceOf(win.HTMLTextAreaElement) || element.instanceOf(win.HTMLSelectElement)) {
    return String((element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? "");
  }

  return element.isContentEditable ? element.textContent ?? "" : "";
}

export function pluginUiControlChecked(element: HTMLElement): boolean | null {
  const win = element.ownerDocument.defaultView ?? window;
  if (element.instanceOf(win.HTMLInputElement)) return (element as HTMLInputElement).checked;
  const value = element.getAttribute("aria-checked") ?? element.getAttribute("aria-pressed");
  return value === "true" ? true : value === "false" ? false : null;
}

