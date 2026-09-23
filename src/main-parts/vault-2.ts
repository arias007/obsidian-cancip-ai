/*
 * Cancip vault-2 — extracted from src/main.ts by scripts/extract-main-modules.mjs.
 * Declarations here were proven to reference nothing left behind in main.ts, so this
 * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.
 */
import { type DataAdapter, normalizePath, TFile } from "obsidian";
import { clampInt, escapeRegExp, estimateTextTokens, safeJsonishDisplay } from "./model-api";
import { clampNumber, normalizeAnnotationPoints, trimContext } from "./office";
import { acceptanceTokenUsageFromValue, extractMentionTokens, normalizeObsidianCommandSearchText, scoreObsidianCommand, stableTextHash, tokenize, uniqueStrings, universalSearchKindPriority } from "./search";
import { AccessMode, ApiMode, ApiProfile, AutocompletePreferenceSignal, AutocompletePreferenceSummary, AutocompleteSelectionEvent, CancipAction, ChatMessage, ComposerMode, ComposerWorkflowHint, ContextCompactionState, EditorAutocompleteMemoryDocument, FoldedMessageBlock, HtmlAppState, InstalledPluginInfo, LightweightRagChunk, ManualTodo, MessageDisplay, ObsidianCommandEntry, PersonalizationEvidenceTier, PersonalizationGreeting, PersonalizationWeather, PluginCapabilityInfo, PluginCompatibilityActionDefinition, PluginCompatibilityDescriptor, PluginCompatibilityRoute, PluginCompatibilityVerification, PrimeTtsMeta, PromptIntent, QueuedPrompt, ResumableTaskState, ScoreEntityState, SessionEvent, SessionEventKind, SessionEventView, SessionHistoryEntry, SessionTimeline, SimpleVaultTargetRequest, TargetCandidate, TargetCandidateKind, ToolRun, TtsProvider, TtsQualityMode, TurnModelUsage, UiButtonRule, UiButtonRuleChange, UiButtonRuleResetTarget, UniversalSearchDocumentKind, UniversalSearchInventoryItem, VaultTextFile, localDateKey } from "./types-1";
import { isOnlyRunStatsText, isProgrammaticProgressHeadline, normalizeUiButtonLabel, parseFirstJsonObject, stripStructuredChoices, stripTailChoiceSection } from "./ui";

export function inferredPluginUiVerification(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  connected: boolean
): Record<string, unknown> {
  const changes = Object.keys(after).filter((key) => safeJsonishDisplay(before[key]) !== safeJsonishDisplay(after[key]));
  const observable = !connected || changes.some((key) => key !== "connected");
  return {
    status: observable ? "passed" : "inconclusive",
    observableChange: observable,
    changed: changes,
    detail: observable
      ? "The visible workspace or target state changed after the simulated user action."
      : "The control received the action, but no reliable postcondition was observable. Add route.verify or run cancip.outcome.verify before claiming completion."
  };
}

export function normalizePluginCompatibilityId(value: unknown, field: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)) {
    throw new Error(`Invalid Cancip compatibility ${field}: ${text || "(empty)"}`);
  }
  return text;
}

export function normalizePluginCompatibilityStrings(value: unknown, limit = 40): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))
    .slice(0, limit);
}

export function normalizePluginCompatibilityVerification(value: unknown): PluginCompatibilityVerification | undefined {
  if (!isRecord(value)) return undefined;
  const scope = value.scope === "active" || value.scope === "cancip" || value.scope === "global" ? value.scope : undefined;
  const textContains = typeof value.textContains === "string"
    ? value.textContains
    : Array.isArray(value.textContains)
      ? value.textContains.filter((item): item is string => typeof item === "string").slice(0, 20)
      : undefined;
  return {
    ...(scope ? { scope } : {}),
    ...(typeof value.selector === "string" && value.selector.trim() ? { selector: value.selector.trim() } : {}),
    ...(typeof value.exists === "boolean" ? { exists: value.exists } : {}),
    ...(typeof value.visible === "boolean" ? { visible: value.visible } : {}),
    ...(textContains !== undefined ? { textContains } : {}),
    ...(typeof value.activeFile === "string" && value.activeFile.trim() ? { activeFile: value.activeFile.trim() } : {}),
    ...(typeof value.viewType === "string" && value.viewType.trim() ? { viewType: value.viewType.trim() } : {}),
    ...(typeof value.timeoutMs === "number" && Number.isFinite(value.timeoutMs)
      ? { timeoutMs: Math.max(0, Math.min(10000, Math.round(value.timeoutMs))) }
      : {})
  };
}

export function normalizePluginCompatibilityRoute(value: unknown): PluginCompatibilityRoute | undefined {
  if (!isRecord(value)) return undefined;
  const type = value.type === "command" || value.type === "api" || value.type === "ui" ? value.type : "";
  if (!type) throw new Error(`Invalid Cancip compatibility route type: ${String(value.type ?? "")}`);
  const target = value.target === "runtime" ? "runtime" : value.target === "api" ? "api" : undefined;
  const scope = value.scope === "active" || value.scope === "cancip" || value.scope === "global" ? value.scope : undefined;
  const operation = value.operation === "input" || value.operation === "select" || value.operation === "toggle" || value.operation === "key"
    ? value.operation
    : value.operation === "click" ? "click" : undefined;
  const route: PluginCompatibilityRoute = {
    type,
    ...(typeof value.commandId === "string" && value.commandId.trim() ? { commandId: value.commandId.trim() } : {}),
    ...(typeof value.commandQuery === "string" && value.commandQuery.trim() ? { commandQuery: value.commandQuery.trim() } : {}),
    ...(target ? { target } : {}),
    ...(typeof value.method === "string" && value.method.trim() ? { method: value.method.trim() } : {}),
    ...(typeof value.selector === "string" && value.selector.trim() ? { selector: value.selector.trim() } : {}),
    ...(typeof value.label === "string" && value.label.trim() ? { label: value.label.trim() } : {}),
    ...(scope ? { scope } : {}),
    ...(operation ? { operation } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, "value") ? { value: value.value } : {}),
    ...(typeof value.key === "string" && value.key.trim() ? { key: value.key.trim() } : {}),
    ...(normalizePluginCompatibilityVerification(value.verify) ? { verify: normalizePluginCompatibilityVerification(value.verify) } : {})
  };
  if (type === "command" && !route.commandId && !route.commandQuery) throw new Error("A command compatibility route requires commandId or commandQuery.");
  if (type === "api" && (!route.method || !/^[A-Za-z_$][\w$]*$/.test(route.method))) throw new Error("An API compatibility route requires a public method name.");
  if (type === "ui" && !route.selector && !route.label) throw new Error("A UI compatibility route requires selector or label.");
  return route;
}

export function normalizePluginCompatibilityDescriptor(value: unknown, source: string): PluginCompatibilityDescriptor {
  if (!isRecord(value)) throw new Error(`Invalid Cancip compatibility descriptor from ${source}: expected an object.`);
  if (String(value.schemaVersion ?? "") !== "1.0") throw new Error(`Unsupported Cancip compatibility schema from ${source}: ${String(value.schemaVersion ?? "missing")}`);
  const pluginId = normalizePluginCompatibilityId(value.pluginId, "pluginId");
  const rawActions = Array.isArray(value.actions) ? value.actions : [];
  if (!rawActions.length) throw new Error(`Cancip compatibility descriptor for ${pluginId} has no actions.`);
  const seen = new Set<string>();
  const actions = rawActions.slice(0, 200).map((rawAction, index): PluginCompatibilityActionDefinition => {
    if (!isRecord(rawAction)) throw new Error(`Invalid action ${index + 1} in ${pluginId}.`);
    const id = normalizePluginCompatibilityId(rawAction.id, `action[${index}].id`);
    if (seen.has(id)) throw new Error(`Duplicate Cancip compatibility action: ${pluginId}.${id}`);
    seen.add(id);
    const title = typeof rawAction.title === "string" ? rawAction.title.trim() : "";
    if (!title) throw new Error(`Cancip compatibility action ${pluginId}.${id} requires a title.`);
    const risk = rawAction.risk === "read" || rawAction.risk === "effect" || rawAction.risk === "write" || rawAction.risk === "high"
      ? rawAction.risk
      : null;
    if (!risk) throw new Error(`Cancip compatibility action ${pluginId}.${id} requires risk: read|effect|write|high.`);
    const route = normalizePluginCompatibilityRoute(rawAction.route);
    const run = typeof rawAction.run === "function"
      ? rawAction.run as PluginCompatibilityActionDefinition["run"]
      : undefined;
    if (!route && !run) throw new Error(`Cancip compatibility action ${pluginId}.${id} requires route or run.`);
    return {
      id,
      title: trimContext(title, 160),
      ...(typeof rawAction.description === "string" && rawAction.description.trim() ? { description: trimContext(rawAction.description.trim(), 600) } : {}),
      ...(normalizePluginCompatibilityStrings(rawAction.keywords).length ? { keywords: normalizePluginCompatibilityStrings(rawAction.keywords) } : {}),
      risk,
      ...(isRecord(rawAction.inputSchema) ? { inputSchema: rawAction.inputSchema } : {}),
      ...(route ? { route } : {}),
      ...(run ? { run } : {})
    };
  });
  return {
    schemaVersion: "1.0",
    pluginId,
    ...(typeof value.pluginName === "string" && value.pluginName.trim() ? { pluginName: trimContext(value.pluginName.trim(), 160) } : {}),
    ...(typeof value.version === "string" && value.version.trim() ? { version: trimContext(value.version.trim(), 80) } : {}),
    ...(typeof value.description === "string" && value.description.trim() ? { description: trimContext(value.description.trim(), 600) } : {}),
    ...(normalizePluginCompatibilityStrings(value.keywords).length ? { keywords: normalizePluginCompatibilityStrings(value.keywords) } : {}),
    actions
  };
}

export function publicPluginCompatibilityDescriptor(descriptor: PluginCompatibilityDescriptor): PluginCompatibilityDescriptor {
  return {
    ...descriptor,
    keywords: [...(descriptor.keywords ?? [])],
    actions: descriptor.actions.map((action) => ({
      id: action.id,
      title: action.title,
      ...(action.description ? { description: action.description } : {}),
      ...(action.keywords?.length ? { keywords: [...action.keywords] } : {}),
      risk: action.risk,
      ...(action.inputSchema ? { inputSchema: action.inputSchema } : {}),
      ...(action.route ? { route: { ...action.route, ...(action.route.verify ? { verify: { ...action.route.verify } } : {}) } } : {})
    }))
  };
}

export function pluginCompatibilityJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://github.com/arias007/obsidian-cancip-ai/blob/main/docs/cancip-plugin.schema.json",
    title: "Cancip plugin compatibility descriptor",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "pluginId", "actions"],
    properties: {
      schemaVersion: { const: "1.0" },
      pluginId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" },
      pluginName: { type: "string", minLength: 1 },
      version: { type: "string" },
      description: { type: "string" },
      keywords: { type: "array", maxItems: 40, items: { type: "string", minLength: 1 }, uniqueItems: true },
      actions: {
        type: "array",
        minItems: 1,
        maxItems: 200,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "risk", "route"],
          properties: {
            id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" },
            title: { type: "string", minLength: 1 },
            description: { type: "string" },
            keywords: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
            risk: { enum: ["read", "effect", "write", "high"] },
            inputSchema: { type: "object" },
            route: {
              type: "object",
              additionalProperties: false,
              required: ["type"],
              properties: {
                type: { enum: ["command", "api", "ui"] },
                commandId: { type: "string" },
                commandQuery: { type: "string" },
                target: { enum: ["api", "runtime"] },
                method: { type: "string" },
                selector: { type: "string" },
                label: { type: "string" },
                scope: { enum: ["active", "cancip", "global"] },
                operation: { enum: ["click", "input", "select", "toggle", "key"] },
                value: {},
                key: { type: "string" },
                verify: { type: "object" }
              }
            }
          }
        }
      }
    }
  };
}

export function pluginCapabilityQueryFromArgs(args: Record<string, unknown>): string {
  for (const key of ["pluginId", "id", "name", "query", "intent", "feature"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function pluginCapabilityTokens(input: string): string[] {
  return uniqueStrings([
    ...tokenize(input),
    ...normalizeObsidianCommandSearchText(input).split(/\s+/).filter((part) => part.length >= 2)
  ]).filter((token) => !/^(plugin|plugins|obsidian|command|feature|capability|插件|命令|能力|功能)$/.test(token));
}

export function scorePluginCapability(plugin: InstalledPluginInfo, query: string): number {
  if (!query.trim()) return plugin.enabled ? 10 : 1;
  const fields = [plugin.id, plugin.name, plugin.description ?? "", plugin.path].filter(Boolean);
  const normalizedFields = fields.map(normalizeObsidianCommandSearchText);
  const compactFields = normalizedFields.map((field) => field.replace(/\s+/g, ""));
  const q = normalizeObsidianCommandSearchText(query);
  const qCompact = q.replace(/\s+/g, "");
  let score = 0;

  for (const field of normalizedFields) {
    if (field === q) score += 420;
    if (field.startsWith(q)) score += 260;
    if (field.includes(q)) score += 190;
  }
  for (const field of compactFields) {
    if (qCompact && field === qCompact) score += 420;
    if (qCompact && field.includes(qCompact)) score += 170;
    if (qCompact.length >= 4 && isSubsequence(qCompact, field)) score += 95;
    const similarity = normalizedSimilarity(qCompact, field);
    if (qCompact.length >= 4 && similarity >= 0.74) score += Math.round(similarity * 120);
  }

  const tokens = pluginCapabilityTokens(query);
  let matched = 0;
  for (const token of tokens) {
    const t = normalizeObsidianCommandSearchText(token).replace(/\s+/g, "");
    if (!t) continue;
    if (compactFields.some((field) => field.includes(t) || isSubsequence(t, field) || normalizedSimilarity(t, field) >= 0.78)) {
      matched += 1;
      score += 34;
    }
  }
  if (tokens.length && matched === tokens.length) score += 80;
  if (plugin.enabled) score += 20;
  return Math.max(0, Math.round(score));
}

export function scoreExplicitPluginNameMatch(plugin: InstalledPluginInfo, query: string): number {
  const tokens = pluginCapabilityTokens(query)
    .map((token) => normalizeObsidianCommandSearchText(token).replace(/\s+/g, ""))
    .filter((token) => /^[a-z0-9_-]{4,}$/i.test(token))
    .filter((token) => !/^(plugin|plugins|command|commands|feature|capability|draw|edit|file|note|vault|obsidian)$/i.test(token));
  if (!tokens.length) return 0;
  const fields = [plugin.id, plugin.name]
    .map((field) => normalizeObsidianCommandSearchText(field).replace(/\s+/g, ""))
    .filter((field) => field.length >= 3);
  let score = 0;
  for (const token of tokens) {
    for (const field of fields) {
      if (field === token) score = Math.max(score, 500);
      else if (field.startsWith(token) || token.startsWith(field)) score = Math.max(score, 360);
      else if (field.includes(token) || token.includes(field)) score = Math.max(score, 300);
      else if (isSubsequence(token, field)) score = Math.max(score, 240);
      else {
        const similarity = normalizedSimilarity(token, field);
        if (similarity >= 0.74) score = Math.max(score, Math.round(similarity * 260));
      }
    }
  }
  return score;
}

export function scorePluginCapabilityCommand(entry: ObsidianCommandEntry, plugins: PluginCapabilityInfo[], query: string, tokens: string[]): number {
  const id = normalizeObsidianCommandSearchText(entry.id);
  const name = normalizeObsidianCommandSearchText(entry.name);
  const field = `${id} ${name}`.trim();
  const compact = field.replace(/\s+/g, "");
  let score = query ? scoreObsidianCommand(entry, query) : 0;

  for (const plugin of plugins) {
    const idPrefix = `${plugin.id.toLowerCase()}:`;
    if (entry.id.toLowerCase().startsWith(idPrefix)) score += 260;
    for (const token of pluginCapabilityTokens(`${plugin.id} ${plugin.name}`)) {
      const t = normalizeObsidianCommandSearchText(token).replace(/\s+/g, "");
      if (t && compact.includes(t)) score += 46;
    }
  }

  for (const token of tokens) {
    const t = normalizeObsidianCommandSearchText(token).replace(/\s+/g, "");
    if (!t) continue;
    if (compact.includes(t)) score += 28;
    else if (t.length >= 4 && isSubsequence(t, compact)) score += 13;
  }
  return Math.max(0, Math.round(score));
}

export function summarizeObjectSurface(value: unknown, limit: number): { keys: string[]; methods: string[] } {
  if (!isRecord(value)) return { keys: [], methods: [] };
  const common = new Set([
    "constructor", "load", "unload", "onload", "onunload", "loadData", "saveData", "loadCSS",
    "addRibbonIcon", "addStatusBarItem", "addCommand", "removeCommand", "addSettingTab",
    "registerView", "registerHoverLinkSource", "registerExtensions", "registerMarkdownPostProcessor",
    "registerMarkdownCodeBlockProcessor", "registerBasesView", "registerGlobalFunc", "registerInstanceFunc",
    "registerCodeMirror", "registerEditorExtension", "registerObsidianProtocolHandler", "registerEditorSuggest",
    "registerCliHandler", "getModifiedTime", "addChild", "removeChild", "register", "registerEvent", "registerDomEvent",
    "onUserEnable"
  ]);
  const keys = Object.keys(value)
    .filter((key) => !key.startsWith("_") && key !== "app" && key !== "manifest")
    .map((key) => `${key}:${surfaceValueKind(value[key])}`)
    .slice(0, limit);
  const methods: string[] = [];
  const seen = new Set<string>();
  let current: object | null = Object.getPrototypeOf(value) as object | null;
  while (current && current !== Object.prototype && methods.length < limit) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (methods.length >= limit) break;
      if (seen.has(key) || common.has(key) || key.startsWith("_")) continue;
      seen.add(key);
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (typeof descriptor?.value === "function") methods.push(key);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return { keys, methods };
}

export function surfaceValueKind(value: unknown): string {
  if (typeof value === "function") return "fn";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (isRecord(value)) return "object";
  if (value === null) return "null";
  return typeof value;
}

export function resolveObjectMethodName(target: Record<string, unknown>, method: string): string | null {
  const exact = Object.prototype.hasOwnProperty.call(target, method) && typeof target[method] === "function" ? method : "";
  if (exact) return exact;
  const lower = method.toLowerCase();
  let current: object | null = target;
  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key.toLowerCase() === lower && typeof (target as Record<string, unknown>)[key] === "function") return key;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return null;
}

export function summarizeJsonForCapability(raw: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return trimContext(redactSensitiveText(raw), maxChars);
    const parts = Object.entries(parsed).slice(0, 24).map(([key, value]) => `${key}: ${jsonCapabilityValuePreview(value)}`);
    const suffix = Object.keys(parsed).length > parts.length ? `, ... ${Object.keys(parsed).length - parts.length} more` : "";
    return trimContext(redactSensitiveText(`{ ${parts.join(", ")}${suffix} }`), maxChars);
  } catch {
    return trimContext(redactSensitiveText(raw), maxChars);
  }
}

export function jsonCapabilityValuePreview(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(trimContext(value, 80));
  if (typeof value === "number" || typeof value === "boolean" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (isRecord(value)) return `{${Object.keys(value).slice(0, 8).join(", ")}${Object.keys(value).length > 8 ? ", ..." : ""}}`;
  return typeof value;
}

export function formatByteSize(size: unknown): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

export function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index >= needle.length) return true;
  }
  return false;
}

export function normalizedSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  if (Math.max(a.length, b.length) > 40) return 0;
  const distance = levenshteinDistance(shorter, longer, Math.ceil(longer.length * 0.35));
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

export function levenshteinDistance(a: string, b: string, stopAt: number): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > stopAt) return rowMin;
    previous = current;
  }
  return previous[b.length] ?? Math.max(a.length, b.length);
}

export function isPathInFolder(path: string, folderPath: string): boolean {
  const prefix = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
  return path === folderPath || path.startsWith(prefix);
}

export async function listVaultTextPaths(
  adapter: DataAdapter,
  folder: string,
  timeBudgetMs = 5000,
  startedAt = Date.now(),
  maxResults = 2000,
  shouldDescend?: (folder: string) => boolean
): Promise<string[]> {
  const results: string[] = [];
  if (Date.now() - startedAt > timeBudgetMs || results.length >= maxResults) return results;
  let listing: { files: string[]; folders: string[] };
  try {
    listing = await adapter.list(folder);
  } catch {
    return results;
  }
  for (const file of listing.files) {
    if (Date.now() - startedAt > timeBudgetMs || results.length >= maxResults) break;
    const normalized = normalizePath(file);
    if (isContextTextPath(normalized)) results.push(normalized);
  }
  for (const child of listing.folders) {
    if (Date.now() - startedAt > timeBudgetMs || results.length >= maxResults) break;
    const normalized = normalizePath(child);
    if (shouldDescend && !shouldDescend(normalized)) continue;
    const childResults = await listVaultTextPaths(adapter, normalized, timeBudgetMs, startedAt, maxResults - results.length, shouldDescend);
    results.push(...childResults);
  }
  return results;
}

export function vaultTextFileFromPath(path: string): VaultTextFile {
  const name = path.split("/").pop() || path;
  const dot = name.lastIndexOf(".");
  const basename = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return { path, basename, extension };
}

export function isContextTextPath(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && isContextTextExtension(name.slice(dot + 1));
}

export function fairUniversalSearchBuildBatch(pending: UniversalSearchInventoryItem[], limit: number): UniversalSearchInventoryItem[] {
  if (pending.length <= limit) return pending.slice();
  const groups = new Map<UniversalSearchDocumentKind, UniversalSearchInventoryItem[]>();
  for (const item of pending) {
    const group = groups.get(item.kind) ?? [];
    group.push(item);
    groups.set(item.kind, group);
  }
  const kinds = [...groups.keys()].sort((a, b) => universalSearchKindPriority(a) - universalSearchKindPriority(b) || a.localeCompare(b));
  const indexes = new Map<UniversalSearchDocumentKind, number>();
  const result: UniversalSearchInventoryItem[] = [];
  while (result.length < limit) {
    let added = false;
    for (const kind of kinds) {
      const group = groups.get(kind) ?? [];
      const index = indexes.get(kind) ?? 0;
      if (index >= group.length) continue;
      result.push(group[index]);
      indexes.set(kind, index + 1);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
  }
  return result;
}

export function isContextTextFile(file: TFile): boolean {
  return isContextTextExtension(file.extension);
}

export function isMarkdownFile(file: TFile): boolean {
  return file.extension.toLowerCase() === "md" || file.extension.toLowerCase() === "markdown";
}

export function isPdfFile(file: TFile): boolean {
  return file.extension.toLowerCase() === "pdf";
}

export function isPdfPath(path: string): boolean {
  return /\.pdf$/i.test(path);
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|avif)$/i.test(path);
}

export function isVaultParseableAttachmentPath(path: string): boolean {
  return /\.(pdf|docx|xlsx|pptx|zip)$/i.test(path) || isImagePath(path);
}

export function isVaultTextExtractableAttachmentPath(path: string): boolean {
  return /\.(pdf|docx|xlsx|pptx|zip)$/i.test(path);
}

export function mimeTypeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".epub")) return "application/epub+zip";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

export function isContextTextExtension(extension: string): boolean {
  const textExtensions = new Set([
    "md",
    "txt",
    "json",
    "jsonl",
    "csv",
    "ts",
    "tsx",
    "js",
    "jsx",
    "css",
    "html",
    "xml",
    "yml",
    "yaml",
    "base",
    "canvas"
  ]);
  return textExtensions.has(extension.toLowerCase());
}

export function shouldAutoSearchForPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (extractMentionTokens(text).length) return true;
  if (looksLikePathQuery(text)) return true;
  const lower = text.toLowerCase();
  if (/(search|find|read|open|summari[sz]e|index|rag|vault|note|file|folder|config|plugin|github|查|搜|找|读取|打开|总结|索引|笔记|文件|文件夹|配置|插件|仓库|命令)/.test(lower)) return true;
  const tokens = tokenize(text);
  if (tokens.length >= 3) return true;
  if (text.length >= 18 && /[\u4e00-\u9fff]/.test(text)) return true;
  return false;
}

export function promptMentionsCancip(prompt: string): boolean {
  return /(cancip|concip|cinsip|\.cancip|system prompt|系统提示|提示词|权限|全权|确认模式|审核面板|会话|记忆|索引|工具协议|插件自身|自修|自改)/i.test(prompt);
}

export function promptMentionsCancipSelf(prompt: string): boolean {
  return /(cancip|concip|cinsip|\.cancip|system prompt|系统提示|提示词|权限|全权|确认模式|审核面板|工具协议|插件自身|自修|自改|侧边栏|状态栏|模型列表|指正面板|子\s*agent|subagent)/i.test(prompt);
}

export function promptMentionsToolOrLocalCapability(prompt: string): boolean {
  return /(tool|tools|skill|skills|mcp|plugin|plugins|command|cmd|api|ui|button|dom|vault|obsidian|pdf|excel|word|office|attachment|github|automation|subagent|web|search|file|folder|memory|remember|experience|workflow|recipe|工具|技能|能力包|插件|命令|执行|运行|调用|按钮|界面|页面|文件|文件夹|笔记库|附件|自动化|子\s*agent|联网|网页|搜索|读写|读取|写入|朗读|语音|审核|配置|设置|记忆|记住|经验|攻略|规则|沉淀|复盘|涂鸦|高亮|画笔|标注|批注)/i.test(prompt);
}

export function promptNeedsIdentityMemory(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const compact = text.toLowerCase().replace(/[\s，。！？!?.、~～"'`]+/g, "");
  if (/^(我是谁|我是誰|你知道我是谁吗|你知道我是谁|你了解我吗|你认识我吗|你認識我嗎|记得我吗|記得我嗎|whoami|whoami\?|whoami？)$/i.test(compact)) return true;
  return /(我的(资料|資料|个人资料|個人資料|身份|背景|信息|偏好|档案|檔案)|用户是谁|用戶是誰|我是哪个用户|我是誰|我是谁|你(了解|知道|认识|認識|记得|記得)我|whoami|who\s*am\s*i|do\s*you\s*know\s*me|what\s*do\s*you\s*know\s*about\s*me|my\s*(profile|identity|preferences))/i.test(text);
}

export function shouldUseMemoryRouter(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (promptNeedsIdentityMemory(prompt)) return true;
  if (promptMentionsCancip(prompt)) return true;
  return /(memory|remember|preference|project|index|rag|knowledge|context|记忆|偏好|项目|索引|知识库|上下文|经验|攻略|(?:记住|沉淀|更新|保存|修改).{0,8}规则|规则.{0,8}(?:记忆|偏好|长期))/i.test(lower);
}

export function promptNeedsMemorySkillRoute(prompt: string): boolean {
  if (looksLikeMemoryWritePrompt(prompt)) return true;
  return /(memory[-\s]?system|memory\s+skill|memory\s+route|memory\s+router|wal|write\s+memory|update\s+memory|persist\s+(?:memory|rule|preference)|记忆系统|记忆\s*skill|记忆路由|写入记忆|更新记忆|沉淀规则|规则沉淀)/i.test(prompt);
}

export function promptNeedsExperienceSkillRoute(prompt: string): boolean {
  return /(experience|workflow|recipe|harvest|skillify|task[-\s]?observer|self[-\s]?(?:optimi[sz]e|improve)|learn(?:ing)?|repeatable|复盘|经验|流程|配方|沉淀|收割|自我优化|优化自己|自动优化|举一反三|可复用|下次更快|成功经验)/i.test(prompt);
}

export function promptNeedsObsidianSkillRoute(prompt: string): boolean {
  const mentionsOb = /(obsidian|vault|markdown|\.md\b|pdf|excel|office|attachment|plugin|command|button|automation|notedraw|notdraw|pdftion|spaced repetition|srs|ob\b|笔记库|笔记|库内|库里|插件|命令|按钮|附件|自动化|高亮|涂鸦|批注|标注|间隔重复|复习|卡片)/i.test(prompt);
  if (!mentionsOb) return false;
  return capabilityPromptMentionsSkillOrExperienceSurface(prompt)
    || promptNeedsExperienceSkillRoute(prompt)
    || /(攻略|用法|方法|怎么做|如何做|能不能|调用|接入|能力|工具|skill|mcp|api|自修|自改|自动调用|自动使用)/i.test(prompt);
}

export function promptNeedsSkillExperienceRoute(prompt: string): boolean {
  return promptNeedsMemorySkillRoute(prompt)
    || promptNeedsExperienceSkillRoute(prompt)
    || promptNeedsObsidianSkillRoute(prompt)
    || capabilityPromptMentionsSkillOrExperienceSurface(prompt);
}

export function shouldUsePluginRouter(prompt: string): boolean {
  return /(plugin|plugins|obsidian command|command palette|templater|dataview|tasks|quickadd|runjs|notedraw|notdraw|pdftion|spaced repetition|flashcard|srs|excalidraw|draw|doodle|sketch|highlight|pdf|excel|插件|命令库|命令面板|已装|启用|攻略|解析|附件|涂鸦|高亮|画笔|手写|标注|批注|间隔重复|复习|卡片|闪卡)/i.test(prompt);
}

export function answerHasCapabilityRefusal(answer: string): boolean {
  return /(没有可用|没有.*通道|无.*通道|不能直接|无法直接|读不到|读取不了|不能读取|无法读取|不能访问|无法访问|不能调用|无法调用|不能执行|无法执行|发给我|把.*发我|send me|no available|no tool|cannot access|can't access|cannot read|can't read|not available|unsupported|not supported)/i.test(answer);
}

export function capabilityPromptMentionsLocalSurface(text: string): boolean {
  return capabilityPromptMentionsCurrentView(text)
    || capabilityPromptMentionsObsidianCommand(text)
    || capabilityPromptMentionsPluginSurface(text)
    || capabilityPromptMentionsSkillOrExperienceSurface(text)
    || capabilityPromptMentionsSessionHistory(text)
    || capabilityPromptMentionsAttachmentOrExternalFile(text)
    || capabilityPromptMentionsGithub(text)
    || capabilityPromptMentionsAutomation(text)
    || capabilityPromptMentionsSubagents(text)
    || capabilityPromptMentionsWebDocs(text)
    || /(vault|obsidian|cancip|concip|cinsip|库|笔记库|文件|文件夹|配置|设置|按钮|界面|页面|侧边栏|状态栏|读写|读取|写入|调用|命令|执行|管理|权限|全权)/i.test(text);
}

export function capabilityPromptMentionsCurrentView(text: string): boolean {
  return /(current view|active view|current page|current note|screen|dom|ui|button|toolbar|tab|pane|workspace|selection|cursor|当前页面|当前视图|当前界面|当前文件|当前笔记|当前日记|活动页|按钮|工具栏|标签页|页签|工作区|选区|光标|界面|页面|侧边栏|状态栏)/i.test(text);
}

export function capabilityPromptMentionsObsidianCommand(text: string): boolean {
  return /(obsidian command|command palette|command bus|execute|run command|cmd|cli|eval|javascript|js|app\.|workspace|vault\.|命令库|命令面板|命令总线|执行命令|运行命令|调用命令|插件命令|js命令|脚本|工作区对象|库对象)/i.test(text);
}

export function looksLikeObsidianCommandActionQuery(text: string): boolean {
  return /(open|show|focus|goto|run|execute|toggle|close|switch|command|palette|button|toolbar|tab|pane|workspace|打开|显示|聚焦|前往|进入|运行|执行|调用|切换|关闭|开启|命令|命令面板|按钮|工具栏|标签页|页签|工作区)/i.test(text);
}

export function capabilityPromptMentionsPluginSurface(text: string): boolean {
  return /(plugin|plugins|installed|enabled|community-plugins|config\s*dir|manifest\.json|templater|dataview|tasks|quickadd|runjs|notedraw|notdraw|pdftion|spaced repetition|flashcard|srs|excalidraw|draw|doodle|sketch|highlight|插件|已装|安装了|启用|社区插件|插件清单|插件目录|插件列表|插件配置|配置目录|涂鸦|高亮|画笔|手写|标注|批注|间隔重复|复习|卡片|闪卡)/i.test(text);
}

export function promptAsksInstalledPluginManifestOrVersion(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const asksManifest = /(manifest(?:\.json)?|版本号|版本是多少|当前版本|插件版本|version|version\s*number)/i.test(text);
  if (!asksManifest) return false;
  return capabilityPromptMentionsPluginSurface(text) || /(cancip|dataview|quickadd|notedraw|notdraw|pdftion|excalidraw|templater|tasks|runjs)/i.test(text);
}

export function pluginPromptMatchScore(prompt: string, pluginId: string, pluginName = ""): number {
  const lower = prompt.toLowerCase();
  const id = pluginId.toLowerCase();
  const compactId = id.replace(/[^a-z0-9]/g, "");
  const name = pluginName.toLowerCase();
  const compactName = name.replace(/[^a-z0-9]/g, "");
  let score = 0;
  if (id && lower.includes(id)) score += 100;
  if (compactId && lower.replace(/[^a-z0-9]/g, "").includes(compactId)) score += 80;
  if (name && lower.includes(name)) score += 70;
  if (compactName && lower.replace(/[^a-z0-9]/g, "").includes(compactName)) score += 50;
  return score;
}

export function promptAsksPluginList(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const asksList = /(列出|列表|清单|有哪些|有什么|多少个|已启用|启用的|已安装|安装了|插件目录|社区插件|list|installed|enabled|plugins?\s+list)/i.test(text);
  if (!asksList) return false;
  return !/(能力|能不能|可不可以|怎么|如何|怎样|用来|做|执行|调用|api|按钮|命令|配置|设置|涂鸦|高亮|标注|批注|画笔|手写|notedraw|notdraw|excalidraw|quickadd|dataview|templater|runjs)/i.test(text);
}

export function capabilityPromptMentionsSkillSurface(text: string): boolean {
  return /(\bskill\b|\bskills\b|mcp|agent capability|技能|能力包|能力索引|工具能力|通用能力|mcp|claude code|openclaw|hermes)/i.test(text);
}

export function capabilityPromptMentionsSkillOrExperienceSurface(text: string): boolean {
  return capabilityPromptMentionsSkillSurface(text)
    || /(memory[-\s]?system|task[-\s]?observer|skillify|experience|workflow|recipe|harvest|成功经验|经验|流程|配方|沉淀|收割|记忆系统|自我优化|优化自己|自动调用.*skill|自动使用.*skill|用.*skill|调用.*skill)/i.test(text);
}

export function capabilityPromptMentionsSessionHistory(text: string): boolean {
  return /(session(?:[-\s]\d{4}|\s+history)?|conversation\s+history|transcript|chat\s+log|会话(?:历史|记录|列表|状态|名称|id)?|历史会话|聊天记录|读取.*会话|查看.*会话)/i.test(text);
}

export function capabilityPromptMentionsSubagents(text: string): boolean {
  return /(subagent|sub-agent|child agent|parallel agent|delegate|background agent|子agent|子代理|子会话|并行|分头|委派|后台代理|开.*agent|停.*agent)/i.test(text);
}

export function capabilityPromptMentionsAttachmentOrExternalFile(text: string): boolean {
  return /(attachment|external file|share sheet|pdf|excel|word|ppt|office|image|upload|outside vault|filesystem|附件|手机文件|导入文件|库外|外部文件|文件系统|分享|图片|表格|文档|解析pdf|解析 excel|解析word)/i.test(text);
}

export function capabilityPromptMentionsGithub(text: string): boolean {
  return /(github|\bgh\b|\brepo(?:sitory)?\b|pull request|\brelease\b|workflow|\bissue\b|git\s*(?:仓库|推送|发布|分支)|代码仓库|远程仓库|推送.*仓库|发布.*仓库|github管理|github插件安装)/i.test(text);
}

export function capabilityPromptMentionsAutomation(text: string): boolean {
  return /(automation|scheduled?\s+tasks?|schedule|cron|daily\s+(?:job|automation|review|report)|hourly\s+(?:job|automation)|定时|自动化|计划任务|每日整理|每天整理|每日日记|日报任务|早晚动向|循环任务|触发任务)/i.test(text);
}

export function capabilityPromptMentionsWebDocs(text: string): boolean {
  return /(docs|documentation|api|internet|web|online|latest|unknown|文档|资料|网页|网络|联网|最新|不知道|查资料|官网|怎么用)/i.test(text);
}

export function capabilityCommandQuery(text: string): string {
  const lower = text.toLowerCase();
  if (/file|文件|open|打开/.test(lower)) return "file";
  if (/plugin|插件/.test(lower)) return "plugin";
  if (/workspace|tab|leaf|工作区|标签/.test(lower)) return "workspace";
  if (/pdf/.test(lower)) return "pdf";
  if (/search|find|搜索|查找/.test(lower)) return "search";
  return "";
}

export function capabilityWebSearchQuery(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return trimContext(cleaned, 120);
}

export function requestedStructuredFieldNames(input: string): string[] {
  const fields = new Set<string>();
  const mappings: Array<[RegExp, string]> = [
    [/(?:\btitle\b|标题)/i, "title"],
    [/(?:\bupdated\b|更新时间|更新日期)/i, "updated"],
    [/(?:\bversion\b|版本号)/i, "version"],
    [/(?:\blanguage\b|默认交流语言|语言值)/i, "language"]
  ];
  for (const [pattern, field] of mappings) {
    if (field === "title" && requestedDuplicateHeadingLevel(input) > 0 && !/(?:\btitle\b|文件标题|笔记标题|文档标题|标题字段|frontmatter.{0,8}标题)/i.test(input)) continue;
    if (pattern.test(input)) fields.add(field);
  }
  if (/(?:字段|属性|field|key|中的|里面的|的值)/i.test(input)) {
    for (const match of input.matchAll(/`([A-Za-z_][A-Za-z0-9_.-]{0,80})`/g)) {
      if (!looksLikeStructuredDataFileName(match[1])) fields.add(match[1]);
    }
    for (const match of input.matchAll(/(?:字段|field|key|中的)\s*["'“”‘’]?([A-Za-z_][A-Za-z0-9_.-]{0,80})["'“”‘’]?/gi)) {
      if (!looksLikeStructuredDataFileName(match[1])) fields.add(match[1]);
    }
  }
  return [...fields].slice(0, 16);
}

export function promptRequestsVaultTargetOpen(input: string): boolean {
  const text = input.trim();
  if (!/(?:打开|开启|定位|跳转|前往|进入|open|launch|reveal|focus|goto)/i.test(text)) return false;
  if (promptRequiresOpenedPathEvidence(text)) return true;
  return /(?:文件|笔记|附件|路径|目录|文件夹|pdf|docx|xlsx|pptx|html?|markdown|\.md\b|file|note|attachment|path|folder|directory)/i.test(text);
}

export function promptRequiresOpenedPathEvidence(input: string): boolean {
  return /(?:打开|开启|open|launch)/i.test(input)
    && /(?:验证|核对|确认|检查|verify|confirm|check).{0,24}(?:当前|活动|实际|路径|文件|active|actual|path|file)|(?:当前|活动|实际|路径|文件|active|actual|path|file).{0,24}(?:验证|核对|确认|检查|verify|confirm|check)/i.test(input);
}

export function findTargetCandidatePathsFromResult(text: string): string[] {
  return uniqueStrings(text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+\.\s+\[([^\]]+)\]\s+(.+?)\s*$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .filter((match) => /^(?:file|folder|attachment|attachment-content|content)$/i.test(match[1]))
    .map((match) => (match[2].split(/\s+—\s+/)[0] ?? match[2])
      .replace(/\s+\[score\s+[^\]]+\]\s*$/i, "")
      .trim())
    .filter(Boolean));
}

export function verifiedOpenedPathFromRuns(runs: ToolRun[]): string {
  for (const run of [...runs].reverse()) {
    if (run.status !== "executed") continue;
    const result = run.result ?? "";
    const match = result.match(/^activeFile\s*:\s*([^\r\n;]+)$/im)
      ?? result.match(/\bactiveFile\s*=\s*([^;\r\n]+)/i)
      ?? result.match(/^verifiedPath\s*:\s*([^\r\n;]+)$/im);
    const value = match?.[1]?.trim();
    if (value) return normalizePath(value);
  }
  return "";
}

export function looksLikeStructuredDataFileName(value: string): boolean {
  return /\.(?:md|markdown|txt|json|ya?ml|toml|csv|tsv|html?|mhtml?|docx?|xlsx?|pptx?|pdf)$/i.test(value);
}

export function requestedDuplicateHeadingLevel(input: string): number {
  if (!/(?:重复|duplicate)/i.test(input) || !/(?:标题|heading)/i.test(input)) return 0;
  if (/(?:一级|h1|level\s*1)/i.test(input)) return 1;
  if (/(?:二级|h2|level\s*2)/i.test(input)) return 2;
  if (/(?:三级|h3|level\s*3)/i.test(input)) return 3;
  if (/(?:四级|h4|level\s*4)/i.test(input)) return 4;
  if (/(?:五级|h5|level\s*5)/i.test(input)) return 5;
  if (/(?:六级|h6|level\s*6)/i.test(input)) return 6;
  return 0;
}

export function requestedResultCount(input: string, fallback: number, max: number): number {
  const match = input.match(/(?:最近|前|只列|列出|返回|显示|顯示|找|show|list|first|latest)?\s*([零〇一二两兩三四五六七八九十百\d]+)\s*(?:个|個|项|項|条|條|笔|筆|个结果|個結果)/i);
  if (!match) return Math.max(1, Math.min(max, fallback));
  const raw = match[1];
  const numeric = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : parseSimpleChineseInteger(raw);
  return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.min(max, numeric)) : Math.max(1, Math.min(max, fallback));
}

export function explicitExternalAbsolutePath(input: string): string {
  const quoted = input.match(/[`"'“”‘’]([A-Za-z]:[\\/][^`"'“”‘’\r\n]+)[`"'“”‘’]/)?.[1];
  if (quoted) return quoted.trim();
  return input.match(/(?:^|\s)([A-Za-z]:[\\/][^\s，。；,;]+)/)?.[1]?.trim() ?? "";
}

export function shouldUseDetailedToolProtocol(prompt: string): boolean {
  return /(完整工具协议|详细工具协议|工具协议|动作格式|action format|tool protocol|cancip-action|command bus|命令总线|payload|上下文发送|系统提示词|system prompt|prompt audit|调试提示|debug prompt|debug protocol)/i.test(prompt);
}

export function lightweightImplementationPrompt(prompt: string): boolean {
  return !isExecutableTtsPrompt(prompt)
    && /(继续|看看|分析|为什么|原因|状态|情况|查|搜|读取|打开|总结)/i.test(prompt)
    && !/(改|写|修|删|移动|安装|重启|构建|发布|push|release)/i.test(prompt);
}

export function isSimpleSingleStepStateChangePrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const compact = text.toLowerCase().replace(/[\s，。！？!?.、~～"'`]+/g, "");
  if (text.length > 180) return false;
  if (/(然后|再|同时|并且|顺便|多个|几个|批量|整理|重构|审核|插件|设置|配置|自动化|github|release|push|构建|重启|修复|优化|排错|分析|对齐|查看|检查)/i.test(compact)) return false;
  if (isExecutableTtsPrompt(text)) return true;
  if (looksLikeCreateVaultFilePrompt(text)) return true;
  if (/[^\s`"'“”‘’]+\.[A-Za-z0-9]{1,10}(?=$|[\s，。！？；、`"'“”‘’])/i.test(text)
    && /(写入|写成|清空|覆盖|修改|追加|保存|打开|读取|write|clear|overwrite|modify|append|save|open|read)/i.test(text)) return true;
  return /(新建|创建|建立|生成|写入|保存|create|write|make|new).{0,20}(\.md|md|markdown|笔记|文件)/i.test(text);
}

export function looksLikeExplicitVaultFileQuery(query: string): boolean {
  const text = query.trim().replace(/\\/g, "/");
  if (!text || /^https?:\/\//i.test(text) || /^[A-Za-z]:\//.test(text)) return false;
  const leaf = text.split("/").pop() ?? text;
  return /\.[A-Za-z0-9]{1,12}$/.test(leaf);
}

export function isCredibleVaultTargetCandidate(query: string, candidate: TargetCandidate, second?: TargetCandidate): boolean {
  if (candidate.score >= 900) return true;
  const normalizedQuery = normalizePath(query.replace(/\\/g, "/").replace(/^\/+/, "")).toLocaleLowerCase();
  const queryLeaf = normalizedQuery.split("/").pop() ?? normalizedQuery;
  const candidatePath = normalizePath(candidate.path).toLocaleLowerCase();
  const candidateLeaf = candidatePath.split("/").pop() ?? candidatePath;
  if (candidatePath === normalizedQuery || candidateLeaf === queryLeaf) return true;
  const queryStem = queryLeaf.replace(/\.[^.]+$/, "");
  const candidateStem = candidateLeaf.replace(/\.[^.]+$/, "");
  if (candidateStem === queryStem) return true;
  if (queryStem.length >= 4 && candidate.score >= 70 && (candidateStem.includes(queryStem) || queryStem.includes(candidateStem))) return true;
  return queryStem.length >= 3 && candidate.score >= 88 && candidate.score - (second?.score ?? 0) >= 8;
}

export function promptNeedsCurrentFileContext(prompt: string): boolean {
  return /(当前文件|当前笔记|这个文件|这个笔记|此文件|此笔记|正在打开|光标|选区|选择的|选中的|selection|cursor|current file|active file|this file|this note)/i.test(prompt);
}

export function pluginMemoryCommandQuery(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("file") || prompt.includes("文件")) return "file";
  if (lower.includes("spaced") || lower.includes("repetition") || lower.includes("flashcard") || lower.includes("srs") || prompt.includes("间隔重复") || prompt.includes("复习") || prompt.includes("卡片") || prompt.includes("闪卡")) return "spaced repetition flashcard review";
  if (lower.includes("pdftion") || lower.includes("pdf") || prompt.includes("批注") || prompt.includes("标注")) return "pdftion pdf annotation highlight";
  if (lower.includes("notedraw") || lower.includes("notdraw") || prompt.includes("涂鸦") || prompt.includes("高亮") || prompt.includes("画笔")) return "notedraw draw highlight";
  if (lower.includes("excalidraw")) return "excalidraw";
  if (lower.includes("canvas") || prompt.includes("画布")) return "canvas";
  if (lower.includes("workspace") || prompt.includes("窗口") || prompt.includes("标签")) return "workspace";
  if (lower.includes("tts") || prompt.includes("朗读")) return "tts";
  return "";
}

export function detailedRuleRoutingTokens(prompt: string): string {
  const tokens: string[] = [];
  if (promptRequiresStateChange(prompt)) tokens.push("Execution loop", "Permission model", "write", "verify", "approval");
  if (promptMentionsCancip(prompt)) tokens.push("Cancip", "self-repair", "permission", "review", "prompt", "context");
  if (capabilityPromptMentionsAttachmentOrExternalFile(prompt)) tokens.push("Attachments", "parsers", "PDF", "Excel", "external files");
  if (capabilityPromptMentionsObsidianCommand(prompt) || capabilityPromptMentionsPluginSurface(prompt)) tokens.push("Obsidian commands", "plugins");
  if (capabilityPromptMentionsSkillOrExperienceSurface(prompt) || promptNeedsSkillExperienceRoute(prompt)) tokens.push("Skills", "MCP", "memory", "experience", "workflow", "self-optimization");
  if (capabilityPromptMentionsAutomation(prompt)) tokens.push("automation", "schedule");
  if (capabilityPromptMentionsGithub(prompt)) tokens.push("GitHub");
  if (/审核|review|指正|通过|取消|批准|拒绝/i.test(prompt)) tokens.push("review", "approval", "backup");
  if (/tts|朗读|语音/i.test(prompt)) tokens.push("TTS");
  if (/输出|结论|推荐|按钮|折叠|显示/i.test(prompt)) tokens.push("User-facing output", "Recommendation");
  return tokens.join(" ");
}

export function shouldShowLocalFallbackHits(prompt: string): boolean {
  return shouldAutoSearchForPrompt(prompt);
}

export function shouldSuppressToolActionsForPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return true;
  if (isTrivialChatPrompt(text)) return true;
  if (extractMentionTokens(text).length) return false;
  if (looksLikePathQuery(text)) return false;
  if (looksLikeCreateVaultFilePrompt(text)) return false;
  const lower = text.toLowerCase();
  if (/(search|find|read|open|summari[sz]e|index|rag|vault|note|file|folder|config|plugin|github|command|run|execute|write|edit|patch|delete|move|rename|create|generate|fix|repair|format|polish|button|style|css|ui|self|查|搜|找|读取|打开|总结|索引|笔记|文件|文件夹|配置|插件|仓库|命令|执行|运行|写|改|修|删|移动|重命名|新建|创建|建立|生成|美化|排版|格式化|润色|按钮|样式|界面|自己|自身|自修)/.test(lower)) {
    return false;
  }
  return false;
}

export function isContinuePrompt(prompt: string): boolean {
  if (/^继续上一项未完成任务(?:[。.!！？?]|$)/.test(prompt.trim())) return true;
  const compact = prompt.trim().toLowerCase().replace(/[\s，。！？!?.、~～]+/g, "");
  return /^(继续|继续修|继续做|接着|接着来|接着做|接着修|往下|往下做|下一步|继续吧|继续呀|继续啊|continue|goon|next|proceed|keepgoing)$/.test(compact);
}

export function isTrivialChatPrompt(prompt: string): boolean {
  if (isDirectAnswerOnlyPrompt(prompt)) return true;
  if (isSimpleArithmeticPrompt(prompt)) return true;
  if (isShortGreetingPrompt(prompt)) return true;
  const compact = prompt.trim().toLowerCase().replace(/[\s，。！？!?.、~～]+/g, "");
  return compact === "";
}

export function isSimpleArithmeticPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || text.length > 180) return false;
  if (/(?:文件|笔记|配置|插件|会话|自动化|命令|读取|写入|修改|删除|打开|搜索|vault|file|note|config|plugin|session|automation|command|read|write|open|search)/i.test(text)) return false;
  return /(?:\d+(?:\.\d+)?\s*[+\-*/×÷]\s*\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+\s*(?:加|减|乘|乘以|除|除以)\s*[零〇一二两三四五六七八九十百千万]+)(?:\s*(?:等于|是|=|得))?/i.test(text);
}

export function parseSimpleChineseInteger(input: string): number {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  if (!/[十百千万]/.test(input)) {
    const value = [...input].map((char) => digits[char]).join("");
    return value && /^\d+$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
  }
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of input) {
    if (char in digits) {
      number = digits[char];
      continue;
    }
    if (char === "万") {
      total += (section + number) * 10000;
      section = 0;
      number = 0;
      continue;
    }
    const unit = units[char];
    if (!unit) return Number.NaN;
    section += (number || 1) * unit;
    number = 0;
  }
  return total + section + number;
}

export function isShortGreetingPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || text.length > 120) return false;
  if (!/^(?:你好|您好|嗨|哈喽|早上好|上午好|中午好|下午好|晚上好|hi\b|hello\b|hey\b)/i.test(text)) return false;
  return !/(?:读取|查看|检查|搜索|打开|修改|写入|创建|删除|执行|运行|修复|分析|总结|read|check|search|open|modify|write|create|delete|execute|run|fix|analy[sz]e|summari[sz]e)/i.test(text);
}

export function isDirectAnswerOnlyPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const chinese = /^(?:(?:不要|不用)(?:解释|解釋|说明|說明)[，,：:\s]*)?(?:请|請)?\s*(?:只|仅|僅)(?:需|需要|要)?\s*(?:回复|回覆|回答|答复|答覆|输出|輸出|说|說)\s*[“"「『][\s\S]{1,400}[”"」』](?:[，,;；:\s]*(?:(?:不要|不用)(?:解释|解釋|说明|說明)|即可|就行))*[。.!！?？]*$/i;
  const english = /^(?:please\s+)?(?:(?:do\s+not|don't)\s+(?:explain|elaborate)[,;:\s]*)?(?:(?:reply|respond|answer|output|say)\s+(?:only|exactly)|(?:only|exactly)\s+(?:reply|respond|answer|output|say))(?:\s+with)?\s+["'`][\s\S]{1,400}["'`](?:[,.!?;:\s]*(?:(?:do\s+not|don't)\s+(?:explain|elaborate)))*[.!?]*$/i;
  return chinese.test(text) || english.test(text);
}

export function compactImplementationIntentText(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .replace(/[\s，。！？!?.、~～"'`]+/g, "")
    .replace(/移动(?:端|版|设备|設備|应用|應用|app|验收|驗收|测试|測試)/g, "mobile");
}

export function shouldExpectToolActionForPrompt(prompt: string): boolean {
  return classifyPromptIntent(prompt) === "implementation";
}

export function classifyPromptIntent(prompt: string): PromptIntent {
  const text = prompt.trim();
  if (!text) return "trivial";
  if (isTrivialChatPrompt(text) || shouldSuppressToolActionsForPrompt(text)) return "trivial";
  if (promptExplicitlyRequestsReadOnly(text)) return "informational";
  if (isInformationSeekingPrompt(text) && !hasExplicitExecutionDirective(text)) return "informational";
  if (isImplementationChangePrompt(text)) return "implementation";
  if (isInformationSeekingPrompt(text) || extractMentionTokens(text).length || looksLikePathQuery(text)) return "informational";
  if (shouldAutoSearchForPrompt(text)) return "informational";
  return "trivial";
}

export function hasExplicitExecutionDirective(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || promptExplicitlyRequestsReadOnly(text) || isDirectAnswerOnlyPrompt(text)) return false;
  if (isExecutableTtsPrompt(text) || looksLikeMemoryWritePrompt(text) || looksLikeCreateVaultFilePrompt(text)) return true;
  const action = "(?:add|implement|fix|repair|change|modify|update|delete|move|rename|create|install|restart|build|execute|run|open|close|hide|show|sort|pin|unpin|patch|write|save|apply|publish|release|commit|新增|添加|补充|修改|更新|修复|修好|删除|移动|重命名|新建|创建|安装|重启|构建|执行|运行|打开|开启|关闭|隐藏|显示|排序|置顶|取消置顶|写入|保存|应用|发布|提交|回退|恢复|弄好|做成)";
  // 疑问句不是执行指令：动作词后紧跟疑问词（"我现在打开了个什么"/"打开的是什么"）
  // 是在问当前状态，不是要求执行动作；否则终态校验会把只读回答误判为"未完成改动"。
  const questionFollowUp = "(?:什么|什麼|啥|哪些|哪|誰|谁|多少|多久|怎么|怎麼|如何|吗|嘛|呢|？|\\?)";
  if (new RegExp(`${action}\\s*(?:的是|[了个过一]{0,2})\\s*${questionFollowUp}`, "i").test(text)) return false;
  if (new RegExp(`^\\s*(?:请|請|麻烦|麻煩|帮我|幫我|给我|給我|直接|立即|现在|現在|务必|務必)?\\s*${action}`, "i").test(text)) return true;
  if (new RegExp(`(?:请|請|麻烦|麻煩|帮我|幫我|给我|給我|直接|立即|现在|現在|务必|務必|实际|實際).{0,24}${action}`, "i").test(text)) return true;
  if (new RegExp(`(?:把|将|將).{1,80}${action}`, "i").test(text)) return true;
  if (new RegExp(`(?:有|如果|若).{0,48}(?:就|则|則|请|請)?\\s*${action}`, "i").test(text)) return true;
  if (new RegExp(`(?:并|並|然后|然後|接着|接著|再|同时|同時).{0,32}${action}`, "i").test(text)) return true;
  return false;
}

export function promptExplicitlyRequestsReadOnly(prompt: string): boolean {
  const unscoped = prompt
    .replace(/(?:不要|別|别|不得|不)\s*(?:修改|改动|改動|写入|寫入|执行|執行)\s*(?:其他|其余|其餘|无关|無關|未指定|本次以外)[^，。；;!?！？\n]{0,48}/gi, "")
    .replace(/(?:do\s+not|don't|never)\s+(?:change|modify|write|execute)\s+(?:other|unrelated|unspecified|anything\s+else)[^,.;!?\n]{0,48}/gi, "");
  return /(?:只读|只讀|仅查看|僅查看|不要修改|别修改|別修改|不修改|不要改动|不要改動|不执行|不執行|不要执行|不要執行|不写入|不寫入|不要写入|不要寫入|read[ -]?only|no\s*(?:change|modify|write|execution)|without\s+(?:changing|modifying|writing|executing))/i.test(unscoped);
}

export function isImplementationChangePrompt(prompt: string): boolean {
  if (isDirectAnswerOnlyPrompt(prompt)) return false;
  const compact = compactImplementationIntentText(prompt);
  if (!compact) return false;
  if (isExecutableTtsPrompt(prompt)) return true;
  if (looksLikeMemoryWritePrompt(prompt)) return true;
  if (looksLikeCreateVaultFilePrompt(prompt)) return true;
  return /(add|implement|fix|repair|change|modify|update|delete|move|rename|create|install|restart|verify|build|execute|run|close|hide|show|sort|pin|unpin|patch|write|format|polish|optimi[sz]e|debug|troubleshoot|restore|rollback|hot.?patch|notworking|broken|failed|failure|bug|error|stuck|加|新增|添加|补|改|修改|更新|修|修复|删|删除|移动|重命名|新建|创建|安装|装好|重启|验证|构建|执行|运行|打开|开启|关闭|关掉|隐藏|显示|排序|固定|取消固定|调用|写入|落地|美化|排版|格式化|润色|优化|排错|解决|处理|调整|恢复|回退|热补丁|对齐|不行|没效果|沒效果|老样子|老樣子|失败|失敗|错误|錯誤|报错|報錯|坏了|壞了|卡住|不回复|不回復|乱滑|亂滑|跑偏|套话|套話|敷衍|不实时|不即時|一股脑|一股腦)/i.test(compact);
}

export function looksLikeMemoryWritePrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  if (promptNeedsIdentityMemory(text)) return false;
  if (/(你记得|你記得|记得我什么|記得我什麼|关于我|我的记忆|我的記憶|what do you know|do you remember)/i.test(text)) return false;
  return /(记住|記住|记下来|記下來|加入记忆|写入记忆|长期记忆|長期記憶|以后都|下次记得|remember this|save this|store this|keep this preference|persist this|update memory|write memory)/i.test(text);
}

export function isExecutableTtsPrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  return /(朗读|读出来|读给我|念出来|语音读|播放朗读|开始朗读|暂停朗读|停止朗读|继续朗读|tts|read\s+aloud|speak\s+(this|current|selection)|stop\s+tts|pause\s+tts|resume\s+tts)/i.test(text);
}

export function looksLikeCreateVaultFilePrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const compact = text.toLowerCase().replace(/[\s，。！？!?.、~～"'`]+/g, "");
  const hasCreateVerb = /(create|generate|write|make|new|建一个|建个|建一份|建份|新建|创建|建立|生成|写一个|写个|写一份|写份|做一个|做个|做一份|做份|弄一个|弄个)/i.test(compact);
  if (!hasCreateVerb) return false;
  const hasFileTarget = /(md|markdown|\.md|file|note|doc|document|笔记|文件|文档|文章|模板|语法|根目录|目录下|文件夹|路径|vault|库里|库中|库内)/i.test(compact);
  if (!hasFileTarget) return false;
  if (/(建议|建議|建立联系|建立關係|建立关系|怎么看|怎麼看|为什么|為什麼|是什么|是什麼|解释|说明|說明|如何|怎么|怎麼)/.test(compact) && !/(根目录|目录下|\.md|md|markdown|文件|笔记|文档|路径)/i.test(compact)) {
    return false;
  }
  return true;
}

export function isBareCreateVaultFilePrompt(prompt: string): boolean {
  const text = prompt.trim();
  if (!text || text.length > 60 || !looksLikeCreateVaultFilePrompt(text)) return false;
  if (looksLikePathQuery(text)) return false;
  if (/(?:叫|名为|命名|标题|内容|正文|写入|包含|放到|保存到|目录|文件夹|路径|named|called|title|content|body|under|inside|path|folder|directory)/i.test(text)) return false;
  const compact = text.toLowerCase().replace(/[\s，。！？!?.、~～"'`]+/g, "");
  if (/^(?:create|make|new)(?:a|an)?(?:empty|blank)?(?:md|markdown)?(?:file|note|document)$/.test(compact)) return true;
  return /^(?:创建|新建|建立|生成|建|做|弄)(?:一个|个|一份|份)?(?:空白|新的)?(?:md|markdown)?(?:文件|笔记|文档)$/.test(compact);
}

export function compactPromptForDedup(text: string): string {
  return text.replace(/\s+/g, "").trim().toLowerCase();
}

export function samePromptForDedup(left: string, right: string): boolean {
  const a = compactPromptForDedup(left);
  const b = compactPromptForDedup(right);
  return Boolean(a) && a === b;
}

export function promptContainsForDedup(haystack: string, needle: string): boolean {
  const target = compactPromptForDedup(needle);
  if (!target) return false;
  return compactPromptForDedup(haystack).includes(target);
}

export function isInformationSeekingPrompt(prompt: string): boolean {
  const compact = prompt.trim().toLowerCase().replace(/[\s，。！？!?.、~～"'`]+/g, "");
  if (!compact) return false;
  if (promptNeedsIdentityMemory(prompt)) return true;
  return /(what|which|who|where|when|why|how|howmany|list|show|read|open|check|inspect|query|version|explain|summari[sz]e|analy[sz]e|status|tellme|inventory|哪些|那些|哪个|哪個|哪里|哪裡|谁|誰|有啥|有什么|有什麼|有哪些|有那些|多少|几个|幾個|列出|清单|清單|列表|查看|看看|检查|查一下|读取|打开|是什么|是什麼|是多少|什么时候|什麼時候|何时|何時|如何|怎么|怎麼|版本|版本号|版本號|什么意思|什麼意思|解释|說明|说明|总结|總結|分析|为什么|為什麼|原因|状态|狀態|情况|情況|装了哪些|裝了哪些|启用了哪些|啟用了哪些)/i.test(compact);
}

export function hasFinalConclusion(content: string): boolean {
  return /(^|\n)\s*#{1,3}\s*(最终结论|Final conclusion|Final answer)\b/i.test(content)
    || /(^|\n)\s*(最终结论|Final conclusion|Final answer)\s*[:：]/i.test(content)
    || /(^|\n)\s*(改动\/读取的文件|改动的文件|Changed\/read files|Changed files)\s*[:：]/i.test(content)
    || (/(^|\n)\s*1[.、]\s+/.test(content) && /(^|\n)\s*(结果和提醒|结果|Result|Verification|Reminders)\s*[:：]/i.test(content));
}

export function normalizeSingleConclusionNumbering(content: string): string {
  const lines = content.split(/\r?\n/);
  const numbered: Array<{ index: number; number: number }> = [];
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*<!--/.test(line)) continue;
    const match = line.match(/^\s*(?:\*\*)?(\d+)[.、)）．](?:\*\*)?\s+/);
    if (match) numbered.push({ index, number: Number.parseInt(match[1], 10) });
  }
  if (numbered.length !== 1 || numbered[0].number !== 1) return content;
  const target = numbered[0].index;
  lines[target] = (lines[target] ?? "").replace(/^(\s*)(?:\*\*)?1[.、)）．](?:\*\*)?\s+/, "$1");
  return lines.join("\n");
}

export function looksLikeHumanFinalAnswer(content: string): boolean {
  const text = stripStructuredChoices(stripProgrammaticRunStats(content).content)
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length < 12) return false;
  if (isPromptishProgressNoteLine(text) || isOnlyRunStatsText(text)) return false;
  if (/^(?:执行中|已执行|失败|running|executed|failed)\b/i.test(text)) return false;
  return /(?:完成|已|修复|改动|验证|结果|结论|原因|需要|等待|阻塞|失败|成功|done|completed|changed|fixed|verified|result|blocked|failed)/i.test(text)
    || /(?:^|\n)\s*(?:1[.、]|[-*]\s+)/.test(content);
}

export function resumableTaskFromRawMessages(messages: Record<string, unknown>[], reason: "stopped" | "failed", detail = ""): ResumableTaskState | null {
  const user = [...messages].reverse().find((message) => message.role === "user" && typeof message.content === "string");
  const prompt = typeof user?.content === "string" ? user.content.trim() : "";
  if (!prompt || isTrivialChatPrompt(prompt)) return null;
  return { prompt: trimContext(prompt, 2000), reason, at: Date.now(), detail };
}

export function isProcessOnlySessionContent(content: string): boolean {
  return isLegacyProgressStatusMessage(content);
}

export function usefulResultLines(result: string): string[] {
  return result
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^(read|command)\s+[^\n]+$/i.test(trimmed)) return false;
      return true;
    })
    .map((line) => trimContext(redactSensitiveText(line), 220));
}

export function commandArgsForProcessHeadline(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const keys = ["query", "path", "id", "name", "target", "targetKind", "limit"];
  const parts: string[] = [];
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) parts.push(`${key}=${JSON.stringify(trimContext(value.trim(), 50))}`);
    else if (typeof value === "number" || typeof value === "boolean") parts.push(`${key}=${String(value)}`);
  }
  return parts.slice(0, 4).join(" ");
}

export function formatInstalledPluginsSummary(plugins: InstalledPluginInfo[], enabledCount: number, includeDisabled: boolean): string {
  if (!plugins.length) {
    return "没有在 Obsidian 社区插件启用列表里找到已启用社区插件。";
  }
  const title = includeDisabled
    ? `已启用 ${enabledCount} 个；插件目录共 ${plugins.length} 个`
    : `已启用 ${enabledCount} 个`;
  const lines = plugins.map((plugin, index) => {
    const state = plugin.enabled ? "" : " [未启用]";
    const version = plugin.version ? ` v${plugin.version}` : "";
    const manifest = plugin.manifestFound ? "" : " [缺 manifest]";
    const error = plugin.error ? ` [manifest 读取失败: ${trimContext(plugin.error, 80)}]` : "";
    const name = plugin.name && plugin.name !== plugin.id ? `${plugin.name} (${plugin.id})` : plugin.id;
    return `${index + 1}. ${name}${version}${state}${manifest}${error}`;
  });
  return `${title}：\n\n${lines.join("\n")}`;
}

export function countVaultOverviewKinds(files: TFile[]): Record<string, number> {
  const result: Record<string, number> = {
    markdown: 0,
    pdf: 0,
    image: 0,
    office: 0,
    canvas: 0,
    text: 0,
    other: 0
  };
  for (const file of files) {
    const extension = file.extension.toLowerCase();
    if (isMarkdownFile(file)) result.markdown += 1;
    else if (isPdfFile(file)) result.pdf += 1;
    else if (isImagePath(file.path)) result.image += 1;
    else if (/^(docx?|xlsx?|pptx?|ods|csv)$/i.test(extension)) result.office += 1;
    else if (extension === "canvas" || extension === "base") result.canvas += 1;
    else if (isContextTextFile(file)) result.text += 1;
    else result.other += 1;
  }
  return result;
}

export function countVaultOverviewExtensions(files: TFile[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const extension = file.extension.toLowerCase() || "(none)";
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function timestampMs(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
}

export function formatElapsed(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe < 1000) return `${safe}ms`;
  const seconds = Math.round(safe / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m${String(rest).padStart(2, "0")}s`;
}

export function activeFilePathFromToolRuns(runs: ToolRun[]): string {
  for (const run of [...runs].reverse()) {
    if (run.status !== "executed") continue;
    if (run.action.type !== "command" || run.action.command.trim() !== "obsidian.currentView") continue;
    const match = (run.result ?? "").match(/^activeFile:\s*(.+)$/m);
    const path = match?.[1]?.trim();
    if (path) return normalizePath(path);
  }
  return "";
}

export function promptRequiresStateChange(prompt: string): boolean {
  if (promptExplicitlyRequestsReadOnly(prompt)) return false;
  if (isDirectAnswerOnlyPrompt(prompt)) return false;
  if (isInformationSeekingPrompt(prompt) && !hasExplicitExecutionDirective(prompt)) return false;
  const compact = compactImplementationIntentText(prompt);
  if (!compact) return false;
  if (isExecutableTtsPrompt(prompt)) return true;
  if (looksLikeCreateVaultFilePrompt(prompt)) return true;
  return /(add|implement|change|modify|update|delete|move|rename|create|install|restart|build|execute|patch|write|format|polish|restore|rollback|hot.?patch|run|apply|save|commit|release|publish|configure|加|新增|添加|补|改|修改|更新|修复|修好|修一下|删|删除|移动|重命名|新建|创建|建立|生成|安装|装好|重启|构建|执行|运行|打开|开启|写入|写|落地|美化|排版|格式化|润色|调整|恢复|回退|热补丁|保存|提交|发布|配置|设置|应用|弄好|做出来|做成)/i.test(compact);
}

export type OutcomeVerificationFailureState = {
  attempt: number;
  maxAttempts: number;
  atLimit: boolean;
};

export function outcomeVerificationFailureState(run: ToolRun): OutcomeVerificationFailureState | null {
  if (run.status !== "executed" || run.action.type !== "command") return null;
  const command = run.action.command.trim();
  if (!new Set(["cancip.outcome.verify", "cancip.outcome.capture", "cancip.outcome.exportPdf"]).has(command)) return null;
  const result = run.result ?? "";
  if (!/(?:结果验收：未通过|Outcome verification:\s*failed)/i.test(result)) return null;
  const match = result.match(/(?:轮次|Attempt)[：:]\s*(\d+)\s*\/\s*(\d+)/i);
  const attempt = match ? Math.max(1, Number(match[1])) : 1;
  const maxAttempts = match ? Math.max(1, Number(match[2])) : 1;
  return { attempt, maxAttempts, atLimit: attempt >= maxAttempts };
}

export function isRepairSlashCommand(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === "/修复" || normalized === "/fix" || normalized === "/repair";
}

export function looksLikePathQuery(input: string): boolean {
  return /(^|[\s"'`])\.?[A-Za-z0-9_\-\u4e00-\u9fff]+[/\\][^\s"'`]+/.test(input) || /\.[A-Za-z0-9]{2,6}($|[\s"'`，。；,;])/.test(input);
}

export function shouldScanHiddenForQuery(query: string): boolean {
  const lower = query.toLowerCase().trim();
  return lower.startsWith(".") || lower.includes("obsidian") || lower.includes("cancip") || lower.includes("config") || lower.includes("plugin") || lower.includes("插件") || lower.includes("配置");
}

export function scoreSearchCandidate(file: VaultTextFile, tokens: string[]): number {
  const text = `${file.basename}\n${file.path}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (file.basename.toLowerCase() === token) score += 100;
    if (file.basename.toLowerCase().includes(token)) score += 20;
    if (text.includes(token)) score += 8;
  }
  if (file.path.startsWith("AI/Cancip/Memory/")) score += 6;
  if (file.loaded) score += 2;
  return score;
}

export function scoreSearchText(path: string, title: string, content: string, tokens: string[]): number {
  const haystack = `${title}\n${path}\n${content}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const escaped = escapeRegExp(token);
    const matches = haystack.match(new RegExp(escaped, "g"));
    if (matches) score += matches.length;
    if (title.toLowerCase().includes(token)) score += 4;
    if (path.toLowerCase().includes(token)) score += 2;
  }
  return score;
}

export function lightweightRagTextChunks(text: string, targetChars = 1000, overlapChars = 140): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const target = Math.max(320, Math.min(1800, Math.floor(targetChars)));
  const overlap = Math.max(40, Math.min(Math.floor(target / 3), Math.floor(overlapChars)));
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length && chunks.length < 48) {
    let end = Math.min(normalized.length, start + target);
    if (end < normalized.length) {
      const searchStart = Math.max(start + Math.floor(target * 0.58), end - 220);
      const tail = normalized.slice(searchStart, end + 1);
      const boundary = Math.max(tail.lastIndexOf("\n"), tail.lastIndexOf("。"), tail.lastIndexOf("！"), tail.lastIndexOf("？"), tail.lastIndexOf("."), tail.lastIndexOf("!"), tail.lastIndexOf("?"));
      if (boundary >= 0) end = searchStart + boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    const next = Math.max(start + 1, end - overlap);
    start = next;
  }
  return chunks;
}

export function rankLightweightRagChunks(
  chunks: LightweightRagChunk[],
  signals: string[],
  tokens: string[]
): Array<{ chunk: LightweightRagChunk; score: number; coverage: number }> {
  if (!chunks.length || !tokens.length) return [];
  const normalizedChunks = chunks.map((chunk) => `${chunk.title}\n${chunk.path}\n${chunk.text}`.normalize("NFKC").toLowerCase());
  const averageLength = normalizedChunks.reduce((sum, text) => sum + text.length, 0) / Math.max(1, normalizedChunks.length);
  const documentFrequency = new Map<string, number>();
  for (const token of tokens) {
    documentFrequency.set(token, normalizedChunks.reduce((count, text) => count + (text.includes(token.toLowerCase()) ? 1 : 0), 0));
  }
  const k1 = 1.2;
  const b = 0.72;
  return chunks.map((chunk, index) => {
    const haystack = normalizedChunks[index];
    let score = 0;
    let coverage = 0;
    for (const token of tokens) {
      const normalizedToken = token.toLowerCase();
      const occurrences = haystack.match(new RegExp(escapeRegExp(normalizedToken), "g"))?.length ?? 0;
      if (!occurrences) continue;
      coverage += 1;
      const frequency = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (chunks.length - frequency + 0.5) / (frequency + 0.5));
      const denominator = occurrences + k1 * (1 - b + b * haystack.length / Math.max(1, averageLength));
      score += idf * (occurrences * (k1 + 1)) / denominator;
    }
    for (const signal of signals) {
      const normalizedSignal = signal.normalize("NFKC").toLowerCase().trim();
      if (normalizedSignal.length >= 2 && haystack.includes(normalizedSignal)) score += 5;
    }
    if (/^(?:#{1,6}\s|title\s*[:：]|标题\s*[:：])/im.test(chunk.text)) score += 0.8;
    score += Math.min(3, coverage * 0.35);
    return { chunk, score: Math.round(score * 100) / 100, coverage };
  }).filter((item) => item.coverage > 0)
    .sort((left, right) => right.score - left.score || right.coverage - left.coverage || left.chunk.path.localeCompare(right.chunk.path));
}

export function scoreVaultTargetPath(path: string, title: string, kind: TargetCandidateKind, query: string, tokens: string[]): number {
  const normalizedPath = normalizePath(path);
  const field = `${title}\n${normalizedPath}\n${normalizedPath.split("/").join(" ")}`.toLowerCase();
  const compactField = field.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  const q = query.toLowerCase().trim();
  const compactQuery = q.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  let score = 0;
  const normalizedTitle = normalizeSimpleVaultTargetTitle(title);
  const normalizedQueryTitle = normalizeSimpleVaultTargetTitle(query);
  if (normalizedQueryTitle.length >= 2 && normalizedTitle === normalizedQueryTitle) score += 4000;
  if (q && title.toLowerCase() === q) score += 320;
  if (q && normalizedPath.toLowerCase() === q) score += 340;
  if (compactQuery && title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "") === compactQuery) score += 260;
  if (compactQuery && compactField.includes(compactQuery)) score += 180;
  if (compactQuery.length >= 3 && isSubsequence(compactQuery, compactField)) score += 48;
  const pathParts = normalizedPath.toLowerCase().split(/[/._\s-]+/).filter(Boolean);
  const titleLower = title.toLowerCase();
  for (const token of tokens) {
    if (!token) continue;
    if (titleLower === token) score += 120;
    if (pathParts.some((part) => part === token)) score += 80;
    if (titleLower.startsWith(token)) score += 64;
    if (titleLower.includes(token)) score += 42;
    if (normalizedPath.toLowerCase().includes(token)) score += 26;
    const bestSimilarity = Math.max(
      normalizedSimilarity(token, titleLower),
      ...pathParts.slice(-5).map((part) => normalizedSimilarity(token, part))
    );
    if (bestSimilarity >= 0.78) score += Math.round(40 * bestSimilarity);
  }
  if (kind === "folder") score += 8;
  if (kind === "attachment" && (isPdfPath(normalizedPath) || isImagePath(normalizedPath))) score += 10;
  return score;
}

export function uniqueTargetCandidates(candidates: TargetCandidate[]): TargetCandidate[] {
  const seen = new Map<string, TargetCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${normalizePath(candidate.path)}`;
    const previous = seen.get(key);
    if (!previous || candidate.score > previous.score) seen.set(key, candidate);
  }
  return [...seen.values()];
}

export function normalizeTargetCandidateKind(value: unknown): TargetCandidateKind | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return "";
  if (/^(folder|directory|dir|目录|文件夹|資料夾|フォルダ|폴더)$/.test(normalized)) return "folder";
  if (/^(file|note|markdown|md|笔记|筆記|文件|文档|文章)$/.test(normalized)) return "file";
  if (/^(content|text|正文|内容|內容)$/.test(normalized)) return "content";
  if (/^(attachment|asset|pdf|image|office|附件|图片|圖片|图像|pdf文件)$/.test(normalized)) return "attachment";
  if (/^(attachmentcontent|parsedattachment|附件内容|附件內容|pdf内容|pdf內容)$/.test(normalized)) return "attachment-content";
  if (/^(command|cmd|obsidiancommand|命令|指令)$/.test(normalized)) return "command";
  return "";
}

export function inferTargetCandidateKindFromQuery(query: string): TargetCandidateKind | "" {
  const text = query.trim();
  if (!text) return "";
  if (/(目录|文件夹|資料夾|folder|directory|\bdir\b)/i.test(text)) return "folder";
  if (/(命令|指令|command|cmd|快捷键|hotkey)/i.test(text)) return "command";
  if (/(附件|图片|圖片|图像|pdf|docx|xlsx|pptx|office|attachment|image)/i.test(text)) return "attachment";
  if (/(正文|内容|內容|全文|content|text)/i.test(text)) return "content";
  if (/(笔记|筆記|文件|文档|markdown|\.md\b|\bmd\b|file|note|document)/i.test(text)) return "file";
  return "";
}

export function targetCandidateKindMatches(actual: TargetCandidateKind, requested: TargetCandidateKind): boolean {
  if (actual === requested) return true;
  if (requested === "file") return actual === "content";
  if (requested === "content") return actual === "file" || actual === "attachment-content";
  if (requested === "attachment") return actual === "attachment-content";
  if (requested === "attachment-content") return actual === "attachment";
  return false;
}

export function simpleVaultTargetRequestFromPrompt(prompt: string): SimpleVaultTargetRequest | null {
  const text = prompt.trim();
  if (!text || text.length > 180 || isTrivialChatPrompt(text) || isDirectAnswerOnlyPrompt(text)) return null;
  const openMatch = text.match(/(?:^|[\s，。；;])(?:打开|开启|显示|定位|跳转到?|前往|进入|open|show|reveal|focus|goto)\s*(?:一下|下|这个|這個|the)?\s*[:：]?\s*([^\n。！？!?]{1,120})/i);
  const readMatch = text.match(/(?:^|[\s，。；;])(?:读取|读|查看|看看|检查|查一下|read|inspect|check)\s*(?:一下|下|这个|這個|the)?\s*[:：]?\s*([^\n。！？!?]{1,120})/i);
  const match = openMatch ?? readMatch;
  if (!match) return null;
  const intent: SimpleVaultTargetRequest["intent"] = openMatch ? "open" : "read";
  return simpleVaultTargetRequestFromTargetQuery(match[1] ?? "", intent);
}

export function simpleVaultTargetRequestFromTargetQuery(rawQuery: string, intent: SimpleVaultTargetRequest["intent"] = "open"): SimpleVaultTargetRequest | null {
  const originalQuery = cleanSimpleVaultTargetQuery(rawQuery);
  if (!originalQuery) return null;
  const contained = splitContainedVaultTargetQuery(originalQuery);
  const query = contained?.target ?? originalQuery;
  const containerQuery = contained?.container;
  if (!query || query.length > 120) return null;
  if (simpleVaultTargetLooksLikeObsidianSurface(query) && !simpleVaultTargetExplicitlyMentionsFile(query)) return null;
  const inferredKind = inferTargetCandidateKindFromQuery(query)
    || (contained ? "file" : inferTargetCandidateKindFromQuery(originalQuery))
    || "file";
  const targetKind = inferredKind === "content" && simpleVaultTargetExplicitlyMentionsFile(query)
    ? "file"
    : inferredKind === "attachment-content" && simpleVaultTargetExplicitlyMentionsFile(query)
      ? "attachment"
      : inferredKind;
  if (targetKind === "command" || targetKind === "content" || targetKind === "attachment-content") return null;
  return { intent, query, targetKind, containerQuery, originalQuery };
}

export function cleanSimpleVaultTargetQuery(value: string): string {
  return value
    .replace(/^[\s"'“”‘’`《<【\[]+|[\s"'“”‘’`》>】\]]+$/g, "")
    .replace(/^(?:一下|下|这个|這個|当前|目前)\s*/i, "")
    .replace(/^(?:the|an?)\s+/i, "")
    .replace(/\s*(?:这个|這個|这篇|這篇|这个文件|這個文件|这个笔记|這個筆記)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitContainedVaultTargetQuery(rawQuery: string): { container: string; target: string } | null {
  const query = cleanSimpleVaultTargetQuery(rawQuery);
  if (!query || query.includes("/") || query.includes("\\")) return null;
  const patterns = [
    /^(.+?)(?:目录|目錄|文件夹|文件夾|資料夾|folder|directory)(?:里|裏|裡|里面|裏面|裡面|中|下|下面|内|內)?(?:的)?\s*(.+)$/i,
    /^(.+?)(?:里|裏|裡|里面|裏面|裡面|中|下|下面|内|內)(?:的)?\s*(.+)$/i
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const container = cleanContainerVaultTargetQuery(match?.[1] ?? "");
    const target = cleanSimpleVaultTargetQuery(match?.[2] ?? "").replace(/^的\s*/, "").trim();
    if (!container || !target || target === container) continue;
    if (/^(?:内容|內容|正文|text|content)$/i.test(target)) continue;
    return { container, target };
  }
  return null;
}

export function cleanContainerVaultTargetQuery(value: string): string {
  return cleanSimpleVaultTargetQuery(value)
    .replace(/(?:目录|目錄|文件夹|文件夾|資料夾|folder|directory)$/i, "")
    .trim();
}

export function normalizeSimpleVaultTargetTitle(value: string): string {
  const last = value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
  return last
    .replace(/\.[A-Za-z0-9]{1,8}$/i, "")
    .replace(/[\s"'“”‘’`《》<>【\]\[\]()（）{}._-]+/g, "")
    .toLowerCase()
    .trim();
}

export function isVaultOpenTargetSelectionNeededText(text: string): boolean {
  return /(?:目标不唯一|未自动打开|请指定目录或从候选中选择|找到多个.+(?:目标|候选)|multiple.+(?:targets|matches)|target.+(?:ambiguous|not unique))/i.test(text);
}

export function vaultOpenSelectionQueryFromText(text: string): string {
  const match = text.match(/(?:未自动打开|目标不唯一)[:：]\s*([^\n。；;]+)/i)
    ?? text.match(/找到多个[“"]?([^”"\n。；;]+)[”"]?/i);
  return match?.[1]?.trim() ?? "";
}

export function vaultOpenCandidatePathsFromText(text: string): string[] {
  const match = text.match(/候选[:：]\s*([^\n]+)/i)
    ?? text.match(/Candidates?[:：]\s*([^\n]+)/i);
  if (!match) return [];
  return uniqueStrings((match[1] ?? "")
    .split(/[；;,，]/)
    .map((item) => item.replace(/^\s*\d+[.)、]\s*/, "").replace(/\s*\[[^\]]+\]\s*$/, "").trim())
    .filter((item) => item && !/^(none|无|暂无)$/i.test(item))
    .map((item) => item.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")));
}

export function vaultOpenCandidateChoiceTexts(text: string): string[] {
  return vaultOpenCandidatePathsFromText(text).map((path) => `打开 ${path}`);
}

export function resolveVaultOpenCandidateFollowup(prompt: string, candidates: string[]): string {
  const text = prompt.trim();
  const paths = uniqueStrings(candidates.map((path) => normalizePath(path)).filter(Boolean));
  if (!text || !paths.length) return "";
  const normalizedText = normalizePath(text.replace(/\\/g, "/")).toLocaleLowerCase();
  const compactText = normalizeSimpleVaultTargetTitle(text);
  const one = (matches: string[]): string => {
    const unique = uniqueStrings(matches);
    return unique.length === 1 ? unique[0] : "";
  };

  const direct = one(paths.filter((path) => normalizedText.includes(path.toLocaleLowerCase())));
  if (direct) return direct;

  const ordinalMatch = text.match(/(?:第\s*([1-9一二三四五六七八九])\s*(?:个|項|项|条|條|号|號)?|(?:选|選|选择|選擇|打开|開啟|open|choose)\s*([1-9])\s*(?:个|項|项|条|條|号|號)?|^\s*([1-9一二三四五六七八九])\s*$)/i);
  const ordinalToken = ordinalMatch?.[1] ?? ordinalMatch?.[2] ?? ordinalMatch?.[3] ?? "";
  const ordinalMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const ordinal = ordinalToken ? ordinalMap[ordinalToken] ?? Number.parseInt(ordinalToken, 10) : 0;
  if (ordinal >= 1 && ordinal <= paths.length) return paths[ordinal - 1];

  if (/(?:根目录|根目錄|库根|庫根|vault\s*root|root\s*(?:folder|directory)|顶层|頂層)/i.test(text)) {
    const root = one(paths.filter((path) => !path.includes("/")));
    if (root) return root;
  }

  const parentMatches = one(paths.filter((path) => {
    const parentSegments = path.split("/").slice(0, -1);
    return parentSegments.some((segment) => {
      const normalizedSegment = normalizeSimpleVaultTargetTitle(segment);
      return normalizedSegment.length > 0 && compactText.includes(normalizedSegment);
    });
  }));
  if (parentMatches) return parentMatches;

  return one(paths.filter((path) => {
    const fileName = path.split("/").pop() ?? path;
    const normalizedName = normalizeSimpleVaultTargetTitle(fileName);
    return normalizedName.length > 0 && compactText.includes(normalizedName);
  }));
}

export function simpleVaultTargetExplicitlyMentionsFile(text: string): boolean {
  return /(?:文件|笔记|筆記|文档|文章|附件|图片|圖片|pdf|docx|xlsx|pptx|markdown|\.md\b|\bmd\b|file|note|document|attachment|image)/i.test(text);
}

export function simpleVaultTargetLooksLikeObsidianSurface(text: string): boolean {
  return /(?:设置|设置页|设置面板|命令|命令面板|插件|侧边栏|状态栏|工作区|标签页|页签|按钮|工具栏|搜索|settings?|command|palette|plugin|sidebar|status\s*bar|workspace|tab|pane|toolbar|button)/i.test(text);
}

export function kindRank(kind: TargetCandidateKind): number {
  if (kind === "content") return 0;
  if (kind === "file") return 1;
  if (kind === "folder") return 2;
  if (kind === "command") return 3;
  if (kind === "attachment-content") return 4;
  return 5;
}

export function memoryFilePriority(path: string, prompt = ""): number {
  const name = path.split("/").pop() ?? "";
  const order = promptNeedsIdentityMemory(prompt) ? [
    "PROFILE.md",
    "USER_PREFERENCES_QUICK.md",
    "PREFERENCES.md",
    "CANCIP_INDEX.md",
    "PROJECTS.md",
    "WORKFLOWS.md",
    "TOOLS.md",
    "SKILLS.md",
    "obsidian-整理偏好.md",
    "INDEX.md",
    "NOTIFICATIONS.md",
    "TRADING.md",
    "C-DEPENDENCY-MIGRATION.md",
    "README.md"
  ] : [
    "CANCIP_INDEX.md",
    "USER_PREFERENCES_QUICK.md",
    "PREFERENCES.md",
    "PROJECTS.md",
    "WORKFLOWS.md",
    "TOOLS.md",
    "SKILLS.md",
    "PROFILE.md",
    "obsidian-整理偏好.md",
    "INDEX.md",
    "NOTIFICATIONS.md",
    "TRADING.md",
    "C-DEPENDENCY-MIGRATION.md",
    "README.md"
  ];
  const index = order.indexOf(name);
  const base = index >= 0 ? index : 100;
  if (!prompt.trim()) return base;
  const lowerPrompt = prompt.toLocaleLowerCase();
  const normalizedName = normalizeSimpleVaultTargetTitle(name);
  let relevance = 0;
  for (const token of tokenize(prompt)) {
    const compact = normalizeSimpleVaultTargetTitle(token);
    if (compact.length >= 2 && normalizedName.includes(compact)) relevance += 24;
  }
  if (/(?:\bob\b|obsidian|整理|摘要|链接|連結|雙向|双向|tag|标签|筆記|笔记)/i.test(lowerPrompt)
    && /obsidian整理偏好/i.test(normalizedName)) relevance += 240;
  if (/(?:偏好|习惯|習慣|preference|habit)/i.test(lowerPrompt) && /preferences?|用户偏好|偏好/i.test(normalizedName)) relevance += 90;
  if (promptNeedsIdentityMemory(prompt) && /profile|userpreferencesquick|preferences|用户|身份|画像/i.test(normalizedName)) relevance += 180;
  if (/(?:项目|專案|project)/i.test(lowerPrompt) && /projects?|项目/i.test(normalizedName)) relevance += 120;
  if (/(?:流程|步骤|步驟|workflow)/i.test(lowerPrompt) && /workflows?|流程/i.test(normalizedName)) relevance += 120;
  if (/(?:工具|命令|路径|路徑|tool|command)/i.test(lowerPrompt) && /tools?|工具/i.test(normalizedName)) relevance += 120;
  if (/(?:skill|技能|能力)/i.test(lowerPrompt) && /skills?|技能|能力/i.test(normalizedName)) relevance += 120;
  return base * 5 - relevance;
}

export function memoryPromptRoutingTokens(prompt: string): string[] {
  const tokens: string[] = [];
  if (/(?:\bob\b|obsidian|整理|摘要|链接|連結|双向|雙向|tag|标签|筆記|笔记)/i.test(prompt)) {
    tokens.push("整理", "摘要", "链接", "双向", "tag", "属性");
  }
  if (/(?:偏好|习惯|習慣|preference|habit)/i.test(prompt)) tokens.push("偏好", "原则", "规则");
  if (promptNeedsIdentityMemory(prompt)) tokens.push("身份", "用户", "偏好");
  if (/(?:流程|步骤|步驟|workflow)/i.test(prompt)) tokens.push("流程", "步骤");
  if (/(?:工具|命令|tool|command)/i.test(prompt)) tokens.push("工具", "命令");
  if (/(?:skill|技能|能力)/i.test(prompt)) tokens.push("Skill", "技能", "能力");
  return uniqueStrings(tokens);
}

export function editorAutocompleteMemoryQueryTokens(values: string[]): string[] {
  const ignored = new Set([
    "md", "txt", "json", "markdown", "file", "folder", "http", "https", "www", "com",
    "今天", "当前", "文件", "笔记", "日记", "需要", "继续", "完成", "相关", "处理"
  ]);
  const candidates = values.flatMap((value) => [value, ...tokenize(value)]);
  return uniqueStrings(candidates
    .map((token) => token.toLocaleLowerCase().trim())
    .filter((token) => token.length >= 2 && token.length <= 48)
    .filter((token) => !ignored.has(token))
    .filter((token) => !token.includes("/") && !token.includes("\\"))
    .filter((token) => !/^\d+$/.test(token) && !/^\d{4}[-_/]\d{1,2}(?:[-_/]\d{1,2})?$/.test(token))
    .filter((token) => !/^\.?[a-z0-9]{1,5}$/.test(token) || !ignored.has(token.replace(/^\./, ""))));
}

export function editorAutocompleteMemorySourceTopics(path: string): string {
  const name = (path.split("/").pop() ?? "").toLocaleLowerCase();
  if (name === "profile.md") return "用户 姓名 称呼 身份 工作 职业 医疗 行政 复诊 转诊";
  if (name === "user_preferences_quick.md" || name === "preferences.md") return "偏好 默认 习惯 风格 中文 设置 用户";
  if (name === "projects.md" || name === "project_memory.md") return "项目 源码 版本 开发 插件 cancip 功能 修复 继续 进度";
  if (name === "workflows.md") return "流程 步骤 自动化 安排 整理 复诊 转诊 患者 证书 医疗 行政 通知 核对 模板 工作";
  if (name === "tools.md") return "工具 路径 命令 api cli 接口 脚本 环境";
  if (name === "skills.md") return "skill skills 技能 工作流 复用";
  if (name === "obsidian-整理偏好.md" || name === "obsidian_plugin_playbook.md") return "obsidian ob 笔记 vault 插件 pdf 文件 整理";
  if (name === "notifications.md") return "通知 提醒 微信 ntfy 消息 完成";
  if (name === "trading.md") return "交易 mt5 持仓 复盘 行情 风险";
  if (name === "experience.md") return "经验 成功 失败 修复 路线 验证";
  if (name === "cancip_index.md" || name === "index.md") return "索引 入口 记忆 cancip";
  return "";
}

export function editorAutocompleteMemorySourceScore(document: EditorAutocompleteMemoryDocument, tokens: string[]): number {
  const path = document.path.toLocaleLowerCase();
  const searchText = (document.searchText ?? "").toLocaleLowerCase();
  const topics = editorAutocompleteMemorySourceTopics(document.path).toLocaleLowerCase();
  let score = Math.max(0, 18 - document.priority);
  for (const token of tokens) {
    if (searchText.includes(token)) score += 30;
    if (topics.includes(token)) score += 24;
    if (path.includes(token)) score += 18;
  }
  return score;
}

export function uniqueEditorAutocompleteMemoryDocuments(documents: EditorAutocompleteMemoryDocument[]): EditorAutocompleteMemoryDocument[] {
  const seen = new Set<string>();
  return documents.filter((document) => {
    if (seen.has(document.path)) return false;
    seen.add(document.path);
    return true;
  });
}

export function editorAutocompleteMemorySnippetTokens(document: EditorAutocompleteMemoryDocument, tokens: string[]): string[] {
  const name = (document.path.split("/").pop() ?? "").toLocaleLowerCase();
  if (name === "workflows.md" && tokens.some((token) => /复诊|转诊|患者|证书|医疗|行政/.test(token))) {
    return uniqueStrings(["医疗行政材料", "医疗行政", ...tokens]);
  }
  return tokens;
}

export function editorAutocompleteSessionMemory(raw: string, fallbackTitle: string): string {
  try {
    const snapshot = JSON.parse(raw) as unknown;
    if (!isRecord(snapshot)) return "";
    const title = typeof snapshot.title === "string" && snapshot.title.trim() ? snapshot.title.trim() : fallbackTitle;
    const lines = [`会话：${trimContext(title, 100)}`];
    const messages = Array.isArray(snapshot.messages) ? snapshot.messages.filter(isRecord).slice(-8) : [];
    for (const message of messages) {
      const role = message.role === "user" ? "用户" : message.role === "assistant" ? "助手" : "记录";
      const content = typeof message.content === "string"
        ? trimContext(redactSensitiveText(message.content).replace(/\s+/g, " ").trim(), 280)
        : "";
      if (content) lines.push(`${role}：${content}`);
    }
    if (isRecord(snapshot.resumableTask) && typeof snapshot.resumableTask.prompt === "string") {
      lines.push(`未完事项：${trimContext(redactSensitiveText(snapshot.resumableTask.prompt).replace(/\s+/g, " ").trim(), 240)}`);
    }
    return trimContext(lines.join("\n"), 1900);
  } catch {
    return "";
  }
}

export function editorAutocompleteMemoryDocumentScore(document: EditorAutocompleteMemoryDocument, tokens: string[]): number {
  if (!tokens.length) return 0;
  const path = document.path.toLocaleLowerCase();
  const content = `${document.searchText ?? ""}\n${document.content}`.toLocaleLowerCase();
  const topics = editorAutocompleteMemorySourceTopics(document.path).toLocaleLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!token || token.length < 2) continue;
    if (path.includes(token)) score += 18;
    if (topics.includes(token)) score += 12;
    let from = 0;
    let matches = 0;
    while (matches < 4) {
      const hit = content.indexOf(token, from);
      if (hit < 0) break;
      matches += 1;
      from = hit + token.length;
    }
    if (matches) score += 6 + matches * 2;
  }
  if (!score) return 0;
  if (document.kind === "project") score += 5;
  if (document.kind === "experience") score += 3;
  if (document.kind === "session") score += 4;
  return score + Math.max(0, 8 - Math.floor(document.priority / 10));
}

export function scheduleIdleWork(callback: () => void, timeoutMs: number): () => void {
  const idleWindow = window as unknown as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  let cancelled = false;
  let settled = false;
  const settle = () => {
    if (cancelled || settled) return;
    settled = true;
    callback();
  };
  // Chromium suspends requestAnimationFrame and requestIdleCallback outright while the
  // window is hidden or occluded, and Obsidian normally sits behind another window.
  // Everything deferred through this helper - the agent bridge, the CLI install, the
  // local model catalog - therefore only ran if the user happened to be looking at
  // Obsidian, and requestIdleCallback's own timeout option does not rescue it because
  // that deadline is measured in frames rather than wall-clock time. Race the idle
  // callback against a timer of the same length: the visible case still goes through
  // idle, the hidden case settles instead of hanging, and the settle latch keeps the
  // callback single-shot when both arrive.
  if (typeof idleWindow.requestIdleCallback !== "function") {
    const fallback = window.setTimeout(settle, Math.min(timeoutMs, 800));
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }
  const timer = window.setTimeout(settle, Math.max(0, timeoutMs));
  const idleId = idleWindow.requestIdleCallback(settle, { timeout: timeoutMs });
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    idleWindow.cancelIdleCallback?.(idleId);
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
}

export function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return "";
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (typeof direct === "string") return direct.trim();
  const lower = name.toLowerCase();
  const hit = Object.entries(headers).find(([key]) => key.toLowerCase() === lower);
  return typeof hit?.[1] === "string" ? hit[1].trim() : "";
}

export function modelRetryAfterMsFromReason(reason: string): number | null {
  const text = reason.trim();
  if (!text) return null;
  const retryAfterMatch = text.match(/\bretry[-_ ]?after\b["'\s:=]+([^"',;\s}]+)/i);
  if (retryAfterMatch) {
    const parsed = retryDelayTokenToMs(retryAfterMatch[1]);
    if (parsed !== null) return parsed;
  }
  const retryAfterMsMatch = text.match(/\bretry[-_ ]?after[-_ ]?ms\b["'\s:=]+(\d{2,7})\b/i);
  if (retryAfterMsMatch) {
    const value = Number(retryAfterMsMatch[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const bodyJson = parseFirstJsonObject(text);
  const parsed = retryAfterMsFromJson(bodyJson);
  return parsed;
}

export function retryDelayTokenToMs(value: string): number | null {
  const token = value.trim().replace(/^["']|["']$/g, "");
  if (!token) return null;
  const numeric = Number(token);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric * 1000);
  const dateMs = Date.parse(token);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export function retryAfterMsFromJson(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const candidates = [
    value.retry_after_ms,
    value.retryAfterMs,
    value.retry_after,
    value.retryAfter,
    isRecord(value.error) ? value.error.retry_after_ms : undefined,
    isRecord(value.error) ? value.error.retryAfterMs : undefined,
    isRecord(value.error) ? value.error.retry_after : undefined,
    isRecord(value.error) ? value.error.retryAfter : undefined
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate > 1000 ? Math.round(candidate) : Math.round(candidate * 1000);
    }
    if (typeof candidate === "string") {
      const parsed = retryDelayTokenToMs(candidate);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

export function isRateLimitRetryReason(reason: string): boolean {
  return /(?:HTTP\s*429|\b429\b|rate[-_\s]?limit|too\s+many\s+requests|requests\s+per\s+(?:minute|day)|tokens\s+per\s+(?:minute|day)|quota|retry[-_ ]?after)/i.test(reason);
}

export function isServiceRetryReason(reason: string): boolean {
  return isRateLimitRetryReason(reason)
    || /(?:HTTP\s*(?:408|425|500|502|503|504|529)\b|\b(?:408|425|500|502|503|504|529)\b|timeout|timed\s*out|temporarily\s+unavailable|overloaded|server\s+busy|upstream|gateway|connection\s+(?:reset|closed|aborted)|network\s+error|econnreset|etimedout)/i.test(reason);
}

export function isTtsProvider(value: unknown): value is TtsProvider {
  return value === "auto"
    || value === "builtin-prime-tts"
    || value === "android-system"
    || value === "web-speech"
    || value === "custom-url";
}

export function isTtsQualityMode(value: unknown): value is TtsQualityMode {
  return value === "quality-first";
}

export function defaultTtsVoiceForLanguage(lang: string): string {
  const lower = lang.toLowerCase();
  if (lower.startsWith("zh-tw")) return "zh-TW-HsiaoChenNeural";
  if (lower.startsWith("zh")) return "zh-CN-XiaoxiaoNeural";
  if (lower.startsWith("ja")) return "ja-JP-NanamiNeural";
  if (lower.startsWith("ko")) return "ko-KR-SunHiNeural";
  if (lower.startsWith("fr")) return "fr-FR-DeniseNeural";
  if (lower.startsWith("de")) return "de-DE-KatjaNeural";
  if (lower.startsWith("es")) return "es-ES-ElviraNeural";
  if (lower.startsWith("ru")) return "ru-RU-SvetlanaNeural";
  if (lower.startsWith("tr")) return "tr-TR-EmelNeural";
  if (lower.startsWith("ar")) return "ar-SA-ZariyahNeural";
  return "en-US-AvaMultilingualNeural";
}

export function base64ToArrayBuffer(input: string): ArrayBuffer {
  const clean = input.includes(",") ? input.split(",").pop() ?? "" : input;
  const binary = atob(clean.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function parsePrimeTtsMeta(text: string): PrimeTtsMeta {
  const raw = JSON.parse(text) as unknown;
  if (!isRecord(raw)) throw new Error("PrimeTTS meta.json is not an object");
  const sampleRate = Number(raw.sample_rate);
  const absFrameBins = Number(raw.abs_frame_bins);
  const maxFrames = Number(raw.max_frames);
  if (!Number.isFinite(sampleRate) || !Number.isFinite(absFrameBins) || !Number.isFinite(maxFrames)) {
    throw new Error("PrimeTTS meta.json is missing numeric sample_rate/abs_frame_bins/max_frames");
  }
  return { sample_rate: sampleRate, abs_frame_bins: absFrameBins, max_frames: maxFrames };
}

export function formatI18n(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function countsTowardToolActionBudget(action: CancipAction): boolean {
  return action.type !== "todo";
}

export function isAbortControllerAborted(request: AbortController): boolean {
  return Boolean((request as unknown as { signal?: { aborted?: boolean } }).signal?.aborted);
}

export function vaultPathParent(path: string): string {
  const normalized = normalizePath(path.replace(/\\/g, "/"));
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

export function normalizeFilePinPath(path: string): string {
  const stripped = String(path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!stripped) return "";
  return normalizePath(stripped).replace(/^\/+|\/+$/g, "");
}

export function normalizeFilePinFolderPath(path: string): string {
  return normalizeFilePinPath(path);
}

export function emptyHtmlAppState(): HtmlAppState {
  return { version: 1, pinned: [], order: [], known: [] };
}

export function normalizeHtmlAppState(raw: unknown): HtmlAppState {
  const record = isRecord(raw) ? raw : {};
  const paths = (value: unknown): string[] => Array.isArray(value)
    ? uniqueStrings(value
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizePath(item.replace(/\\/g, "/")))
        .filter((item) => /\.html?$/i.test(item)))
    : [];
  return {
    version: 1,
    pinned: paths(record.pinned),
    order: paths(record.order),
    known: paths(record.known)
  };
}

export function removePathFromFilePinFolders(folders: Record<string, string[]>, path: string): void {
  for (const [folder, paths] of Object.entries(folders)) {
    folders[folder] = paths.filter((item) => item !== path);
  }
  removeEmptyFilePinFolders(folders);
}

export function removeEmptyFilePinFolders(folders: Record<string, string[]>): void {
  for (const [folder, paths] of Object.entries(folders)) {
    const unique = uniqueStrings(paths.map(normalizeFilePinPath).filter(Boolean));
    if (unique.length) folders[folder] = unique;
    else delete folders[folder];
  }
}

export function filePinPathMatchesBase(path: string, basePath: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`);
}

export function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function stableCacheKey(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

export function uniqueCancipActions(actions: CancipAction[]): CancipAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = stableCacheKey(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalJsonValue(item));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = canonicalJsonValue(value[key]);
  }
  return output;
}

export function normalizeApiProfile(raw: Partial<ApiProfile>, fallback: ApiProfile): ApiProfile {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallback.id;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallback.name;
  const apiMode = isApiMode(raw.apiMode) ? raw.apiMode : fallback.apiMode;
  return {
    id,
    name,
    apiUrl: typeof raw.apiUrl === "string" ? raw.apiUrl.trim() : fallback.apiUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : fallback.apiKey,
    apiMode,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : fallback.model
  };
}

export function apiEndpointIdentity(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

export function sanitizeModelNameOverrides(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [model, name] of Object.entries(value)) {
    const key = String(model ?? "").trim();
    const label = String(name ?? "").trim();
    if (key && label) result[key] = label;
  }
  return result;
}

export function defaultModelSourceByModel(models: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const model of models) {
    const normalized = String(model ?? "").trim();
    if (!normalized) continue;
    result[normalized] = defaultModelSourceIdForModel(normalized);
  }
  return result;
}

export function defaultModelSourceIdForModel(model: string): string {
  const lower = model.trim().toLowerCase();
  if (!lower) return "default";
  if (lower.startsWith("qwen/") || lower.startsWith("deepseek-ai/") || lower.startsWith("baai/") || lower.startsWith("zai-org/")) return "siliconflow";
  if (lower.includes("/") || lower.startsWith("anthropic/") || lower.startsWith("google/") || lower.startsWith("deepseek/") || lower.startsWith("x-ai/") || lower.startsWith("mistralai/") || lower.startsWith("meta-llama/")) return "openrouter";
  if (/^(gpt-|o\d|chatgpt-|openai-)/.test(lower)) return "default";
  if (lower.startsWith("gemini-")) return "google-gemini";
  if (lower.startsWith("deepseek-")) return "deepseek";
  if (/^(qwen|qwq|wanx|baichuan)/.test(lower)) return "dashscope";
  if (/^(kimi|moonshot)/.test(lower)) return "moonshot";
  if (/^(glm|charglm)/.test(lower)) return "zhipu";
  if (/^(grok|xai)/.test(lower)) return "xai";
  if (/^(mistral|codestral|open-mistral|pixtral)/.test(lower)) return "mistral";
  if (/^(sonar|pplx)/.test(lower)) return "perplexity";
  if (/^(llama|mixtral|meta-llama)/.test(lower)) return "groq";
  return "openrouter";
}

export function isCjkChar(char: string): boolean {
  return /[\u3400-\u9fff]/.test(char);
}

export function hasCjkText(input: string): boolean {
  return /[\u3400-\u9fff]/.test(input);
}

export function looksLikeEnglishTtsText(input: string): boolean {
  const letters = input.match(/[A-Za-z]/g)?.length ?? 0;
  if (!letters) return false;
  const cjk = input.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return letters >= Math.max(3, cjk * 2);
}

export function normalizeTagList(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [];
  return uniqueStrings(values
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeTagName(item))
    .filter(Boolean))
    .slice(0, 200);
}

export function isStaleUiButtonMenuSelector(selector: string): boolean {
  const normalized = selector.trim();
  if (!/menu(?:-|\.| |>|$)|\[role=['"]?menuitem['"]?\]/i.test(normalized)) return false;
  return /:nth-of-type\(/.test(normalized)
    || /\.obcc-ui-rule-/.test(normalized)
    || /(^|[\s>])div\.menu-item\b/.test(normalized)
    || /(^|[\s>])div\.menu-group\b/.test(normalized);
}

export function isStaleUiButtonViewActionSelector(selector: string): boolean {
  const normalized = selector.trim();
  if (!/:nth-of-type\(/.test(normalized) && !/\.obcc-ui-rule-/.test(normalized)) return false;
  return /\.view-action\b/.test(normalized)
    || /\.clickable-icon\b/.test(normalized)
    || /\.view-actions\b/.test(normalized)
    || /\.view-header\b/.test(normalized);
}

export function migrateUiButtonStatusBarSelector(selector: string): string {
  const normalized = selector.trim();
  if (!/\.status-bar\b|\.status-bar-item\b|\.obcc-statusbar\b/.test(normalized)) return "";
  if (/\.obcc-statusbar\b|plugin-cancip\b|aria-label=["'][^"']*Cancip/i.test(normalized)) return ".status-bar .obcc-statusbar";
  const pluginMatch = normalized.match(/\.status-bar-item\.plugin-([a-z0-9_-]+)/i);
  if (pluginMatch?.[1]) return `.status-bar .status-bar-item.plugin-${pluginMatch[1]}`;
  if (/\.status-bar-item\b/.test(normalized)) return ".status-bar .status-bar-item";
  if (normalized === ".status-bar" || normalized === "div.status-bar" || /(?:^|[\s>])\.status-bar(?:$|[\s>])/.test(normalized)) return ".status-bar";
  return "";
}

export function normalizeUiButtonRuleResetTargets(raw: unknown): UiButtonRuleResetTarget[] {
  const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  return values
    .map((item): UiButtonRuleResetTarget | null => {
      if (typeof item === "string" && item.trim()) return { selector: item.trim(), id: item.trim() };
      if (!isRecord(item)) return null;
      const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined;
      const selector = typeof item.selector === "string" && item.selector.trim() ? item.selector.trim() : undefined;
      const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : undefined;
      const scope = item.scope === "active" || item.scope === "cancip" || item.scope === "global" ? item.scope : undefined;
      if (!id && !selector && !label) return null;
      return { id, selector, label, scope };
    })
    .filter((item): item is UiButtonRuleResetTarget => item !== null)
    .slice(0, 80);
}

export function uiButtonRuleMatchesAnyResetTarget(rule: UiButtonRule, targets: UiButtonRuleResetTarget[]): boolean {
  return targets.some((target) => {
    if (target.id && rule.id === target.id) return true;
    if (target.selector && rule.selector === target.selector && (!target.scope || rule.scope === target.scope)) return true;
    if (target.label && normalizeUiButtonLabel(rule.label) === normalizeUiButtonLabel(target.label) && (!target.scope || rule.scope === target.scope)) return true;
    return false;
  });
}

export function uiButtonRuleChangeKinds(rule: UiButtonRule): UiButtonRuleChange[] {
  const kinds: UiButtonRuleChange[] = [];
  if (rule.kind === "custom") kinds.push("custom");
  if (rule.hidden) kinds.push("hidden");
  if (Number.isFinite(rule.order) && rule.order !== 0) kinds.push("order");
  if (rule.title?.trim()) kinds.push("title");
  if (rule.icon?.trim()) kinds.push("icon");
  if (rule.mediaPath?.trim()) kinds.push("media");
  if (rule.effect) kinds.push("effect");
  return kinds;
}

export function uiButtonRuleHasChanges(rule: UiButtonRule): boolean {
  return uiButtonRuleChangeKinds(rule).length > 0;
}

export function uiButtonMutationNodeHasCustomButton(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const el = node as Element;
  return el.matches("[data-cancip-ui-custom-button]")
    || Boolean(el.querySelector("[data-cancip-ui-custom-button]"));
}

export function uiButtonMutationTouchesManagedRule(mutation: MutationRecord): boolean {
  if (mutation.type !== "attributes") return false;
  const name = mutation.attributeName ?? "";
  const oldValue = mutation.oldValue ?? "";
  if (name.startsWith("data-cancip-")) return Boolean(oldValue);
  if (name === "class") return /\bobcc-ui-rule-/.test(oldValue);
  if (name === "style") return /(?:^|;)\s*(?:order|display)\s*:/.test(oldValue);
  return false;
}

export function stableRuleId(input: string): string {
  return `rule-${input.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "button"}`;
}

export function normalizeTagName(input: string): string {
  return input.trim().replace(/^#+/, "").replace(/\\/g, "/").replace(/\s+/g, "").replace(/^\/+|\/+$/g, "");
}

export function personalizationTimeKey(date: Date): string {
  const hour = date.getHours();
  const period = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : hour < 23 ? "evening" : "night";
  return `${localDateKey(date)}:${period}`;
}

export function isValidPersonalizationTimestamp(timestamp: number, now = Date.now()): boolean {
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now + 5 * 60 * 1000;
}

export function personalizationEvidenceWording(tier: PersonalizationEvidenceTier): string {
  if (tier === "24h") return "within 24h; may say just changed/recent";
  if (tier === "72h") return "within 72h; say in the last few days, not just changed";
  if (tier === "7d") return "within 7d; say this week, not recent/new";
  if (tier === "latest") return "older fallback; say last/currently available clue, never recent/new";
  return "no reliable activity evidence; use a natural time greeting only";
}

export function personalizationGreetingCacheIsFresh(updatedAt: string, hours: number, now = Date.now()): boolean {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now + 5 * 60 * 1000) return false;
  const safeHours = Math.max(1, Math.min(168, Number.isFinite(hours) ? hours : 48));
  return now - timestamp <= safeHours * 60 * 60 * 1000;
}

export function personalizationGreetingBody(text: string, friendlyName: string): string {
  let value = sanitizePersonalizationText(text, 180, true);
  const safeName = sanitizePersonalizationName(friendlyName);
  const chinesePeriodPattern = "(?:夜里|上午|下午|晚上|早上|中午|傍晚)";
  if (safeName) {
    const escapedName = escapeRegExp(safeName);
    value = value
      .replace(new RegExp(`^${escapedName}\\s*[,，:：]?\\s*`, "i"), "")
      .replace(new RegExp(`^${chinesePeriodPattern}好\\s*[,，:：]?\\s*${escapedName}[。.!！?？,，]?\\s*`, "i"), "")
      .replace(new RegExp(`^${chinesePeriodPattern}[^，,。.!！?？]{0,20}[，,]\\s*${escapedName}[。.!！?？,，]?\\s*`, "i"), "");
  }
  value = value
    .replace(/^(?:夜里|上午|下午|晚上|早上|中午|傍晚)好[，,。.!！?？]?\s*/i, "")
    .replace(/^(?:夜里|上午|下午|晚上|早上|中午|傍晚)[^，,。.!！?？]{0,20}[，,。.!！?？]\s*/i, "")
    .replace(/^你好[。.!！?？]?\s*/i, "")
    .replace(/^Good\s+(?:late\s+night|morning|afternoon|evening)(?:\s*[,，]\s*[^.!！?？]{1,24})?[。.!！?？]?\s*/i, "");
  return value.trim();
}

export function isTemplateLikePersonalizationGreeting(text: string): boolean {
  const compact = text.replace(/\s+/g, "").toLocaleLowerCase();
  if (!compact) return false;
  return /刚看到.*有更新|这件事.*往前走|要从这里接着吗|要从上次.*接着吗|目前能接上的.*线索|先挑一件做完整|continuefromthere|continuefromthatpoint|latestavailablethread/.test(compact);
}

export function personalizationEvidenceContains(source: string, value: string): boolean {
  const needle = value.toLocaleLowerCase().replace(/[\s,，。.!！?？:：;；()（）[\]{}]/g, "");
  if (needle.length < 2) return false;
  const haystack = source.toLocaleLowerCase().replace(/[\s,，。.!！?？:：;；()（）[\]{}]/g, "");
  return haystack.includes(needle);
}

export function sanitizePersonalizationText(input: string, maxChars: number, singleLine: boolean): string {
  let value = redactSensitiveText(input)
    .replace(/<!--[^>]*-->/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\b(?:as an ai|作为(?:一个)?ai)\b/gi, "")
    .trim();
  if (singleLine) value = value.replace(/\s+/g, " ");
  return trimContext(value, maxChars).trim();
}

export function sanitizePersonalizationName(input: string): string {
  return trimContext(redactSensitiveText(input).replace(/[\r\n\t<>[\]{}]/g, " ").replace(/\s+/g, " ").trim(), 24)
    .replace(/^[,，。.!！?？:：]+|[,，。.!！?？:：]+$/g, "")
    .trim();
}

export function sanitizePersonalizationLocation(input: string): string {
  return trimContext(redactSensitiveText(input).replace(/[\r\n\t<>[\]{}]/g, " ").replace(/\s+/g, " ").trim(), 60)
    .replace(/^[,，。.!！?？:：]+|[,，。.!！?？:：]+$/g, "")
    .trim();
}

export function extractPersonalizationNameFromLegacyGreeting(greeting: string): string {
  const match = greeting.match(/^([^，,。.!！?？]{1,16})[，,](?:夜里|上午|下午|晚上|早上|中午|傍晚|Good\b)/i);
  return sanitizePersonalizationName(match?.[1] ?? "");
}

export function extractPersonalizationFriendlyName(source: string): string {
  const patterns = [
    /(?:朋友称呼|用户称呼|首选称呼|姓名|名字)\s*[:：]\s*([^\n,，。;；]{1,24})/i,
    /(?:preferred\s+name|user\s+name|name)\s*[:：]\s*([^\n,，。;；]{1,24})/i,
    /(?:User|用户)\s*[:：]\s*([^\n,，。;；]{1,24})/i
  ];
  for (const pattern of patterns) {
    const name = sanitizePersonalizationName(source.match(pattern)?.[1] ?? "");
    if (name && !/^(none|null|unknown|无|未设置)$/i.test(name)) return name;
  }
  return "";
}

export function extractPersonalizationWeatherLocation(source: string): string {
  const patterns = [
    /(?:天气地点|常住地|所在地)\s*[:：]\s*([^\n,，。;；]{1,60})/i,
    /(?:weather\s+location|home\s+location|location)\s*[:：]\s*([^\n,，。;；]{1,60})/i
  ];
  for (const pattern of patterns) {
    const location = sanitizePersonalizationLocation(source.match(pattern)?.[1] ?? "");
    if (location && !/^(none|null|unknown|无|未设置)$/i.test(location)) return location;
  }
  return "";
}

export function enforcePersonalizationGreetingIdentity(text: string, friendlyName: string): string {
  const value = sanitizePersonalizationText(text, 180, true);
  const leading = value.match(/^([^，,。.!！?？]{1,16})[，,]((?:夜里|上午|下午|晚上|早上|中午|傍晚|Good\b)[\s\S]*)$/i);
  if (!leading) return value;
  const proposed = sanitizePersonalizationName(leading[1]);
  if (friendlyName && proposed === friendlyName) return value;
  return sanitizePersonalizationText(leading[2], 180, true);
}

export function normalizePersonalizationGreetings(raw: unknown, friendlyName: string): PersonalizationGreeting[] {
  if (!Array.isArray(raw)) return [];
  const result: PersonalizationGreeting[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.text !== "string") continue;
    const text = enforcePersonalizationGreetingIdentity(item.text, friendlyName);
    if (!text) continue;
    const choices = uniqueStrings((Array.isArray(item.choices) ? item.choices : [])
      .filter((choice): choice is string => typeof choice === "string")
      .map((choice) => sanitizePersonalizationText(choice, 90, true))
      .filter(Boolean)).slice(0, 3);
    result.push({ text, choices });
  }
  return uniquePersonalizationGreetings(result).slice(0, 6);
}

export function uniquePersonalizationGreetings(items: PersonalizationGreeting[]): PersonalizationGreeting[] {
  const unique = new Map<string, PersonalizationGreeting>();
  for (const item of items) {
    const key = item.text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    if (key && !unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

export function normalizePersonalizationWeather(raw: unknown): PersonalizationWeather | null {
  if (!isRecord(raw)) return null;
  const location = typeof raw.location === "string" ? sanitizePersonalizationLocation(raw.location) : "";
  const summary = typeof raw.summary === "string" ? sanitizePersonalizationText(raw.summary, 80, true) : "";
  const updatedAt = typeof raw.updatedAt === "string" && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : "";
  return location && summary && updatedAt ? { location, summary, updatedAt } : null;
}

export function countAutocompletePreferenceSignals(
  events: AutocompleteSelectionEvent[],
  rules: ReadonlyArray<{ key: string; label: string; pattern: RegExp }>,
  limit = 6
): AutocompletePreferenceSignal[] {
  const counts = new Map<string, AutocompletePreferenceSignal>();
  for (const event of events) {
    const source = `${event.prefixHint}\n${event.text}`;
    for (const rule of rules) {
      if (!rule.pattern.test(source)) continue;
      const existing = counts.get(rule.key);
      counts.set(rule.key, existing
        ? { ...existing, count: existing.count + 1 }
        : { key: rule.key, label: rule.label, count: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function emptyAutocompletePreferenceSummary(): AutocompletePreferenceSummary {
  return {
    schemaVersion: 3,
    updatedAt: "",
    totalSelections: 0,
    totalShown: 0,
    totalUsed: 0,
    usageRate: 0,
    unusedShown: 0,
    pendingShown: 0,
    preferredPosition: 1,
    positionCounts: [],
    triggerCounts: { button: 0, tab: 0, menu: 0 },
    reasonCounts: { "first-visible": 0, "auto-rotated": 0, "manual-navigation": 0 },
    preloadedNextBranchCount: 0,
    contentSignals: [],
    styleSignals: [],
    summary: ""
  };
}

export function personalizationChoiceKey(text: string): string {
  const normalized = sanitizePersonalizationText(text, 180, true).toLocaleLowerCase();
  return `choice-${stableTextHash(normalized).slice(0, 12)}`;
}

export function normalizeComposerWorkflowHint(raw: unknown): ComposerWorkflowHint {
  if (!isRecord(raw)) return { title: "", steps: [] };
  const title = typeof raw.title === "string" ? sanitizePersonalizationText(raw.title, 70, true) : "";
  const steps = uniqueStrings((Array.isArray(raw.steps) ? raw.steps : [])
    .filter((step): step is string => typeof step === "string")
    .map((step) => sanitizePersonalizationText(step, 70, true))
    .filter(Boolean)).slice(0, 6);
  return { title, steps };
}

export function isPersonalizedDiaryPath(path: string): boolean {
  const normalized = normalizePath(path.replace(/\\/g, "/"));
  const name = normalized.split("/").pop() ?? "";
  return /(?:^|\/)(?:日记|diary|journal)(?:\/|$)/i.test(normalized)
    || /^\d{4}-\d{2}-\d{2}(?:[-_ ].*)?\.md$/i.test(name);
}

export function isDiaryWritingRequest(prompt: string, path: string): boolean {
  if (!path || !isPersonalizedDiaryPath(path)) return false;
  const compact = prompt.replace(/\s+/g, "").trim();
  if (!compact) return false;
  return /(?:写|续写|补充|整理|生成|草拟|润色|总结|复盘|记录).{0,8}(?:日记|日志|今[天日]|今日小结)|(?:日记|日志|今[天日]|今日小结).{0,8}(?:写|续写|补充|整理|生成|草拟|润色|总结|复盘|记录)/i.test(compact);
}

export function isTtsOverlayPosition(value: unknown): value is { left: number; top: number } {
  return isRecord(value)
    && typeof value.left === "number"
    && typeof value.top === "number"
    && Number.isFinite(value.left)
    && Number.isFinite(value.top);
}

export function formatElapsedSeconds(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  if (safe < 1000) return `${safe}ms`;
  const seconds = Math.floor(safe / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
}

export function formatStepElapsed(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  if (safe < 1000) return `${safe}ms`;
  if (safe < 60000) return `${(safe / 1000).toFixed(1)}s`;
  const minutes = Math.floor(safe / 60000);
  return `${minutes}m${String(Math.floor((safe % 60000) / 1000)).padStart(2, "0")}s`;
}

export function progressElapsedMsFromContent(content: string): number | null {
  const minuteMatch = content.match(/(?:耗时|elapsed)\s+(\d+)m(\d+(?:\.\d+)?)s/i);
  if (minuteMatch) return Number(minuteMatch[1]) * 60000 + Number(minuteMatch[2]) * 1000;
  const match = content.match(/(?:耗时|elapsed)\s+(\d+(?:\.\d+)?)(ms|s)/i);
  if (!match) return null;
  return Number(match[1]) * (match[2].toLowerCase() === "s" ? 1000 : 1);
}

export function normalizeScoreKey(value: string): string {
  return trimContext(value.trim().replace(/\s+/g, " "), 220) || "feature:unknown";
}

export function uniqueScoreEntities(rows: ScoreEntityState[]): ScoreEntityState[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

export function normalizeContextCompactionState(raw: unknown): ContextCompactionState | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1) return null;
  const throughMessageId = typeof raw.throughMessageId === "string" ? raw.throughMessageId : "";
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!throughMessageId || !summary) return null;
  return {
    schemaVersion: 1,
    throughMessageId,
    throughCreatedAt: typeof raw.throughCreatedAt === "number" && Number.isFinite(raw.throughCreatedAt) ? raw.throughCreatedAt : 0,
    sourceHash: typeof raw.sourceHash === "string" ? raw.sourceHash : "",
    summary,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    sourceChars: Math.max(0, Number(raw.sourceChars) || 0),
    compactedChars: Math.max(0, Number(raw.compactedChars) || summary.length),
    estimatedSourceTokens: Math.max(0, Number(raw.estimatedSourceTokens) || estimateTextTokens(summary)),
    estimatedCompactedTokens: Math.max(0, Number(raw.estimatedCompactedTokens) || estimateTextTokens(summary))
  };
}

export function contextCompactionMessagesHash(messages: ChatMessage[]): string {
  return stableTextHash(messages.map((message) => `${message.id}:${message.createdAt}:${stableTextHash(message.content)}`).join("|"));
}

export function trimContextToEstimatedTokens(content: string, maxTokens: number): string {
  const trimmed = content.trim();
  const tokenLimit = Math.max(100, Math.round(maxTokens));
  if (!trimmed || estimateTextTokens(trimmed) <= tokenLimit) return trimmed;
  const suffix = "\n\n...[compacted]";
  let low = 0;
  let high = trimmed.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${trimmed.slice(0, middle).trimEnd()}${suffix}`;
    if (estimateTextTokens(candidate) <= tokenLimit) low = middle;
    else high = middle - 1;
  }
  const prefix = trimmed.slice(0, low).trimEnd();
  const lineBreak = prefix.lastIndexOf("\n");
  const cleanPrefix = lineBreak >= Math.floor(prefix.length * 0.8) ? prefix.slice(0, lineBreak).trimEnd() : prefix;
  return `${cleanPrefix}${suffix}`;
}

export function isFiniteConfigNumber(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Number.isFinite(Number(trimmed));
}

export function isValidStringArrayConfigValue(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  return Array.isArray(value) && value.every((item) => typeof item === "string" && Boolean(item.trim()));
}

export function isValidApiProfilesConfigValue(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!isRecord(item)) return false;
    return Object.entries(item).every(([key, field]) => {
      if (["id", "name", "apiUrl", "apiKey", "model"].includes(key)) return typeof field === "string";
      if (key === "apiMode") return isApiMode(field);
      return true;
    });
  });
}

export function isValidModelSourceByModelConfigValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([model, profileId]) => Boolean(model.trim()) && typeof profileId === "string" && Boolean(profileId.trim()));
}

export function isValidUiButtonRulesConfigValue(value: unknown): boolean {
  return Array.isArray(value)
    && value.length <= 200
    && value.every((item) => isRecord(item) && typeof item.selector === "string" && Boolean(item.selector.trim()));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeParseObject(raw: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function noteDrawEncodedDrawingName(path: string): string {
  const encoded = normalizePath(path)
    .replace(/[^a-zA-Z0-9._/-]/g, "_")
    .replace(/\//g, "__");
  return `${encoded || "note"}.json`;
}

export function normalizeNoteDrawStrokeForStorage(value: unknown): Record<string, unknown> {
  const raw = isRecord(value) ? value : {};
  const kind = raw.kind === "text" || raw.kind === "embed" ? raw.kind : "";
  const render = raw.render === "markdown" || raw.render === "html" || raw.render === "note" ? raw.render : "plain";
  const points = normalizeAnnotationPoints(raw.points);
  const stroke: Record<string, unknown> = {
    brush: raw.brush === "watercolor" ? "watercolor" : "pen",
    color: normalizeHexColorForAnnotation(typeof raw.color === "string" ? raw.color : "#e53935"),
    width: clampNumber(raw.width, 3, 0.5, 80),
    opacity: clampNumber(raw.opacity, 1, 0, 1),
    count: clampInt(raw.count, 1, 1, 8),
    points
  };
  if (kind) stroke.kind = kind;
  if (kind === "text" || typeof raw.text === "string") {
    stroke.kind = "text";
    stroke.text = typeof raw.text === "string" ? raw.text : "";
    stroke.render = render;
    stroke.fontSize = clampNumber(raw.fontSize, render === "plain" ? 18 : 16, 10, 72);
    stroke.bold = raw.bold === true;
    stroke.code = raw.code === true || render === "html";
    stroke.boxed = raw.boxed === true || render !== "plain";
    stroke.file = raw.file === true || render === "note";
    stroke.previewWidth = clampNumber(raw.previewWidth, render === "note" ? 320 : 300, 80, 900);
    stroke.previewHeight = clampNumber(raw.previewHeight, render === "note" ? 220 : 180, 40, 700);
    stroke.uiRole = typeof raw.uiRole === "string" ? raw.uiRole : "";
    stroke.buttonStyle = typeof raw.buttonStyle === "string" ? raw.buttonStyle : "";
    stroke.snap = raw.snap === true;
    stroke.locked = raw.locked === true;
  }
  return stroke;
}

export function pdftionAnnotationKey(path: string): string {
  return encodeURIComponent(normalizePath(path)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function makeAnnotationElementId(): string {
  return `stroke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeHexColorForAnnotation(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  return "#000000";
}

export function cloneJsonObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

export function deepMergeJsonObject(target: Record<string, unknown>, patch: Record<string, unknown>, changed: Set<string>, prefix = ""): void {
  for (const [key, value] of Object.entries(patch)) {
    if (!key) continue;
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value) && isRecord(target[key])) {
      const current = target[key];
      deepMergeJsonObject(current, value, changed, keyPath);
      continue;
    }
    target[key] = cloneJsonValue(value);
    changed.add(keyPath);
  }
}

export function deleteJsonPath(target: Record<string, unknown>, keyPath: string): boolean {
  const parts = keyPath.split(".").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;
  let cursor: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!isRecord(next)) return false;
    cursor = next;
  }
  const last = parts[parts.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, last)) return false;
  delete cursor[last];
  return true;
}

export function isAccessMode(value: unknown): value is AccessMode {
  return value === "ask-for-approval" || value === "full-access";
}

export function isSessionStatus(value: unknown): value is NonNullable<SessionHistoryEntry["status"]> {
  return value === "idle" || value === "running" || value === "completed" || value === "failed" || value === "stopped";
}

export function sessionSnapshotPersistenceSignature(snapshot: Record<string, unknown>): string {
  const messages = Array.isArray(snapshot.messages)
    ? snapshot.messages.map((message) => {
        if (!isRecord(message) || typeof message.content !== "string") return message;
        if (!/<!--\s*cancip-(?:progress-step|tool-feedback|process-message)/i.test(message.content)) return message;
        return {
          ...message,
          content: message.content.replace(/(耗时|elapsed)(?:[:：]?\s*)\d+(?:\.\d+)?(?:ms|s|m|h)\b/gi, "$1")
        };
      })
    : snapshot.messages;
  const taskControl = isRecord(snapshot.taskControl)
    ? { ...snapshot.taskControl, updatedAt: "" }
    : snapshot.taskControl;
  return stableTextHash(JSON.stringify({
    ...snapshot,
    updatedAt: "",
    metadataUpdatedAt: "",
    lastOpenedAt: "",
    exportedAt: "",
    taskControl,
    messages
  }));
}

export function sessionHistoryEntryPersistenceSignature(entry: SessionHistoryEntry): string {
  return stableCacheKey({
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    createdAt: entry.createdAt,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    stoppedAt: entry.stoppedAt,
    failedAt: entry.failedAt,
    messageCount: entry.messageCount,
    mode: entry.mode,
    model: entry.model,
    status: entry.status,
    completedNotice: entry.completedNotice,
    unread: entry.unread,
    pinned: entry.pinned,
    archived: entry.archived,
    coldArchived: entry.coldArchived,
    archivedAt: entry.archivedAt,
    manualTitle: entry.manualTitle,
    manualOrder: entry.manualOrder,
    parentSessionId: entry.parentSessionId,
    parentSessionTitle: entry.parentSessionTitle,
    subagentIds: entry.subagentIds,
    subagentRole: entry.subagentRole,
    subagentGoal: entry.subagentGoal,
    subagentProgress: entry.subagentProgress,
    path: entry.path
  });
}

export function cancipLatestTimestamp(...values: Array<string | undefined>): string {
  let latest = "";
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) continue;
    if (time >= latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

export function cancipSessionTimeline(raw: Partial<SessionTimeline> & { sessionCreatedAt?: string }, fallbackId = ""): SessionTimeline {
  const id = raw.id || fallbackId;
  const createdAt = raw.createdAt || raw.sessionCreatedAt || new Date().toISOString();
  const startedAt = typeof raw.startedAt === "string" ? raw.startedAt : undefined;
  const completedAt = typeof raw.completedAt === "string" ? raw.completedAt : undefined;
  const stoppedAt = typeof raw.stoppedAt === "string" ? raw.stoppedAt : undefined;
  const failedAt = typeof raw.failedAt === "string" ? raw.failedAt : undefined;
  const updatedAt = raw.updatedAt || cancipLatestTimestamp(createdAt, startedAt, completedAt, stoppedAt, failedAt) || createdAt;
  return { id, createdAt, startedAt, updatedAt, completedAt, stoppedAt, failedAt, status: raw.status };
}

export function cancipApplySessionStatusTimes(target: Partial<SessionTimeline> & { sessionCreatedAt?: string }, status: NonNullable<SessionHistoryEntry["status"]>, at: string): void {
  const createdAt = target.createdAt || target.sessionCreatedAt || at;
  target.createdAt = createdAt;
  if (status === "running" && !target.startedAt) target.startedAt = at;
  if (status === "completed" && !target.completedAt) target.completedAt = at;
  if (status === "stopped" && !target.stoppedAt) target.stoppedAt = at;
  if (status === "failed" && !target.failedAt) target.failedAt = at;
}

export function mergeSessionHistoryEntry(existing: SessionHistoryEntry | undefined, fromFile: SessionHistoryEntry): SessionHistoryEntry {
  if (!existing) return fromFile;
  const existingTime = Date.parse(existing.updatedAt);
  const fileTime = Date.parse(fromFile.updatedAt);
  const fileIsNewer = Number.isFinite(fileTime) && (!Number.isFinite(existingTime) || fileTime >= existingTime);
  const primary = fileIsNewer ? fromFile : existing;
  const secondary = fileIsNewer ? existing : fromFile;
  const existingMetadataTime = Date.parse(existing.metadataUpdatedAt || existing.updatedAt);
  const fileMetadataTime = Date.parse(fromFile.metadataUpdatedAt || fromFile.updatedAt);
  const fileMetadataIsNewer = Number.isFinite(fileMetadataTime)
    && (!Number.isFinite(existingMetadataTime) || fileMetadataTime >= existingMetadataTime);
  const metadata = fileMetadataIsNewer ? fromFile : existing;
  return {
    ...primary,
    title: metadata.manualTitle ? metadata.title : primary.title || secondary.title,
    metadataUpdatedAt: metadata.metadataUpdatedAt,
    pinned: metadata.pinned ?? false,
    archived: metadata.archived ?? false,
    coldArchived: metadata.coldArchived ?? false,
    archivedAt: metadata.archivedAt,
    lastOpenedAt: cancipLatestTimestamp(existing.lastOpenedAt, fromFile.lastOpenedAt) || undefined,
    manualTitle: metadata.manualTitle ?? false,
    manualOrder: metadata.manualOrder,
    unread: metadata.unread ?? false,
    completedNotice: metadata.completedNotice ?? false,
    parentSessionId: primary.parentSessionId || secondary.parentSessionId,
    parentSessionTitle: primary.parentSessionTitle || secondary.parentSessionTitle,
    subagentIds: uniqueStrings([...(primary.subagentIds ?? []), ...(secondary.subagentIds ?? [])]),
    subagentRole: primary.subagentRole || secondary.subagentRole,
    subagentGoal: primary.subagentGoal || secondary.subagentGoal,
    subagentProgress: primary.subagentProgress || secondary.subagentProgress,
    subagentPlanStepId: primary.subagentPlanStepId || secondary.subagentPlanStepId,
    subagentAcceptance: primary.subagentAcceptance || secondary.subagentAcceptance,
    subagentDeadlineAt: primary.subagentDeadlineAt || secondary.subagentDeadlineAt,
    subagentAttempt: primary.subagentAttempt || secondary.subagentAttempt,
    subagentStartedAt: primary.subagentStartedAt || secondary.subagentStartedAt,
    subagentCompletedAt: primary.subagentCompletedAt || secondary.subagentCompletedAt,
    eventOnly: false,
    path: primary.path || secondary.path
  };
}

export function shouldShowUnreadSession(entry: SessionHistoryEntry): boolean {
  if (entry.eventOnly || entry.parentSessionId) return false;
  if (entry.unread === true) return true;
  return Boolean(entry.completedNotice && (entry.status === "completed" || entry.status === "failed" || entry.status === "stopped"));
}

export function compareSessionHistoryEntries(a: SessionHistoryEntry, b: SessionHistoryEntry): number {
  if (Boolean(a.archived) !== Boolean(b.archived)) return a.archived ? 1 : -1;
  const aManualOrder = typeof a.manualOrder === "number" && Number.isFinite(a.manualOrder) ? a.manualOrder : null;
  const bManualOrder = typeof b.manualOrder === "number" && Number.isFinite(b.manualOrder) ? b.manualOrder : null;
  if (aManualOrder !== null && bManualOrder !== null && aManualOrder !== bManualOrder) {
    return aManualOrder - bManualOrder;
  }
  const aLastUsedAt = cancipLatestTimestamp(a.lastOpenedAt, a.updatedAt, a.createdAt);
  const bLastUsedAt = cancipLatestTimestamp(b.lastOpenedAt, b.updatedAt, b.createdAt);
  const byUpdatedAt = bLastUsedAt.localeCompare(aLastUsedAt);
  if (byUpdatedAt) return byUpdatedAt;
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

export function redactSessionEvent(event: SessionEvent): SessionEvent {
  return {
    ...event,
    summary: event.summary ? trimContext(redactSensitiveText(event.summary), 400) : undefined,
    detail: event.detail ? trimContext(redactSensitiveText(event.detail), 1600) : undefined
  };
}

export function formatSessionEventLine(event: SessionEventView): string {
  const parts = [
    event.at || "-",
    event.kind,
    event.sessionId ? `session=${event.sessionId}` : "",
    event.status ? `status=${event.status}` : "",
    event.toolStatus ? `tool=${event.toolStatus}` : "",
    event.role ? `role=${event.role}` : "",
    event.summary ? `summary=${trimContext(redactSensitiveText(event.summary).replace(/\r?\n/g, " "), 180)}` : "",
    event.path ? `path=${event.path}` : "",
    event.detail ? `detail=${trimContext(redactSensitiveText(event.detail).replace(/\r?\n/g, " "), 260)}` : ""
  ].filter(Boolean);
  return parts.join(" | ");
}

export function sessionEventIcon(kind: SessionEventKind): string {
  if (kind === "plugin.load") return "plug";
  if (kind.startsWith("session.")) return "messages-square";
  if (kind.startsWith("prompt.")) return "send";
  if (kind.startsWith("model.")) return "route";
  if (kind === "message.add") return "message-square";
  if (kind.startsWith("tool.")) return "wrench";
  return "list-checks";
}

export function isComposerMode(value: unknown): value is ComposerMode {
  return value === "ask" || value === "search" || value === "plan" || value === "edit";
}

export function normalizeComposerMode(value: unknown): ComposerMode | null {
  if (!isComposerMode(value)) return null;
  return value === "plan" ? "ask" : value;
}

export function isApiMode(value: unknown): value is ApiMode {
  return value === "auto" || value === "compatible" || value === "responses";
}

export function normalizeSessionApiProfile(raw: Record<string, unknown>): ChatMessage["apiProfile"] {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    name: typeof raw.name === "string" ? raw.name : "",
    apiMode: isApiMode(raw.apiMode) ? raw.apiMode : "auto",
    model: typeof raw.model === "string" ? raw.model : "",
    hasApiUrl: Boolean(raw.hasApiUrl),
    hasApiKey: Boolean(raw.hasApiKey)
  };
}

export function normalizeManualTodos(raw: unknown): ManualTodo[] {
  if (!Array.isArray(raw)) return [];
  return dedupeManualTodos(raw
    .filter(isRecord)
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      text: typeof item.text === "string" ? item.text.trim() : "",
      done: Boolean(item.done),
      sendToModel: typeof item.sendToModel === "boolean" ? item.sendToModel : true,
      planOnly: typeof item.planOnly === "boolean" ? item.planOnly : false,
      source: item.source === "programmatic" ? "programmatic" as const : "manual" as const,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      startedAt: typeof item.startedAt === "string" ? item.startedAt : undefined,
      completedAt: typeof item.completedAt === "string" ? item.completedAt : undefined
    }))
    .filter((item) => item.text));
}

export function dedupeManualTodos(todos: ManualTodo[]): ManualTodo[] {
  const seen = new Set<string>();
  const next: ManualTodo[] = [];
  for (const todo of todos) {
    const text = todo.text.trim();
    if (!text) continue;
    const key = normalizeUiButtonLabel(text);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ ...todo, text });
  }
  return next;
}

export function normalizeQueuedPrompts(raw: unknown): QueuedPrompt[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
      prompt: typeof item.prompt === "string" ? item.prompt.trim() : "",
      createdAt: typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      held: typeof item.held === "boolean" ? item.held : undefined
    }))
    .filter((item) => item.prompt);
}

export function markdownFenceLines(content: string, lang = "text", indent = ""): string[] {
  const normalized = content.replace(/\r\n?/g, "\n");
  let maxTicks = 0;
  const tickRuns = normalized.match(/`+/g);
  if (tickRuns) {
    for (const item of tickRuns) maxTicks = Math.max(maxTicks, item.length);
  }
  const fence = "`".repeat(Math.max(3, maxTicks + 1));
  const opening = lang ? `${fence}${lang}` : fence;
  return [
    `${indent}${opening}`,
    ...normalized.split("\n").map((line) => `${indent}${line}`),
    `${indent}${fence}`
  ];
}

export function countRegex(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export function retainLatestText(content: string, maxChars: number): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const heading = trimmed.match(/^# .+$/m)?.[0] ?? "# Cancip Memory";
  const marker = "> Older entries omitted after preserving the newest content.";
  const tailBudget = Math.max(1000, maxChars - heading.length - marker.length - 6);
  return [heading, "", marker, "", trimmed.slice(-tailBudget).replace(/^# .+?\r?\n+/, "")].join("\n");
}

export function retainLatestDreamEntries(content: string, maxChars: number): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const marker = "> Older dream entries omitted after preserving the newest entries.";
  const tailBudget = Math.max(1000, maxChars - marker.length - 30);
  const tail = trimmed.slice(-tailBudget);
  const entryBoundary = tail.indexOf("\n## ");
  const retained = entryBoundary >= 0 ? tail.slice(entryBoundary + 1) : tail;
  return ["# Cancip Dream Log", "", marker, "", retained].join("\n");
}

export function cleanFoldedBlockContent(block: FoldedMessageBlock): string {
  const content = block.content.trim();
  const lines = content.split(/\r?\n/);
  const firstLine = lines[0]?.trim().toLowerCase();
  const title = block.title.trim().toLowerCase();
  const duplicatedTitle = Boolean(firstLine && firstLine === title && lines.length > 1);
  const titleLooksLikeFenceLabel = /^(?:cancip-action|thinking|reasoning|process|details?|json|text|bash|sh|zsh|shell|powershell|ps1|cmd|bat|terminal|console|ts|tsx|js|jsx|html|css|python|py|diff)$/i.test(title);
  if (duplicatedTitle && titleLooksLikeFenceLabel) return lines.slice(1).join("\n").trim();
  return content;
}

export function stripProgrammaticRunStats(content: string): { content: string; text: string; usage?: TurnModelUsage } {
  let text = "";
  let usage: TurnModelUsage | undefined;
  const cleaned = content.replace(/<!--\s*cancip-run-stats\b([\s\S]*?)-->/gi, (_full, rawPayload: string) => {
    const payload = rawPayload.trim();
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as unknown;
        if (isRecord(parsed) && typeof parsed.text === "string") text = parsed.text.trim();
        if (isRecord(parsed) && isRecord(parsed.usage)) usage = acceptanceTokenUsageFromValue(parsed.usage) ?? undefined;
      } catch {
        text = payload.replace(/^[:：-]\s*/, "").trim();
      }
    }
    return "\n\n";
  });
  return { content: cleaned, text, usage };
}

export function stripModelRunStatsLines(content: string): string {
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (isModelRunStatsLine(line.trim())) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

export function isModelRunStatsLine(trimmed: string): boolean {
  if (!trimmed) return false;
  const line = trimmed
    .replace(/^[-*]\s*/, "")
    .replace(/^>\s*/, "")
    .trim();
  if (!line || line.length > 140) return false;
  if (/^(?:总耗时|耗时|用时|总用时|Elapsed|Total elapsed|Duration)\s*[:：]/i.test(line)) return true;
  if (/^(?:Token|Tokens|token|tokens|字数|字符|chars?|characters?)\s*(?:[:：]|发送|接收|合计|sent|received|in\b|out\b|total\b)/i.test(line)) return true;
  if (/^(?:发送|接收|合计)\s*(?:token|tokens|字数|字符)/i.test(line)) return true;
  return isOnlyRunStatsText(line);
}

export function isModelFailureVisibleText(content: string): boolean {
  const text = stripStructuredChoices(stripProgrammaticRunStats(content).content)
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return false;
  if (/^(?:模型调用失败|Model call failed|API 返回了空回复|The API returned an empty response|调用失败|Call failed)(?:\s|[:：.]|$)/i.test(text)) return true;
  return /HTTP\s+\d{3}[\s\S]{0,220}(?:model_not_found|not supported by any configured account|rate_limit|insufficient_quota|timeout|timed out)/i.test(text);
}

export function processJsonArtifactTitle(value: unknown): string {
  if (Array.isArray(value)) {
    const titles = uniqueStrings(value.map((item) => processJsonArtifactTitle(item)).filter(Boolean));
    if (!titles.length) return "";
    return titles.length === 1 ? titles[0] : `过程 JSON：${Math.min(value.length, titles.length)} 项`;
  }
  if (!isRecord(value)) return "";
  const keys = new Set(Object.keys(value).map((key) => key.toLowerCase()));
  const text = JSON.stringify(value);
  const tool = typeof value.tool === "string" ? value.tool.trim() : "";
  if (tool) return `工具调用：${trimContext(tool, 90)}`;
  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (command && (keys.has("args") || keys.has("type") || keys.has("action"))) return `命令调用：${trimContext(command, 90)}`;
  const actionLike = [value.type, value.action]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .find((item) => /^(?:read|write|append|patch|config|todo|automation|mkdir|rename|move|copy|delete|command|search)$/i.test(item));
  if (actionLike) return `过程动作：${actionLike}`;
  if (Array.isArray(value.actions)) return `动作 JSON：${value.actions.length} 项`;
  if (keys.has("messages") && keys.has("model")) return "模型请求 JSON";
  if ((keys.has("request") || keys.has("requestbody")) && (keys.has("response") || keys.has("responseshape") || keys.has("status"))) return "API 调用审计 JSON";
  if (keys.has("status") && (keys.has("result") || keys.has("error"))) return "工具结果 JSON";
  if (/(?:cancip|obsidian|github|web\.(?:search|fetch)|requestBody|responseText|tool_call|toolCall)/i.test(text)) return "过程 JSON";
  return "";
}

export function looksLikeUserFacingFinalContent(text: string): boolean {
  const visible = stripTailChoiceSection(stripModelRunStatsLines(text)).replace(/\s+/g, " ").trim();
  if (!visible || visible.length < 8 || visible.length > 900) return false;
  if (isPromptishProgressNoteLine(visible)) return false;
  if (isUnreadableProcessHeadlineText(visible)) return false;
  if (/^(?:已执行|执行中|失败|running|executed|failed)\s*[·:：-]/i.test(visible)) return false;
  if (/(?:已完成|已修复|已写入|已创建|已修改|已验证|没完成|未完成|失败|阻塞|等待确认|等待审核|具体阻塞|改动：|验证：|completed|done|fixed|created|changed|verified|failed|blocked|pending approval|pending review)/i.test(visible)) return true;
  return hasFinalConclusion(visible) && !/(?:raw sent|raw received|request body|response json|tool call|cancip-action|工具调用|原始发送|原始接收)/i.test(visible);
}

export function splitFinalAssistantProcessBlocks(display: MessageDisplay): { finalDisplay: MessageDisplay; processDisplay: MessageDisplay } | null {
  if (!display.hiddenToolBlocks.length) return null;
  const processBlocks = display.hiddenToolBlocks.filter(isProcessFoldedBlock);
  if (!processBlocks.length) return null;
  const finalBlocks = display.hiddenToolBlocks.filter((block) => !isProcessFoldedBlock(block));
  return {
    finalDisplay: {
      ...display,
      hiddenToolBlocks: finalBlocks,
      hasProcessFold: finalBlocks.length > 0
    },
    processDisplay: {
      visibleContent: "",
      runStatsText: "",
      hiddenToolBlocks: processBlocks,
      hasProcessFold: true,
      processOnly: true
    }
  };
}

export function isProcessFoldedBlock(block: FoldedMessageBlock): boolean {
  const title = block.title.replace(/\s+/g, " ").trim();
  if (!title) return false;
  if (/^(?:cancip-action|action json|process|reasoning|think|thinking)$/i.test(title)) return true;
  if (/(?:过程|思考|推理|命令|执行|工具|动作|调用|模型|请求|响应|日志|详情|收发|审计|原始|trace|audit|exchange|request|response|raw|tool|action|command|process|reasoning|thinking|details?|logs?)/i.test(title)) return true;
  return false;
}

export function isTrivialProgressDetail(detail: string): boolean {
  const compact = detail.replace(/\s+/g, "").trim().toLowerCase();
  return !compact || /^(完成|done|executed|success|ok|工具执行完成)$/.test(compact);
}

export function isUnreadableProcessHeadlineText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^(?:data\s*:|event\s*:)/i.test(trimmed)) return true;
  if (/^(?:完成|结果|回复|completed?|result|response)\s*[:：]\s*[{\[]\s*$/i.test(trimmed)) return true;
  if (/^[{}\[\],:]+$/.test(trimmed)) return true;
  if (looksLikeProcessProtocolLeakText(trimmed) || isProcessProtocolLeakLine(trimmed)) return true;
  if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(trimmed)) return true;
  if (/^(?:json|javascript|js|ts|tsx|css|html|xml|yaml|yml)\b/i.test(trimmed) && /[{}\[\]":,]/.test(trimmed)) return true;
  const symbolCount = countRegex(trimmed, /[{}\[\]":,]/g);
  if (symbolCount >= 12 && symbolCount / Math.max(1, trimmed.length) > 0.14) return true;
  return /["'](?:tool|actions|action|type|command|args|requestBody|responseText|responseJson)["']\s*:/.test(trimmed);
}

export function stripProcessVisibleProtocolLeaks(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (looksLikeProcessProtocolLeakText(trimmed)) return "";
  const kept: string[] = [];
  let skippingProtocolParagraph = false;
  for (const line of trimmed.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean) {
      skippingProtocolParagraph = false;
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (isProcessProtocolLeakLine(clean)) {
      skippingProtocolParagraph = true;
      continue;
    }
    if (skippingProtocolParagraph) {
      if (/^#{1,6}\s+/.test(clean) || isProgrammaticProgressHeadline(clean)) {
        skippingProtocolParagraph = false;
      } else {
        continue;
      }
    }
    kept.push(line);
  }
  const result = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return looksLikeProcessProtocolLeakText(result) ? "" : result;
}

export function looksLikeProcessProtocolLeakText(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (/^(?:工具协议|Tool protocol|动作格式|Tool format)[:：]/i.test(compact)) return true;
  const patterns = [
    /cancip-action\s+JSON\s*块/i,
    /(?:动作|Supported action types?)[:：].*(?:read|search|write|patch|command)/i,
    /(?:路线例|Routes?)[:：].*(?:findTarget|tools\.index|obsidian\.)/i,
    /(?:入口|Entry points?)[:：].*(?:cancip\.|obsidian\.|github\.|web\.)/i,
    /(?:RAW SENT|RAW RECEIVED|SENT system|Actual API call audit|Model exchange raw contents|requestBody|responseJson|responseText)/i,
    /(?:tool_choice|prompt_cache_key|responseShape|input_tokens|output_tokens)/i,
    /(?:Decide and produce the next response now|Original user request|Latest tool results)/i,
    /(?:最终回答不要写|Final answer format|工具细节留在折叠过程|Keep tool details folded)/i
  ];
  return patterns.filter((pattern) => pattern.test(compact)).length >= 2;
}

export function isProcessProtocolLeakLine(line: string): boolean {
  if (!line) return false;
  return /^(?:工具协议|Tool protocol|动作格式|Tool format|动作|Supported action types?|精确|路线例|Routes?|入口|Entry points?|Skill\/经验路由|记忆\/规则\/偏好|自我优化|信息顺序|OB 插件能力|Vault 写入权限规则|紧凑路由|Payload policy|Access mode|Final answer format|Decide and produce the next response now|Original user request|Latest tool results|RAW SENT|RAW RECEIVED|SENT system|SENT contextText|SENT turn prompt|SENT actual user inputText|Actual API call audit|Model exchange raw contents|requestBody|responseJson|responseText|responseShape|tool_choice|prompt_cache_key)\b[:：]?/i.test(line)
    || /^[-*]\s+(?:If more work can advance|Keep the final answer|Do not output a plan|For a generic create-file|如果还能继续|只写真实存在|不要列读取文件)/i.test(line);
}

export function emptyMessageDisplay(content: string): MessageDisplay {
  return { visibleContent: content, runStatsText: "", hiddenToolBlocks: [], hasProcessFold: false, processOnly: false };
}

export function isLegacyProgressStatusMessage(content: string): boolean {
  const normalized = content.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, "");
  return normalized.includes("执行中·")
    || normalized.includes("已执行·")
    || normalized.includes("工具反馈：")
    || normalized.includes("工具执行结果：")
    || normalized.includes("正在根据工具结果继续")
    || normalized.includes("模型生成中")
    || normalized.includes("正在准备上下文")
    || (/^(?:执行中|已执行)[：:]/.test(normalized) && /(?:目的[：:]|做法[：:]|改动文件|字数发送|tokens?发送|耗时)/i.test(normalized));
}

export function isPromptishProgressNoteLine(line: string): boolean {
  const text = line.replace(/\s+/g, " ").trim();
  if (!text || text.length > 220) return false;
  return /正在准备本轮最小必要上下文|Preparing the smallest useful context|模型正在基于当前证据生成|The model is generating an answer|正在根据最新工具结果继续推进|Continuing from the latest tool result|正在推进当前任务的一个可追溯步骤|Advancing one traceable step|这一步失败了；错误会保留在过程记录里|This step failed; the error is kept in the process record|^(?:过程详情|工具结果|工具反馈|等待工具结果|继续处理|process details?|tool results?|waiting for tool results?)$|^(?:正在)?根据(?:最新)?(?:工具)?结果继续(?:推进|处理)?[。.!！]?$|^(?:当前状态不足以|没有可展示(?:的)?最终回答|任务(?:仍在|正在)后台|后台(?:正在|仍在))/i.test(text);
}

export function foldedBlockTitle(lang: string, body: string): string {
  if (lang === "cancip-action" || /^\{\s*"actions"\s*:/.test(body)) return "cancip-action";
  if (["bash", "sh", "zsh", "shell", "powershell", "ps1", "cmd", "bat", "terminal", "console"].includes(lang)) return lang || "command";
  if (lang) return lang;
  return body.startsWith("{") ? "json" : "details";
}

export function foldInlineDetails(content: string, hiddenToolBlocks: FoldedMessageBlock[]): string {
  return content.replace(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi, (_full, summary: string, body: string) => {
    const cleanSummary = summary.replace(/<[^>]+>/g, "").trim() || "details";
    const cleanBody = body.trim();
    if (cleanBody) hiddenToolBlocks.push({ title: cleanSummary, content: cleanBody });
    return "\n\n";
  });
}

export function redactSensitiveText(input: string): string {
  if (!input) return input;
  let redacted = input.replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***REDACTED***");
  redacted = redacted.replace(/ghp_[A-Za-z0-9_]{12,}/g, "ghp_***REDACTED***");
  redacted = redacted.replace(/github_pat_[A-Za-z0-9_]{12,}/g, "github_pat_***REDACTED***");
  redacted = redacted.replace(/AKIA[0-9A-Z]{16}/g, "AKIA***REDACTED***");
  redacted = redacted.replace(/(["']?(?:apiKey|githubToken|token|accessToken|secret|password)["']?\s*:\s*["'])[^"']+(["'])/gi, "$1***REDACTED***$2");
  redacted = redacted.replace(/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/gi, "$1\n***REDACTED***\n$2");
  redacted = redacted.replace(/(\b(?:api[_-]?key|github[_-]?token|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|authorization)\b\s*[:=]\s*["']?)([^\s,"'};]+)/gi, "$1***REDACTED***");
  redacted = redacted.replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]{12,}/gi, "$1***REDACTED***");
  redacted = redacted.replace(/([?&](?:api[_-]?key|token|access[_-]?token|secret|password)=)[^&#\s]+/gi, "$1***REDACTED***");
  return redacted;
}

export function ttsSourceWithReadableFrontmatter(input: string): string {
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(input.replace(/^\uFEFF/, ""));
  if (!match) return input;
  const readable: string[] = [];
  for (const rawLine of match[1].split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const listItem = /^-\s+(.+)$/.exec(trimmed);
    if (listItem?.[1]) {
      readable.push(listItem[1].replace(/^['"]|['"]$/g, ""));
      continue;
    }
    const property = /^([^:]+):\s*(.*)$/.exec(trimmed);
    if (property?.[1]) {
      const key = property[1].replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      const value = (property[2] ?? "").replace(/^['"]|['"]$/g, "").trim();
      readable.push(value ? `${key}：${value}` : `${key}：`);
      continue;
    }
    readable.push(trimmed);
  }
  return `${readable.join("\n")}\n${input.slice(match[0].length)}`;
}

export type MarkdownTtsEmbedReference = {
  start: number;
  end: number;
  raw: string;
  target: string;
};

