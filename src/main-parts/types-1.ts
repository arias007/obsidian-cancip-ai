/*
 * Cancip types-1 — extracted from src/main.ts by scripts/extract-main-modules.mjs.
 * Declarations here were proven to reference nothing left behind in main.ts, so this
 * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.
 */
import { type ReviewGateManifestItem } from "../reviewGate";
import { App, Editor, FileView, MarkdownView, normalizePath, Platform, type TAbstractFile, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import { formatFileSize } from "./model-api";
import { normalizeDocumentArchiveEntryPath, trimContext } from "./office";
import { flattenKeywordValue, stableTextHash, tokenize, uniqueStrings } from "./search";
import { parseFirstJsonObject } from "./ui";
import { canonicalJsonValue, isRecord } from "./vault-2";

export function createDetachedElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K] {
  const element = doc.body.createEl(tag);
  element.remove();
  return element;
}

export function isOwnDocumentHTMLElement(value: Element | null | undefined): value is HTMLElement {
  const constructor = value?.ownerDocument.defaultView?.HTMLElement;
  return Boolean(constructor && value instanceof constructor);
}

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  toolRuns?: ToolRun[];
  changedFileRuns?: ToolRun[];
  sources?: SearchHit[];
  choiceOptions?: ChoiceOption[];
  choiceOptionsStatus?: "loading" | "ready" | "failed";
  choiceSourceText?: string;
  workflowHint?: ComposerWorkflowHint;
  contextText?: string;
  systemPrompt?: string;
  mode?: ComposerMode;
  accessMode?: AccessMode;
  apiProfile?: {
    id: string;
    name: string;
    apiMode: ApiMode;
    model: string;
    hasApiUrl: boolean;
    hasApiKey: boolean;
  };
  automationTaskId?: string;
  automationTitle?: string;
  processBrief?: ProcessStepBrief;
  processAuditSections?: ProcessAuditSection[];
  modelUsage?: TokenUsage;
  modelTiming?: ModelTiming;
};

export type ContextCompactionState = {
  schemaVersion: 1;
  throughMessageId: string;
  throughCreatedAt: number;
  sourceHash: string;
  summary: string;
  updatedAt: string;
  sourceChars: number;
  compactedChars: number;
  estimatedSourceTokens: number;
  estimatedCompactedTokens: number;
};

export type ScoreEntityKind = "feature" | "tool" | "button" | "autocomplete" | "skill";

export type ScoreEntityState = {
  key: string;
  kind: ScoreEntityKind;
  label: string;
  selector?: string;
  scope?: UiButtonRule["scope"];
  targetKey?: string;
  layoutReviewAt?: string;
  score: number;
  uses: number;
  accepts: number;
  rejects: number;
  corrections: number;
  activeMs: number;
  lastUsedAt: string;
  lastDecayAt: string;
  updatedAt: string;
};

export type ScoreActivityState = {
  totalClicks: number;
  cancipClicks: number;
  totalActiveMs: number;
  cancipActiveMs: number;
};

export type ScoreState = {
  schemaVersion: number;
  updatedAt: string;
  totalScore: number;
  activity: ScoreActivityState;
  entities: Record<string, ScoreEntityState>;
};

export type ScoreEvent = {
  key: string;
  kind: ScoreEntityKind;
  label?: string;
  selector?: string;
  scope?: UiButtonRule["scope"];
  targetKey?: string;
  outcome: "use" | "accept" | "reject" | "correct" | "active";
  activeMs?: number;
  weight?: number;
};

export type ComposerMode = "ask" | "search" | "plan" | "edit";

export type ApiMode = "auto" | "compatible" | "responses";

export type TtsProvider = "auto" | "builtin-prime-tts" | "android-system" | "web-speech" | "custom-url";

export type TtsQualityMode = "quality-first";

export type TtsPlaybackMode = "idle" | "starting" | "playing" | "paused" | "stopped" | "failed";

export type ConfigBackupSource = "before-cancip-write" | "manual-baseline";

export type ConfigBackupRecord = {
  path: string;
  createdAt: string;
  hash: string;
  source: ConfigBackupSource;
};

export type ConfigBackupEntry = {
  lastCancipWriteHash?: string;
  lastCancipWriteAt?: string;
  lastManualBaselineHash?: string;
  lastManualBaselineAt?: string;
  latestBackupPath?: string;
  latestManualBaselinePath?: string;
  backups: ConfigBackupRecord[];
};

export type ConfigBackupIndex = {
  schemaVersion: number;
  entries: Record<string, ConfigBackupEntry>;
};

export type AccessMode = "ask-for-approval" | "full-access";

export type ComposerMenuKind = "add" | "access" | "model";

export type ReviewGatePackageData = {
  path: string;
  folder: string;
  title: string;
  generatedAt: string;
  sessionId?: string;
  items: ReviewGateManifestItem[];
};

export type ReviewGatePendingEntry = {
  packagePath: string;
  data: ReviewGatePackageData;
  item: ReviewGateManifestItem;
};

export type ReviewGateExpectedState = {
  path: string;
  text: string;
  exists: boolean;
  role: "content" | "old-path" | "new-path";
};

export type ReviewGateExpectedStateMode = "old" | "new";

export type ReviewGateManualSupersedeResult = {
  expected: ReviewGateExpectedState;
  actualExists: boolean;
  actualHash: string;
};

export type ReviewConfigChange = {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  kind: "added" | "removed" | "changed";
};

export type ReviewConfigDiff = {
  changes: ReviewConfigChange[];
  parsed: boolean;
  truncated: boolean;
};

export type ReviewGateLightItem = ReviewGateManifestItem & {
  summaryLineDelta?: LineDeltaSummary;
};

export type ReviewGateSnapshotEntry = {
  path: string;
  folder: string;
  data: ReviewGatePackageData;
  pendingPaths: Set<string>;
};

export type ReviewGateSnapshot = {
  loadedAt: number;
  packages: string[];
  byPath: Map<string, ReviewGateSnapshotEntry>;
  pendingCount: number;
};

export type ReviewGatePackageIndex = {
  schemaVersion: 1;
  updatedAt: string;
  packages: string[];
};

export type ReviewGateCanonicalPackageState = {
  manifestPath: string;
  pendingPaths: string[];
};

export type ReviewGateCanonicalState = {
  schemaVersion: 1;
  updatedAt: string;
  packages: ReviewGateCanonicalPackageState[];
  pendingPaths: string[];
};

export type ReviewGateSourcePane = {
  sourceBody: HTMLElement;
  renderBody: HTMLElement;
  ensureSource: () => void;
  ensureRendered: () => void;
};

export type ReviewDiffLine = {
  kind: "context" | "added" | "removed";
  oldLine?: number;
  newLine?: number;
  text: string;
};

export type ReviewDiffHunk = {
  lines: ReviewDiffLine[];
};

export type ReviewDiffBlock = {
  id: string;
  lines: ReviewDiffLine[];
};

export type ReviewDiffBlockDecisionState = {
  schemaVersion: 1;
  path: string;
  base: "approved" | "cancelled";
  decisions: Record<string, "approved" | "cancelled">;
};

export type LineDeltaSummary = {
  added: number;
  removed: number;
  estimated?: boolean;
};

export type ToolRunLineDelta = LineDeltaSummary & {
  path: string;
};

export type HeaderMenuKind = "history" | "events" | "outline" | "plan" | "live-files" | "audit" | "git" | "more" | "skills" | "automation" | "html-apps";

export type AiOverviewCardId = "sessions" | "reviews" | "automations" | "vault";

export type AiOverviewLayout = "grid" | "list";

export type AiOverviewAccent = "auto" | "blue" | "green" | "orange";

export type HtmlAppState = {
  version: 1;
  pinned: string[];
  order: string[];
  known: string[];
};

export type ComposerSubmitMode = "queue" | "direct" | "hold";

export type CancipVaultSyncKind = "review" | "sessions" | "config" | "automations" | "skills" | "memory" | "personalization" | "versions" | "file-pins" | "documents";

export type ApiProfile = {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  apiMode: ApiMode;
  model: string;
};

export type ApiProbeResult = {
  ok: boolean;
  profileId: string;
  endpoint: string;
  latencyMs: number;
  modelCount: number;
  checkedAt: string;
  error?: string;
};

export type ModelProbeResult = {
  ok: boolean;
  model: string;
  profileId: string;
  endpoint: string;
  latencyMs: number;
  checkedAt: string;
  responseText?: string;
  error?: string;
};

export function modelProbeNotice(model: string, result: ModelProbeResult): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const content = document.createElement("div");
  content.className = "obcc-model-probe-notice";
  const title = document.createElement("div");
  title.className = "obcc-model-probe-notice-title";
  title.textContent = `${model} · ${result.latencyMs} ms`;
  content.append(title);
  const reply = result.responseText?.trim() ?? "";
  if (reply) {
    const replyEl = document.createElement("div");
    replyEl.className = "obcc-model-probe-notice-reply";
    replyEl.textContent = reply;
    content.append(replyEl);
  }
  fragment.append(content);
  return fragment;
}

export type ModelMenuEntry = {
  model: string;
  profile: ApiProfile;
};

export type ModelCallAudit = {
  mode: Exclude<ApiMode, "auto"> | "agent";
  url: string;
  requestBody: unknown;
  requestBodyText?: string;
  status?: number;
  responseText?: string;
  responseDisplayText?: string;
  responseJson?: unknown;
  extractedText?: string;
  usage?: TokenUsage;
  error?: string;
  previousAttempts?: ModelCallAudit[];
};

export type ModelCallRetryProgress = {
  attempt: number;
  maxAttempts: number;
  reason: string;
  retrying: boolean;
  waitingMs?: number;
};

export type ModelStreamProgress = {
  text: string;
  done: boolean;
};

export type ModelStreamCallback = (progress: ModelStreamProgress) => void;

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  estimated: boolean;
};

export type ModelTiming = {
  startedAt: number;
  firstTokenAt?: number;
  completedAt?: number;
};

export type ModelEditModalResult = {
  model: string;
  profileId: string;
};

export type ModelEditModalInput = {
  title: string;
  modelLabel: string;
  profileLabel: string;
  saveLabel: string;
  cancelLabel: string;
  profiles: ApiProfile[];
  initialModel: string;
  initialProfileId: string;
};

export type DefaultModelPickerItem = { model: string; source: string };

export type ModelCharStats = {
  inputChars: number;
  outputChars: number;
  streaming: boolean;
  completed: boolean;
  startedAt: number;
};

export type TurnModelUsage = {
  calls: number;
  inputChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  estimated: boolean;
};

export function emptyTurnModelUsage(): TurnModelUsage {
  return {
    calls: 0,
    inputChars: 0,
    outputChars: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    estimated: false
  };
}

export type ProgressStepSummary = string | (() => string);

export type SearchHit = {
  path: string;
  title: string;
  excerpt: string;
  score: number;
  kind?: UniversalSearchDocumentKind;
  route?: "hard" | "soft";
  archived?: boolean;
  relation?: AiSearchRelation;
  reason?: string;
};

export type SearchQueryKindConstraint = "image" | "pdf" | "note" | "office" | "archive" | "audio" | "video";

export type SearchQueryIntent = {
  requestedKinds: SearchQueryKindConstraint[];
  subjectQuery: string;
  subjectTerms: string[];
};

export type SearchResultCategory = "all" | "image" | "video" | "audio" | "note" | "pdf" | "office" | "archive" | "other";

export type SearchResultCategoryDefinition = {
  id: SearchResultCategory;
  icon: string;
};

export type SearchPaneState = "split" | "ai" | "hard";

export type AiSearchRelation = "direct" | "concept" | "context" | "style" | "inspiration";

export type AiSearchExpansion = {
  queries: string[];
  concepts: string[];
  styleSignals: string[];
  intent: string;
};

export type AiSearchProgress = {
  phase: "expansion" | "retrieval" | "ranked";
  expansion: AiSearchExpansion;
  hits: SearchHit[];
};

export type EditorAutocompleteMemoryDocument = {
  path: string;
  content: string;
  kind: "memory" | "project" | "experience" | "session";
  priority: number;
  updatedAt: number;
  searchText?: string;
  loaded?: boolean;
};

export type EditorAutocompleteMemoryCorpus = {
  at: number;
  documents: EditorAutocompleteMemoryDocument[];
};

export type InstalledPluginInfo = {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  manifestFound: boolean;
  error?: string;
  description?: string;
};

export type NotificationHubSendResult = {
  ok: boolean;
  status?: string;
  results?: Array<{ channelId?: string; ok?: boolean; status?: string; error?: string }>;
};

export type NotificationHubApi = {
  apiVersion?: string;
  getStatus?: () => { ready?: boolean; defaultChannelId?: string };
  send: (input: {
    source: string;
    event: string;
    title: string;
    message: string;
    priority?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }) => Promise<NotificationHubSendResult>;
};

export type PluginCapabilityInfo = InstalledPluginInfo & {
  score: number;
  explicitScore?: number;
};

export type PluginCompatibilityRisk = "read" | "effect" | "write" | "high";

export type PluginCompatibilityRouteType = "command" | "api" | "ui";

export type PluginCompatibilityVerification = {
  scope?: "active" | "cancip" | "global";
  selector?: string;
  exists?: boolean;
  visible?: boolean;
  textContains?: string | string[];
  activeFile?: string;
  viewType?: string;
  timeoutMs?: number;
};

export type PluginCompatibilityRoute = {
  type: PluginCompatibilityRouteType;
  commandId?: string;
  commandQuery?: string;
  target?: "api" | "runtime";
  method?: string;
  selector?: string;
  label?: string;
  scope?: "active" | "cancip" | "global";
  operation?: "click" | "input" | "select" | "toggle" | "key";
  value?: unknown;
  key?: string;
  verify?: PluginCompatibilityVerification;
};

export type PluginCompatibilityActionContext = {
  app: App;
  pluginId: string;
  actionId: string;
  input: unknown;
};

export type PluginCompatibilityActionDefinition = {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  risk: PluginCompatibilityRisk;
  inputSchema?: Record<string, unknown>;
  route?: PluginCompatibilityRoute;
  run?: (input: unknown, context: PluginCompatibilityActionContext) => unknown | Promise<unknown>;
};

export type PluginCompatibilityDescriptor = {
  schemaVersion: "1.0";
  pluginId: string;
  pluginName?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  actions: PluginCompatibilityActionDefinition[];
};

export type PluginCompatibilitySource = "registered" | "descriptor" | "runtime" | "inferred";

export type PluginCompatibilityProfile = {
  descriptor: PluginCompatibilityDescriptor;
  source: PluginCompatibilitySource;
  confidence: number;
  descriptorPath?: string;
};

export type RegisteredPluginCompatibilityAdapter = {
  descriptor: PluginCompatibilityDescriptor;
  registrationId: string;
  registeredAt: string;
};

export type PluginCompatibilityHandle = {
  pluginId: string;
  registrationId: string;
  descriptor: PluginCompatibilityDescriptor;
  unregister: () => boolean;
};

export type PluginLearningIndexEntry = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  description?: string;
  commands: string[];
  runtime: {
    loaded: boolean;
    methods: string[];
    apiMethods: string[];
  };
  compatibility: {
    mode: PluginCompatibilitySource;
    confidence: number;
    descriptorPath?: string;
    guidePath: string;
    settingsPath: string;
    keywords: string[];
    actions: Array<{
      id: string;
      title: string;
      risk: PluginCompatibilityRisk;
      route: PluginCompatibilityRouteType | "callback";
      description?: string;
    }>;
  };
};

export type PluginLearningIndex = {
  schemaVersion: number;
  generatedAt: string;
  sourceSignature: string;
  plugins: PluginLearningIndexEntry[];
};

export type CancipSkill = {
  id: string;
  name: string;
  path: string;
  folder: string;
  description: string;
  triggers: string[];
  source: "vault" | "cancip";
  priority: number;
  content?: string;
};

export type BuiltinCancipSkill = CancipSkill & {
  content: string;
};

export type CancipSkillIndex = {
  schemaVersion: number;
  generatedAt: string;
  settings: {
    enabled: boolean;
    roots: string[];
    autoSelect: boolean;
    maxAutoSkills: number;
    maxSkillContextChars: number;
    maxAutoSkillContextChars: number;
  };
  skills: CancipSkill[];
};

export type ExperienceSkillRecipe = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  count: number;
  fileName: string;
  content: string;
};

export type CapabilityRoute = {
  id: string;
  title: string;
  purpose: string;
  first: string;
  verify: string;
  fallback: string;
  source: string;
  keywords: string[];
  priority: number;
};

export type CodexCapabilityImportResult = {
  memoryCount: number;
  skillCount: number;
  folder: string;
  skillFolder: string;
  memoryFiles: string[];
  skillFiles: string[];
  skipped: string[];
};

export type DesktopFsLike = {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
  readdir(path: string, options?: { withFileTypes?: boolean }): Promise<Array<string | { name: string; isFile(): boolean; isDirectory(): boolean }>>;
};

export type VaultTextFile = {
  path: string;
  basename: string;
  extension: string;
  loaded?: boolean;
};

export type TargetCandidateKind = "file" | "folder" | "content" | "attachment" | "attachment-content" | "command";

export type TargetCandidate = {
  kind: TargetCandidateKind;
  path: string;
  title: string;
  score: number;
  reason: string;
  detail?: string;
  next?: string;
};

export type SimpleVaultTargetRequest = {
  intent: "open" | "read";
  query: string;
  targetKind: TargetCandidateKind;
  containerQuery?: string;
  originalQuery?: string;
};

export type ContextSource = "file" | "folder" | "virtual";

export type ImageAttachmentContext = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type DraftContext = {
  id: string;
  label: string;
  content: string;
  path?: string;
  source?: ContextSource;
  mimeType?: string;
  dataUrl?: string;
};

export type AttachmentReadResult = {
  content: string;
  mimeType?: string;
  dataUrl?: string;
};

export type ParsedAttachmentResult = {
  kind: string;
  text: string;
  warnings: string[];
};

export type OcrLayoutBlock = {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
};

export type OcrIndexEntry = {
  schemaVersion: number;
  engineVersion: string;
  source: "vault" | "remote";
  path: string;
  sourceKey: string;
  mtime: number;
  size: number;
  indexedAt: string;
  languages: string;
  confidence: number;
  width: number;
  height: number;
  text: string;
  description: string;
  semanticTags: string[];
  blocks: OcrLayoutBlock[];
  pages?: Array<{ page: number; text: string; description: string; confidence: number; semanticTags: string[] }>;
};

export type ComposerWorkflowHint = {
  title: string;
  steps: string[];
};

export type ComposerSuggestionChoice = {
  text: string;
  steps: string[];
};

export type AutocompleteDraft = {
  suffix: string;
  choices: ComposerSuggestionChoice[];
};

export type DocumentWorkbenchMode = "preview" | "reading" | "markdown" | "markdown-reading" | "edit";

export type DocumentPreviewKind = "markdown" | "html" | "pdf" | "image" | "audio" | "video";

export type DocumentArchiveFormat = "zip" | "tar" | "tar-gzip" | "gzip" | "rar" | "7z" | "unsupported";

export type DocumentArchiveEntryPreviewKind = "markdown" | "html" | "text" | "pdf" | "image" | "audio" | "video" | "binary";

export type DocumentArchiveEntry = {
  path: string;
  size: number;
  compressedSize: number;
  previewKind: DocumentArchiveEntryPreviewKind;
  editable: boolean;
  encrypted?: boolean;
  compression?: number;
};

export type DocumentArchiveSnapshot = {
  format: DocumentArchiveFormat;
  entries: DocumentArchiveEntry[];
  editable: boolean;
  warning?: string;
};

export type DocumentArchiveEntryContent = DocumentArchiveEntry & {
  bytes: Uint8Array;
  mimeType: string;
  text: string;
  textAvailable: boolean;
  encoding: DocumentTextEncoding;
  hasBom: boolean;
};

export type DocumentFormatKind =
  | "markdown"
  | "text"
  | "json"
  | "csv"
  | "html"
  | "mhtml"
  | "epub"
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "image"
  | "audio"
  | "video"
  | "archive"
  | "binary";

export type DocumentWorkbenchState = {
  filePath: string;
  mode: DocumentWorkbenchMode;
  zoom?: number;
  scrollTop?: number;
  scrollLeft?: number;
  caretStart?: number;
  caretEnd?: number;
};

export type DocumentViewportState = {
  scrollTop: number;
  scrollLeft: number;
  zoom: number;
  caretStart?: number;
  caretEnd?: number;
  updatedAt: number;
};

export type DocumentTextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "gb18030" | "big5" | "windows-1252";

export type DocumentSnapshot = {
  file: TFile;
  sourceMtime: number;
  sourceSize: number;
  kind: DocumentFormatKind;
  previewKind: DocumentPreviewKind;
  mimeType: string;
  sourceText: string;
  rawSourceText: string;
  rawSourceAvailable: boolean;
  rawSourceEditable: boolean;
  rawSourceEncoding: DocumentTextEncoding;
  rawSourceHasBom: boolean;
  markdown: string;
  previewHtml: string;
  editableSource: boolean;
  warnings: string[];
  archive?: DocumentArchiveSnapshot;
};

export type DocumentExportSurface = {
  rootEl: HTMLElement;
  scrollEl: HTMLElement;
  mode: "generic";
};

export type PreparedDocumentExportSurface = DocumentExportSurface & {
  route: string;
  cleanup: () => Promise<void> | void;
};

export type MobileDocumentExporterRuntime = {
  exportFile: (source: TFile, settings?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
  getActiveExportSurface?: (source: TFile) => DocumentExportSurface | null;
  settings?: Record<string, unknown>;
};

export type DocumentPreviewSourceLocator = {
  selector?: string;
  entryPath?: string;
  officePart?: string;
  officeTag?: string;
  officeIndex?: number;
  officeMoveTag?: string;
  officeMoveIndex?: number;
};

export type OfficePreviewLocatorMode = "text" | "move";

export function officePreviewLocatorKey(locator: DocumentPreviewSourceLocator, mode: OfficePreviewLocatorMode): string {
  const part = normalizeDocumentArchiveEntryPath(locator.officePart ?? "");
  const tag = mode === "move" ? locator.officeMoveTag : locator.officeTag;
  const index = Number(mode === "move" ? locator.officeMoveIndex : locator.officeIndex);
  if (!part || !tag || !Number.isInteger(index) || index < 0) return "";
  return `${mode}:${part}:${tag}:${index}`;
}

export function mobilePdfExporterMovePreviewLocators(
  kind: "docx" | "pptx",
  moving: DocumentPreviewSourceLocator,
  target: DocumentPreviewSourceLocator
): Array<{ locator: DocumentPreviewSourceLocator; mode: OfficePreviewLocatorMode }> {
  const entries: Array<{ locator: DocumentPreviewSourceLocator; mode: OfficePreviewLocatorMode }> = [
    { locator: moving, mode: "move" },
    { locator: target, mode: "move" }
  ];
  if (kind !== "docx"
    || normalizeDocumentArchiveEntryPath(moving.officePart ?? "") !== normalizeDocumentArchiveEntryPath(target.officePart ?? "")
    || moving.officeMoveTag !== target.officeMoveTag) return entries;
  const from = Number(moving.officeMoveIndex);
  const to = Number(target.officeMoveIndex);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return entries;
  const tag = moving.officeMoveTag ?? "";
  for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) {
    entries.push({
      locator: { officePart: moving.officePart, officeTag: tag, officeIndex: index, officeMoveTag: tag, officeMoveIndex: index },
      mode: "text"
    });
  }
  return entries;
}

export function documentPreviewSourceLocatorFromValue(value: unknown): DocumentPreviewSourceLocator {
  if (!isRecord(value)) return {};
  const locator: DocumentPreviewSourceLocator = {};
  for (const key of ["selector", "entryPath", "officePart", "officeTag", "officeMoveTag"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) locator[key] = candidate.trim();
  }
  for (const key of ["officeIndex", "officeMoveIndex"] as const) {
    const candidate = Number(value[key]);
    if (Number.isInteger(candidate) && candidate >= 0) locator[key] = candidate;
  }
  return locator;
}

export function documentPreviewSourceLocatorIsExact(locator: DocumentPreviewSourceLocator): boolean {
  return Boolean(
    (locator.entryPath && locator.selector)
    || (locator.officePart && locator.officeTag && Number.isInteger(locator.officeIndex))
  );
}

export type DocumentPersistentTextEdit = {
  originalText: string;
  editedText: string;
  updatedAt: string;
};

export type DocumentPersistentEditState = {
  schemaVersion: 1;
  sourcePath: string;
  sourceMtime: number;
  updatedAt: string;
  edits: DocumentPersistentTextEdit[];
};

export type DocumentDrawingAnchor = {
  v: 1;
  basis: "note-content-v1";
  x: number;
  y: number;
  path: string;
  line: number | null;
  lineConfidence: number | null;
};

export type DocumentDrawingPoint = { x: number; y: number; t: number; anchor?: DocumentDrawingAnchor };

export type DocumentDrawingStroke = {
  points: DocumentDrawingPoint[];
  color?: string;
  width?: number;
  opacity?: number;
  brush?: string;
};

export type DocumentDrawingTextStroke = {
  index: number;
  point: DocumentDrawingPoint;
  text: string;
  color: string;
  fontSize: number;
  bold: boolean;
  code: boolean;
};

export type NoteDrawApi = {
  apiVersion?: string;
  v1?: NoteDrawApi;
  registerSurface?: (options?: Record<string, unknown>) => NoteDrawSurfaceHandle | null;
  listSurfaces?: () => unknown;
  getState?: (options?: Record<string, unknown>) => unknown;
  activate?: (options?: Record<string, unknown>) => unknown;
  deactivate?: (options?: Record<string, unknown>) => unknown;
  toggle?: (options?: Record<string, unknown>) => unknown;
  setTool?: (tool: string, options?: Record<string, unknown>) => unknown;
  readDrawings?: (file: TFile) => unknown;
  writeDrawings?: (file: TFile, data: Record<string, unknown>) => unknown;
  insertStroke?: (file: TFile, stroke: Record<string, unknown>) => unknown;
  getStoragePaths?: (file: TFile) => unknown;
  on?: (event: string, listener: (detail: unknown) => void) => void | (() => void);
};

export type NoteDrawSurfaceHandle = {
  apiVersion?: string;
  ready?: Promise<void>;
  surface?: Record<string, unknown> | null;
  activate?: (options?: string | Record<string, unknown>) => unknown;
  deactivate?: (options?: Record<string, unknown>) => unknown;
  toggle?: (options?: Record<string, unknown>) => unknown;
  setTool?: (tool: string, options?: Record<string, unknown>) => unknown;
  getState?: (options?: Record<string, unknown>) => unknown;
  getElements?: (options?: Record<string, unknown>) => unknown;
  refresh?: () => unknown;
  on?: (event: string, listener: (detail: unknown) => void) => void | (() => void);
  destroy?: () => unknown;
};

export type NoteDrawWorkbenchController = {
  active?: boolean;
  canvas?: HTMLCanvasElement;
  destroy?: () => void;
  embedLayer?: HTMLElement;
  eventToPoint?: (event: { clientX: number; clientY: number }) => unknown;
  staticCanvas?: HTMLCanvasElement;
  toolbar?: HTMLElement;
  toolMode?: string;
  resizeCanvas?: (...args: unknown[]) => unknown;
  setBrushMode?: (mode: string) => void;
  setToolFromApi?: (tool: string) => boolean;
  toggle?: () => unknown;
};

export type NoteDrawRuntime = {
  api?: NoteDrawApi;
  resolveLivePreviewController?: (view: FileView, controllers?: unknown[]) => unknown;
  syncWorkspaceControllers?: () => void;
};

export type VaultAttachmentParseCacheEntry = ParsedAttachmentResult & {
  mtime: number;
  size: number;
};

export type ZipEntry = {
  name: string;
  flags: number;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

export type TarEntry = {
  name: string;
  size: number;
  type: string;
  headerOffset: number;
  dataOffset: number;
  spanEnd: number;
};

export type VaultSearchHistoryEntry = {
  query: string;
  searchedAt: string;
  ai: boolean;
  includeArchived: boolean;
  includeConfigs: boolean;
};

export type NativeTtsBridge = {
  name: string;
  speak: (text: string, lang: string) => Promise<void>;
  stop?: () => Promise<void>;
  pause?: () => Promise<void>;
  resume?: () => Promise<void>;
};

export type PrimeTtsMeta = {
  sample_rate: number;
  abs_frame_bins: number;
  max_frames: number;
};

export type PrimeTtsPackageDefinition = {
  id: string;
  label: string;
  languages: readonly string[];
  basePath?: string;
  packageFolderName?: string;
  releaseTag?: string;
  assetName?: string;
  url?: string;
  defaultPackage?: boolean;
  bundled?: boolean;
  custom?: boolean;
  notes?: string;
};

export type PrimeTtsWorkerClient = {
  worker: Worker;
  requestId: number;
  pending: Map<number, { resolve: (value: ArrayBuffer) => void; reject: (reason?: unknown) => void }>;
};

export type PrimeTtsWorkerRuntime = {
  kind: "worker";
  client: PrimeTtsWorkerClient;
  meta: PrimeTtsMeta;
};

export type PrimeTtsRuntime = PrimeTtsWorkerRuntime;

export type TtsStatus = {
  mode: TtsPlaybackMode;
  provider: TtsProvider | "";
  startedAudio: boolean;
  label: string;
  partIndex: number;
  partCount: number;
  partText: string;
  rate: number;
  pitch: number;
  voice: string;
  qualityMode: TtsQualityMode;
  lastError: string;
};

export type TtsPartPlan = {
  playParts: string[];
  displayParts: string[];
  displayIndexByPlayIndex: number[];
};

export type TtsFileSnapshot = {
  text: string;
  sourceText: string;
};

export type CurrentPageTranslationCapture = {
  text: string;
  label: string;
  path: string;
  source: "selection" | "file" | "pdf" | "unsupported" | "none";
};

export type PageTranslationTarget = {
  id: number;
  text: string;
  apply: (translated: string) => void;
};

export type PrimeTtsPlayable =
  | { kind: "audio-buffer"; buffer: AudioBuffer }
  | { kind: "wav"; buffer: ArrayBuffer };

export type TtsOverlayElements = {
  root: HTMLElement;
  bubble: HTMLButtonElement;
  panel: HTMLElement;
  handle: HTMLElement;
  title: HTMLButtonElement;
  meta: HTMLElement;
  text: HTMLElement;
  settingsButton: HTMLButtonElement;
  installButton: HTMLButtonElement;
  progress: HTMLInputElement;
  progressLabel: HTMLElement;
  settingsPanel: HTMLElement;
  providerSelect: HTMLSelectElement;
  voiceInput: HTMLInputElement;
  rate: HTMLInputElement;
  rateLabel: HTMLElement;
  pitch: HTMLInputElement;
  pitchLabel: HTMLElement;
  previousButton: HTMLButtonElement;
  playPauseButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
};

export type ManualTodo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  sendToModel?: boolean;
  planOnly?: boolean;
  source?: "manual" | "programmatic";
};

export type RealtimeTodo = {
  text: string;
  done: boolean;
};

export type QueuedPrompt = {
  id: string;
  prompt: string;
  createdAt: number;
  held?: boolean;
};

export type TaskControlState = {
  originalPrompt: string;
  taskGoal: string;
  startedAt: string;
  updatedAt: string;
};

export type TodoActionOperation = "set" | "add" | "update" | "remove" | "list" | "clear";

export type TodoActionItem = {
  id?: string;
  text: string;
  done?: boolean;
  sendToModel?: boolean;
};

export type TodoAction = {
  type: "todo";
  op: TodoActionOperation;
  id?: string;
  text?: string;
  done?: boolean;
  sendToModel?: boolean;
  planOnly?: boolean;
  items?: TodoActionItem[];
};

export type AutomationSchedule = "manual" | "hourly" | "daily";

export type AutomationSessionMode = "current" | "new" | "session";

export type AutomationActionOperation = "add" | "update" | "remove" | "list" | "run";

export type AutomationNotifyMode = "inherit" | "always" | "failure" | "never";

export type AutomationRunStatus = "ok" | "failed" | "skipped" | "pending";

export type AutomationTask = {
  id: string;
  title: string;
  prompt: string;
  command?: string;
  args?: Record<string, unknown>;
  apiProfileId?: string;
  model?: string;
  schedule: AutomationSchedule;
  enabled: boolean;
  intervalMinutes: number;
  hour: number;
  minute: number;
  sessionMode: AutomationSessionMode;
  sessionId?: string;
  condition?: string;
  watchNewFiles: boolean;
  ignoreMachineFiles: boolean;
  newFilePattern?: string;
  newFileDebounceSeconds: number;
  notifyMode: AutomationNotifyMode;
  silent: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: AutomationRunStatus;
  lastResult?: string;
  lastResultPath?: string;
};

export type AutomationAction = {
  type: "automation";
  op: AutomationActionOperation;
  id?: string;
  title?: string;
  prompt?: string;
  command?: string;
  args?: Record<string, unknown>;
  apiProfileId?: string;
  model?: string;
  schedule?: AutomationSchedule;
  enabled?: boolean;
  intervalMinutes?: number;
  hour?: number;
  minute?: number;
  sessionMode?: AutomationSessionMode;
  sessionId?: string;
  condition?: string;
  watchNewFiles?: boolean;
  ignoreMachineFiles?: boolean;
  newFilePattern?: string;
  newFileDebounceSeconds?: number;
  notifyMode?: AutomationNotifyMode;
  silent?: boolean;
};

export type AutomationRunResult = {
  ok: boolean;
  status: AutomationRunStatus;
  text: string;
  path?: string;
};

export type AutomationRunnerResult = {
  status: Extract<AutomationRunStatus, "ok" | "pending" | "skipped">;
  text: string;
  changedPaths?: string[];
};

export type AutomationSessionChoice = {
  id: string;
  title: string;
  updatedAt: string;
  archived: boolean;
};

export type NewsBriefPeriod = "morning" | "evening";

export type NewsBriefSource = {
  name: string;
  category: string;
  url: string;
};

export type VaultDailyReportItem = {
  path: string;
  mtime: number;
  size: number;
  reason: string;
  excerpt?: string;
};

export type VaultDailyUnresolvedLinkIssue = {
  source: string;
  target: string;
  count: number;
};

export type VaultCurationComposition = {
  characters: number;
  lines: number;
  headings: number;
  listItems: number;
  tasks: number;
  tables: number;
  codeBlocks: number;
  quotes: number;
  embeds: number;
};

export type VaultCurationLinkRelation = {
  direction: "outgoing" | "backlink" | "unresolved" | "suggested";
  target: string;
  count: number;
  relationHint: string;
  evidence?: string;
};

export type VaultCurationAllowedAction = "format" | "properties" | "summary" | "links" | "rename";

export type VaultCurationDecision = {
  action: "curate" | "skip" | "protected";
  reasons: string[];
  protections: string[];
  allowedActions: VaultCurationAllowedAction[];
};

export type VaultCurationCandidate = {
  path: string;
  ctime: number;
  mtime: number;
  size: number;
  reason: string;
  curationReasons: string[];
  decision: VaultCurationDecision;
  title?: string;
  tags: string[];
  outLinks: number;
  backlinks: number;
  composition: VaultCurationComposition;
  linkRelations: VaultCurationLinkRelation[];
  content?: string;
  excerpt?: string;
};

export type VaultCurationNewFileState = {
  schemaVersion: 1 | 2;
  initializedAt: string;
  updatedAt: string;
  known: Record<string, number>;
  pending: string[];
};

export type VaultDailyTaskClue = {
  path: string;
  line: string;
  done: boolean;
};

export type KnowledgeWikiCard = {
  key: string;
  topic: string;
  title: string;
  summary: string;
  facts: string[];
  sources: string[];
  confidence: "high" | "medium";
  updatedAt: string;
};

export type NewsBriefItem = {
  source: string;
  category: string;
  title: string;
  link: string;
  published: string;
  summary: string;
};

export type PromptPayloadPolicy = {
  intent: PromptIntent;
  compactStateChange: boolean;
  includeToolProtocol: boolean;
  includeToolCatalog: boolean;
  includeDetailedToolProtocol: boolean;
  includeAccessPrompt: boolean;
  includeRecentTranscript: boolean;
  includeHistoryAnchors: boolean;
  includeWorkingState: boolean;
  includeCoreMemory: boolean;
  includeMemoryIndex: boolean;
  includeDetailedRules: boolean;
  includeProjectMemory: boolean;
  includePluginMemory: boolean;
  includeExperience: boolean;
  includeCurrentFile: boolean;
  includeDraftContext: boolean;
  includeAutoSkills: boolean;
};

export type AutomationTemplate = {
  id: string;
  title: string;
  description: string;
  prompt?: string;
  command?: string;
  args?: Record<string, unknown>;
  schedule: AutomationSchedule;
  enabled: boolean;
  intervalMinutes?: number;
  hour?: number;
  minute?: number;
  watchNewFiles?: boolean;
  ignoreMachineFiles?: boolean;
  newFilePattern?: string;
  newFileDebounceSeconds?: number;
  notifyMode?: AutomationNotifyMode;
  silent?: boolean;
};

export type ContextChip = {
  key: string;
  kind: string;
  icon: string;
  name: string;
  path: string;
  source: ContextSource;
  draftId?: string;
};

export type MessageDisplay = {
  visibleContent: string;
  runStatsText: string;
  runStatsUsage?: TurnModelUsage;
  hiddenToolBlocks: FoldedMessageBlock[];
  hasProcessFold: boolean;
  processOnly: boolean;
};

export type FoldedMessageBlock = {
  title: string;
  content: string;
};

export type ProcessAuditGroup = "sent" | "received" | "runtime" | "other";

export type ProcessAuditSection = {
  title: string;
  content: string;
  group: ProcessAuditGroup;
  raw?: boolean;
};

export type ProcessStepBrief = {
  reasoning: string;
  action: string;
  result: string;
  next: string;
};

/** DSH-style semantic row variants.  A process row is a lifecycle event, not
 * merely the next item in an array; the variant drives its icon, title and
 * disclosure body. */
export type ProcessStepKind = "context" | "think" | "tool" | "result";

export type RenderedMessage = {
  message: ChatMessage;
  display: MessageDisplay;
  index: number;
};

export type ProcessRecordStep = {
  rendered: RenderedMessage;
  kind: ProcessStepKind;
  reasoningSummary: string;
  reasoningDetail: string;
  headline: string;
  brief: ProcessStepBrief;
  readableDetail: string;
  detail: string;
  blocks: FoldedMessageBlock[];
  auditSections: ProcessAuditSection[];
  hasDetail: boolean;
  count: number;
  elapsedMs: number;
  overrideTitle?: string;
};

export type ToolRunDisplayGroup = {
  key: string;
  run: ToolRun;
  runs: ToolRun[];
  count: number;
};

export type MessageScrollSnapshot = {
  stickToBottom: boolean;
  topMessageId: string;
  topOffset: number;
  rawScrollTop: number;
};

export type ChoiceOption = {
  prefix: string;
  text: string;
};

export type FileExplorerViewLike = {
  revealInFolder?: (target: TFile | TFolder) => void | Promise<void>;
  requestSort?: () => void;
  sort?: () => void;
  getSortedFolderItems?: (folder: TFolder) => FileExplorerItemLike[];
};

export type FileExplorerItemLike = {
  file?: TAbstractFile;
};

export type FileExplorerSortPatch = {
  original: (folder: TFolder) => FileExplorerItemLike[];
  patched: (folder: TFolder) => FileExplorerItemLike[];
};

export type FilePinState = {
  schemaVersion: 1;
  updatedAt: string;
  folders: Record<string, string[]>;
};

export type FilePinSortSession = {
  folderPath: string;
  initialOrder: string[];
  draftOrder: string[];
  draggingPath: string;
  cleanup: () => void;
};

export type LocalVersionKind = "manual" | "daily";

export type LocalVersionFile = {
  path: string;
  size: number;
  mtime: number;
  hash: string;
  snapshotPath: string;
};

export type LocalVersionCommit = {
  id: string;
  kind: LocalVersionKind;
  message: string;
  createdAt: string;
  scannedCount: number;
  fileCount: number;
  files: LocalVersionFile[];
};

export type LocalVersionIndex = {
  schemaVersion: number;
  lastDailyDate: string;
  commits: Array<Omit<LocalVersionCommit, "files">>;
  latestHashes: Record<string, string>;
};

export type LocalVersionResult = {
  status: "created" | "no-changes" | "baseline";
  commit?: LocalVersionCommit;
  scannedCount: number;
  changedCount: number;
};

export type SessionHistoryEntry = {
  id: string;
  title: string;
  /** Short excerpt of the user's conversation content for quick scanning. */
  summary?: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  metadataUpdatedAt?: string;
  completedAt?: string;
  stoppedAt?: string;
  failedAt?: string;
  messageCount: number;
  mode: ComposerMode;
  model: string;
  status?: "idle" | "running" | "completed" | "failed" | "stopped";
  completedNotice?: boolean;
  unread?: boolean;
  pinned?: boolean;
  archived?: boolean;
  coldArchived?: boolean;
  archivedAt?: string;
  lastOpenedAt?: string;
  manualTitle?: boolean;
  manualOrder?: number;
  parentSessionId?: string;
  parentSessionTitle?: string;
  subagentIds?: string[];
  subagentRole?: string;
  subagentGoal?: string;
  subagentProgress?: string;
  subagentPlanStepId?: string;
  subagentAcceptance?: string;
  subagentDeadlineAt?: string;
  subagentAttempt?: number;
  subagentStartedAt?: string;
  subagentCompletedAt?: string;
  path: string;
  eventOnly?: boolean;
};

export type SessionTimeline = {
  id: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  stoppedAt?: string;
  failedAt?: string;
  status?: SessionHistoryEntry["status"];
};

export type SessionHistoryEntryPatch = Partial<Pick<SessionHistoryEntry, "title" | "summary" | "unread" | "completedNotice" | "pinned" | "archived" | "coldArchived" | "archivedAt" | "lastOpenedAt" | "manualTitle" | "manualOrder" | "updatedAt" | "metadataUpdatedAt" | "startedAt" | "completedAt" | "stoppedAt" | "failedAt" | "status" | "parentSessionId" | "parentSessionTitle" | "subagentIds" | "subagentRole" | "subagentGoal" | "subagentProgress" | "subagentPlanStepId" | "subagentAcceptance" | "subagentDeadlineAt" | "subagentAttempt" | "subagentStartedAt" | "subagentCompletedAt">>;

export type SubagentStartSpec = {
  goal: string;
  role: string;
  title: string;
  parentSessionId: string;
  planStepId: string;
  acceptance: string;
  timeoutMinutes: number;
  attempt: number;
  model: string;
  apiProfileId: string;
  fallbackModels: string[];
};

export type StartedSubagent = {
  sessionId: string;
  path: string;
  title: string;
  completion: Promise<void>;
};

export type CancipArchiveKind = "session" | "session-events" | "experience" | "memory";

export type CancipArchiveEntry = {
  id: string;
  kind: CancipArchiveKind;
  title: string;
  path: string;
  originalPath: string;
  archivedAt: string;
  lastUsedAt: string;
  size: number;
  hash?: string;
  session?: SessionHistoryEntry;
};

export type CancipArchiveIndex = {
  schemaVersion: number;
  updatedAt: string;
  lastMaintenanceAt: string;
  entries: CancipArchiveEntry[];
};

export type SessionRetentionRecord = {
  key: string;
  sourcePath: string;
  sourceHash: string;
  extractedAt: string;
  memoryItems: number;
};

export type SessionRetentionLedger = {
  schemaVersion: number;
  updatedAt: string;
  records: SessionRetentionRecord[];
};

export type SessionRetentionCandidate = {
  key: string;
  path: string;
  raw: string;
  title: string;
  kind: CancipArchiveKind;
  session?: SessionHistoryEntry;
  hotSessionId?: string;
  archiveEntryId?: string;
};

export type UniversalSearchDocumentKind = "note" | "memory" | "session" | "config" | "pdf" | "image" | "office" | "archive" | "file";

export type UniversalSearchDocument = {
  path: string;
  title: string;
  kind: UniversalSearchDocumentKind;
  mtime: number;
  size: number;
  indexedAt: string;
  textChars: number;
  bloom: string;
  signals: string;
  ocrIndexed?: boolean;
};

export type UniversalSearchInventoryItem = Pick<UniversalSearchDocument, "path" | "title" | "kind" | "mtime" | "size">;

export type UniversalSearchIndex = {
  schemaVersion: number;
  updatedAt: string;
  complete: boolean;
  cursor: number;
  inventoryHash: string;
  documents: UniversalSearchDocument[];
};

export type UniversalSearchOptions = {
  includeArchived?: boolean;
  includeConfigs?: boolean;
  includeAttachments?: boolean;
  softQueries?: string[];
  alwaysRunSoft?: boolean;
  alwaysRunOnDemand?: boolean;
  alwaysRunAttachments?: boolean;
  preserveRouteDuplicates?: boolean;
  includeRag?: boolean;
  cancelled?: () => boolean;
};

export type LightweightRagChunk = {
  path: string;
  title: string;
  kind: UniversalSearchDocumentKind;
  text: string;
  index: number;
};

export type StaleSessionRepair = {
  entry: SessionHistoryEntry;
  changed: boolean;
};

export type SessionEventKind =
  | "plugin.load"
  | "session.open"
  | "session.new"
  | "session.save"
  | "session.save_failed"
  | "session.status"
  | "message.add"
  | "prompt.send"
  | "model.route"
  | "prompt.error"
  | "prompt.recoverable_error"
  | "prompt.protocol_retry"
  | "prompt.final_missing"
  | "prompt.final_programmatic_convergence"
  | "prompt.final_concrete_failure_summary"
  | "tool.start"
  | "tool.finish"
  | "tool.reject";

export type SessionEvent = {
  at?: string;
  kind: SessionEventKind;
  sessionId?: string;
  title?: string;
  status?: string;
  messageId?: string;
  role?: ChatRole;
  runId?: string;
  toolStatus?: ToolRunStatus;
  summary?: string;
  detail?: string;
  path?: string;
  messageCount?: number;
  mode?: ComposerMode;
  model?: string;
  pluginVersion?: string;
};

export type SessionEventView = Required<Pick<SessionEvent, "at" | "kind">> & Omit<SessionEvent, "at" | "kind">;

export type MentionKind = "category" | "session" | "automation" | "file" | "folder" | "skill" | "action" | "command";

export type MentionSource = "file" | "folder" | "virtual";

export type ObsidianNoticeKind = "completed" | "failed" | "approval" | "stopped";

export type MentionTarget = {
  kind: MentionKind;
  source: MentionSource;
  path: string;
  title: string;
  detail: string;
  keywords: string[];
  score: number;
};

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

export type ComposerMenuItem = {
  id?: string;
  icon: string;
  label: string;
  shortLabel?: string;
  detail?: string;
  active?: boolean;
  action: () => void | Promise<void>;
};

export type ComposerCapability = "html" | "plan" | "multi-agent";

export type ObsidianCommandDefinition = {
  id?: string;
  name?: string;
  icon?: string;
  hotkeys?: Array<{ modifiers?: string[]; key?: string }>;
  callback?: () => unknown;
  checkCallback?: (checking: boolean) => boolean | void;
  editorCallback?: (editor: Editor, view: MarkdownView) => unknown;
  editorCheckCallback?: (checking: boolean, editor: Editor, view: MarkdownView) => boolean | void | Promise<boolean | void>;
};

export type ObsidianCommandApi = {
  commands?: Record<string, ObsidianCommandDefinition>;
  addCommand?: (command: ObsidianCommandDefinition) => unknown;
  executeCommandById?: (id: string) => boolean | void;
};

export type DomActionResult = {
  selector: string;
  index: number;
  tag: string;
  text: string;
  classes: string;
};

export type ObsidianCommandEntry = {
  id: string;
  name: string;
  hotkeys: string[];
  icon?: string;
};

export type ObsidianCommandMatch = ObsidianCommandEntry & {
  score: number;
};

export type ObsidianCommandResolution = {
  query: string;
  command?: ObsidianCommandEntry;
  exact: boolean;
  ambiguous: boolean;
  candidates: ObsidianCommandMatch[];
};

export type ObsidianCommandSnapshot = {
  activeFile: string;
  viewType: string;
  displayText: string;
  editorTextHash: string;
  editorCursor: string;
  modalText: string;
  activeLeafText: string;
  workspaceText: string;
  sideDockText: string;
  statusText: string;
};

export type PersonalizationGreeting = {
  text: string;
  choices: string[];
};

export type PersonalizationWeather = {
  location: string;
  summary: string;
  updatedAt: string;
};

export type PersonalizationEvidenceTier = "24h" | "72h" | "7d" | "latest" | "none";

export type PersonalizationCache = {
  schemaVersion: 4;
  updatedAt: string;
  modelUpdatedAt: string;
  timeKey: string;
  greeting: string;
  greetings: PersonalizationGreeting[];
  friendlyName: string;
  weather: PersonalizationWeather | null;
  inferredWeatherLocation: string;
  diary: string;
  autocomplete: string[];
  sourcePaths: string[];
};

export type PersonalizationUsageEntry = {
  key: string;
  text: string;
  source: "greeting" | "composer" | "editor-autocomplete";
  count: number;
  lastUsedAt: string;
  workflowHint?: ComposerWorkflowHint;
};

export type PersonalizationButtonUsageEntry = {
  key: string;
  label: string;
  commandId?: string;
  count: number;
  lastUsedAt: string;
};

export type EditorAutocompleteApplyTrigger = "button" | "tab" | "menu";

export type AutocompleteSelectionEvent = {
  text: string;
  at: string;
  index: number;
  total: number;
  trigger: EditorAutocompleteApplyTrigger;
  preloadedNextBranch: boolean;
  rotationPaused: boolean;
  reason: "first-visible" | "auto-rotated" | "manual-navigation";
  prefixHint: string;
};

export type AutocompleteUsageEvent = {
  id: string;
  shownAt: string;
  prefixHint: string;
  candidates: string[];
  used: boolean;
  selectedText?: string;
  selectedIndex?: number;
  selectedAt?: string;
  dismissedAt?: string;
  dismissedReason?: "input-changed" | "replaced" | "closed" | "disabled";
};

export type AutocompletePreferenceSignal = {
  key: string;
  label: string;
  count: number;
};

export type AutocompletePreferenceSummary = {
  schemaVersion: 3;
  updatedAt: string;
  totalSelections: number;
  totalShown: number;
  totalUsed: number;
  usageRate: number;
  unusedShown: number;
  pendingShown: number;
  preferredPosition: number;
  positionCounts: number[];
  triggerCounts: Record<EditorAutocompleteApplyTrigger, number>;
  reasonCounts: Record<AutocompleteSelectionEvent["reason"], number>;
  preloadedNextBranchCount: number;
  contentSignals: AutocompletePreferenceSignal[];
  styleSignals: AutocompletePreferenceSignal[];
  summary: string;
};

export type PersonalizationUsageLedger = {
  schemaVersion: 3;
  entries: PersonalizationUsageEntry[];
  buttonUsage: PersonalizationButtonUsageEntry[];
  approvedPriorityKeys: string[];
  reviewedPriorityKeys: string[];
  autocompleteSelections: AutocompleteSelectionEvent[];
  autocompleteUsage: AutocompleteUsageEvent[];
  autocompleteSummary: AutocompletePreferenceSummary;
};

export type OutcomeCheckResult = {
  id: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
  detail: string;
};

export type OutcomePngEvidence = {
  path: string;
  width: number;
  height: number;
  bytes: number;
  changedPixelRatio: number;
  dataUrl?: string;
};

export type OutcomeVerificationReport = {
  schemaVersion: 1;
  loopId: string;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  status: "passed" | "failed";
  scope: string;
  activeFile: string;
  viewType: string;
  displayText: string;
  visibleTextHash: string;
  visibleTextExcerpt: string;
  workspace: {
    leaves: number;
    blankLeaves: number;
    cancipLeaves: number;
    viewTypeCounts: Record<string, number>;
  };
  checks: OutcomeCheckResult[];
  evidence: {
    reportPath: string;
    png?: Omit<OutcomePngEvidence, "dataUrl">;
    reviewPath?: string;
  };
};

export type ToolRunStatus = "pending" | "executing" | "executed" | "blocked" | "failed" | "rejected";

export type ReviewGateDecision = "approved" | "correction" | "cancelled";

export type ReviewGateTerminalDecision = ReviewGateDecision | "rejected";

export type FinalReviewStatus = "complete" | "awaiting-approval" | "blocked" | "failed";

export type FinalReviewCandidate = {
  visible: string;
  status: FinalReviewStatus | "";
  failure: string;
};

export type ConcreteFailureConclusion = {
  text: string;
  choices: string[];
};

export type ToolRun = {
  id: string;
  action: CancipAction;
  summary: string;
  /**
   * Model-written one-line title for this action ("读取日记并定位今日计划").
   * Shown on the folded tool block; when absent the UI falls back to the
   * mechanical action label so old sessions keep rendering.
   */
  title?: string;
  status: ToolRunStatus;
  createdAt: string;
  startedAt?: string;
  executedAt?: string;
  result?: string;
  error?: string;
  cached?: boolean;
  reviewPath?: string;
  reviewRequired?: boolean;
  reviewStage?: "pre-execution" | "post-execution";
  autoApproved?: boolean;
  automationTaskId?: string;
  lineDeltas?: ToolRunLineDelta[];
  evidencePaths?: string[];
};

export type ContextualEditWorkbenchContext = {
  entryPath?: string;
  sourceText?: string;
  isEnabled?: () => boolean;
};

export type OfficeContextualTextAnchor = {
  contextText: string;
  startOffset: number;
  endOffset: number;
  sourceHash: string;
};

export type ContextualEditContract = {
  route: "source" | "document" | "office" | "located" | "archive" | "html" | "pdf";
  kind: ContextualEditAnchor["kind"];
  path: string;
  entryPath?: string;
  elementSelector?: string;
  startOffset?: number;
  endOffset?: number;
  expectedText: string;
  sourceHash?: string;
  sourceText?: string;
  sourceLocator?: DocumentPreviewSourceLocator;
  nearbyText?: string;
  pageIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type ContextualEditAnchor = {
  file: TFile;
  surface: HTMLElement;
  kind: "selection" | "blank-caret" | "position";
  selectedText?: string;
  startLine?: number;
  endLine?: number;
  startCh?: number;
  endCh?: number;
  cursorLine?: number;
  cursorCh?: number;
  selectionStart?: number;
  selectionEnd?: number;
  renderedOffset?: number;
  nearbyText?: string;
  pageIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  screenRect?: { left: number; top: number; width: number; height: number };
  screenRects?: Array<{ left: number; top: number; width: number; height: number }>;
  domRange?: Range;
  domElement?: Element;
  workbenchEntryPath?: string;
  workbenchSourceText?: string;
  workbenchElementSelector?: string;
  workbenchRenderedStart?: number;
  workbenchRenderedEnd?: number;
  workbenchSourceLocator?: DocumentPreviewSourceLocator;
  workbenchFrameGeometry?: boolean;
};

export type AiVaultMutationKind = "write" | "append" | "process" | "rename" | "move" | "copy" | "delete";

export type AiVaultMutationSnapshot = {
  path: string;
  text: string;
  exists: boolean;
};

export type AiVaultMutationStructure = {
  kind: "rename" | "move" | "copy";
  oldPath: string;
  newPath: string;
};

export type AiVaultMutationCaptureResult = {
  id: string;
  source: string;
  before: AiVaultMutationSnapshot[];
  operations: Array<{ path: string; kinds: AiVaultMutationKind[] }>;
  structure: AiVaultMutationStructure[];
};

export type AiVaultMutationCaptureState = {
  id: string;
  source: string;
  before: Map<string, AiVaultMutationSnapshot>;
  operations: Map<string, Set<AiVaultMutationKind>>;
  structure: AiVaultMutationStructure[];
  broadSnapshotPrimed: boolean;
  pendingOperations: number;
  lastMutationAt: number;
};

export type AiVaultMutationCaptureHandle = {
  id: string;
};

export type PendingActionSnapshot = AiVaultMutationSnapshot & {
  capturedAt: number;
};

export type AiVaultAdapterMethod = "write" | "append" | "process" | "writeBinary" | "appendBinary" | "rename" | "copy" | "remove" | "removeFile" | "rmdir" | "trashLocal" | "trashSystem";

export type AiVaultAdapterFunction = (...args: unknown[]) => Promise<unknown>;

export type StatusBarInterventionSummary = {
  unreadSessions: number;
  reviews: number;
};

export type StatusBarAttentionState = {
  unreadSessions: number;
  reviews: number;
};

export function mergeStatusBarAttentionState(a: StatusBarAttentionState, b: StatusBarAttentionState): StatusBarAttentionState {
  return {
    unreadSessions: Math.max(0, a.unreadSessions, b.unreadSessions),
    reviews: Math.max(0, a.reviews, b.reviews)
  };
}

export function sameStatusBarAttentionState(a: StatusBarAttentionState, b: StatusBarAttentionState): boolean {
  return a.unreadSessions === b.unreadSessions && a.reviews === b.reviews;
}

export type ActionHandlingResult = {
  report: string;
  runs: ToolRun[];
  executed: boolean;
};

export type ActionHandlingOptions = {
  readOnlyOnly?: boolean;
  forceApproval?: boolean;
  silentApproval?: boolean;
  /**
   * Set when the batch comes from outside the chat turn that is on screen —
   * the CLI and the Agent Bridge drive Cancip this way. An outside caller is
   * its own task, so the batch must not be measured against (or collapsed
   * into) the chat session's previous tool runs: two identical `cancip eval`
   * invocations are two intentions, not one retry. Approval gates still apply.
   */
  external?: boolean;
};

export type ActionReportSection = {
  title: string;
  summary: string;
  detail?: string;
};

export type ToolFeedbackEvent = {
  status: "executed" | "failed" | "rejected";
  summary: string;
  detail: string;
  at: string;
  action?: CancipAction | CancipAction[];
};

export type AcceptanceResultStatus = "pass" | "warn" | "fail" | "skip";

export type AcceptanceResultQuality = "high" | "ok" | "low";

export type AcceptanceCaseSlot = "B" | "V1" | "V2" | "V3";

export type AcceptanceCapabilityClass = {
  id: string;
  title: string;
  source: string;
  priority: "P0" | "P1" | "P2";
  route: string;
  expected: string[];
  variants: string[];
};

export type AcceptanceLedgerRecord = {
  schemaVersion: 1 | 2;
  at: string;
  version: string;
  acceptanceVersion: string;
  classId: string;
  classTitle: string;
  caseId: string;
  caseSlot: AcceptanceCaseSlot | "";
  prompt: string;
  promptHash: string;
  variant: string;
  expected: string;
  actual: string;
  status: AcceptanceResultStatus;
  quality: AcceptanceResultQuality;
  modelSource: string;
  model: string;
  sessionId: string;
  elapsedMs: number;
  steps: number;
  tokenUsage: TurnModelUsage | null;
  toolRuns: Array<{ status: ToolRunStatus; summary: string; action: string; detail: string }>;
  changedPaths: string[];
  evidence: string[];
  notes: string;
  reportPath: string;
};

export type ReadOnlyActionCacheEntry = {
  result: string;
  summary: string;
  createdAt: number;
  maxChars: number;
};

export type ResumableTaskState = {
  prompt: string;
  reason: "stopped" | "failed";
  at: number;
  detail?: string;
};

export type UiButtonRule = {
  id: string;
  selector: string;
  label: string;
  hidden: boolean;
  order: number;
  title?: string;
  icon?: string;
  mediaPath?: string;
  effect?: UiButtonVisualEffect;
  scope: "global" | "active" | "cancip";
  kind?: "custom";
  anchorSelector?: string;
  anchorLabel?: string;
  commandId?: string;
  commandName?: string;
  fallbackSelector?: string;
  insertPosition?: "before" | "after";
  viewType?: string;
  commandGuard?: string;
  iconGuard?: string;
  menuGroupGuard?: string;
  targetKey?: string;
  legacyTargetKey?: string;
  temporary?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type UiButtonIdentity = {
  stableId?: string;
  viewType: string;
  commandGuard?: string;
  iconGuard?: string;
  menuGroupGuard?: string;
  targetKey: string;
  legacyTargetKey: string;
  legacyTargetKeyV1: string;
};

export type UiButtonRuleWindow = Window;

export type UiButtonRuleTimer = number | { window: UiButtonRuleWindow; id: number };

export type UiButtonRuleObserverHandle = {
  disconnect(): void;
  suspend?(): void;
  resume?(): void;
};

export type LiveChangedFileEntry = {
  path: string;
  added: number;
  removed: number;
  estimated: boolean;
};

export type UiButtonVisualEffect = "pulse" | "spin" | "float" | "glow" | "bounce" | "tilt" | "press";

export type UiButtonRuleChange = "custom" | "hidden" | "order" | "title" | "icon" | "media" | "effect";

export type UiButtonRuleResetTarget = {
  id?: string;
  selector?: string;
  scope?: UiButtonRule["scope"];
  label?: string;
};

export type UiButtonWorkflowDirective = {
  phase: "inspect-buttons" | "inspect-peers" | "inspect-rules" | "apply" | "verify-apply" | "reset" | "verify-reset" | "done";
  selector?: string;
  label?: string;
  scope?: UiButtonRule["scope"];
  verificationScope?: UiButtonRule["scope"];
  ruleId?: string;
  restoreRequested?: boolean;
  isolationRequired?: boolean;
  allowedChanges?: UiButtonRuleChange[];
  expectedHidden?: boolean;
  verificationAttempt?: number;
  evidence?: string;
  targetUnresolved?: boolean;
};

export type UiButtonEvidenceContext = {
  key: string;
  region: "root" | "left" | "right" | "floating" | "menu" | "modal" | "other";
  leaf: number;
  view: string;
  file: string;
  active: boolean;
};

export type UiButtonEvidenceRow = {
  label: string;
  selector: string;
  hidden: boolean;
  context?: UiButtonEvidenceContext;
};

export type UiButtonCommandOption = {
  id: string;
  name: string;
  icon: string;
};

export type UiButtonClipboardPayload = {
  schema: "cancip-ui-button";
  version: 1;
  label: string;
  title?: string;
  icon?: string;
  mediaPath?: string;
  effect?: UiButtonVisualEffect;
  commandId: string;
  commandName?: string;
  fallbackSelector?: string;
  insertPosition?: "before" | "after";
};

export type WorkspaceTabInfo = {
  leaf: WorkspaceLeaf;
  title: string;
  viewType: string;
  path: string;
  area: "root" | "left" | "right" | "floating" | "unknown";
  pinned: boolean;
};

export type WorkspaceTabThumbnailCacheEntry = {
  dataUrl: string;
  capturedAt: number;
};

export type TtsTextSegment = {
  text: string;
  forcedBreak: boolean;
};

export type CancipAction =
  | { type: "read"; path: string; query?: string; occurrence?: number; maxChars?: number; startLine?: number; endLine?: number; aroundLine?: number }
  | { type: "write"; path: string; content?: string; chunks?: string[]; overwrite?: boolean }
  | { type: "append"; path: string; content?: string; chunks?: string[] }
  | { type: "patch"; path: string; find: string; replace: string; all?: boolean; regex?: boolean; flags?: string }
  | { type: "config"; path?: string; set?: Record<string, unknown>; unset?: string[]; replace?: boolean }
  | TodoAction
  | AutomationAction
  | { type: "mkdir"; path: string }
  | { type: "rename"; path: string; newPath: string }
  | { type: "move"; path: string; newPath: string }
  | { type: "copy"; path: string; newPath: string }
  | { type: "delete"; path: string; permanent?: boolean }
  | { type: "command"; command: string; args?: Record<string, unknown> };

export type PromptIntent = "trivial" | "informational" | "implementation";

export type SessionCleanupSchedule = "never" | "daily" | "weekly" | "monthly";

export type UiButtonEditDescriptor = {
  selector: string;
  label: string;
  scope: UiButtonRule["scope"];
  rule: UiButtonRule | null;
  target?: HTMLElement;
  viewType?: string;
  commandGuard?: string;
  iconGuard?: string;
  menuGroupGuard?: string;
  targetKey?: string;
  sortSnapshot?: UiButtonSortSnapshot;
  preloadedCommandOptions?: UiButtonCommandOption[];
};

export type UiButtonSortSnapshot = {
  source: "menu" | "popover";
  scope: UiButtonRule["scope"];
  anchorSelector: string;
  items: UiButtonSortSnapshotItem[];
};

export type UiButtonSortSnapshotItem = {
  selector: string;
  label: string;
  scope: UiButtonRule["scope"];
  command?: string;
  title?: string;
  ariaLabel?: string;
  icon?: string;
};

export type ContextEditEditorPreview = {
  id: string;
  from: number;
  markdown: string;
  path: string;
};

export type EditorAutocompleteSuggestion = {
  from: number;
  suffix: string;
  candidates: string[];
  candidateIndex: number;
  rotationPaused: boolean;
  signature: string;
  prefix: string;
  trailing: string;
  lineFrom: number;
};

export type EditorAutocompleteModelTree = {
  candidates: string[];
  branches: Map<string, string[]>;
};

export function uniqueEditorAutocompleteCandidates(values: string[], limit = 3): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.replace(/\r\n?/g, "\n");
    if (!value.trim()) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

export function rebaseEditorAutocompleteSuggestion(
  source: EditorAutocompleteSuggestion,
  candidates: string[],
  current: EditorAutocompleteSuggestion | null
): EditorAutocompleteSuggestion | null {
  if (!current || !candidates.length || current.lineFrom !== source.lineFrom) return null;
  if (current.trailing !== source.trailing) return null;
  if (!current.prefix.startsWith(source.prefix)) return null;
  const remaining = uniqueEditorAutocompleteCandidates(candidates
    .map((candidate) => `${source.prefix}${candidate}`)
    .filter((completed) => completed.startsWith(current.prefix))
    .map((completed) => completed.slice(current.prefix.length))
    .filter(Boolean), Math.max(1, candidates.length));
  if (!remaining.length) return null;
  return { ...current, suffix: remaining[0], candidates: remaining, candidateIndex: 0 };
}

export function editorAutocompleteMenuPosition(button: HTMLElement): { x: number; y: number } {
  const rect = button.getBoundingClientRect();
  return { x: Math.max(8, rect.left), y: Math.max(8, rect.bottom + 4) };
}

export interface CancipExternalContextInput {
  source?: string;
  label?: string;
  content?: string;
  url?: string;
  title?: string;
  prompt?: string;
  submit?: boolean;
  reveal?: boolean;
  focus?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MobileWebviewerApiLike {
  apiVersion?: string;
  getCapabilities?: () => unknown;
  getStatus?: () => unknown;
  getCurrentContext?: (options?: Record<string, unknown>) => Promise<unknown> | unknown;
  getSelection?: () => Promise<unknown> | unknown;
  readPage?: (input?: Record<string, unknown>) => Promise<unknown> | unknown;
  open?: (input?: Record<string, unknown>) => Promise<unknown> | unknown;
  listTabs?: () => Promise<unknown> | unknown;
  newTab?: (input?: Record<string, unknown>) => Promise<unknown> | unknown;
  switchTab?: (input: Record<string, unknown>) => Promise<unknown> | unknown;
  closeTab?: (input: Record<string, unknown>) => Promise<unknown> | unknown;
  toggleBookmark?: (input?: Record<string, unknown>) => Promise<unknown> | unknown;
  addToReadingList?: (input?: Record<string, unknown>) => Promise<unknown> | unknown;
  sendToCancip?: (input?: Record<string, unknown>) => Promise<unknown> | unknown;
}

export function bindReviewCorrectionInput(textarea: HTMLInputElement | HTMLTextAreaElement, button: HTMLButtonElement, requireText: boolean): () => void {
  const updateButtonState = () => {
    const enabled = !requireText || Boolean(textarea.value.trim());
    button.disabled = !enabled;
    button.toggleClass("is-disabled", !enabled);
  };
  textarea.addEventListener("input", updateButtonState);
  updateButtonState();
  return updateButtonState;
}

export function syncCodeBlockWrapElement(
  block: HTMLElement,
  enabled: boolean,
  enableLabel: string,
  disableLabel: string
): void {
  block.toggleClass("is-nowrap", !enabled);
  block.toggleClass("is-wrapped", enabled);
  const button = fixedCodeBlockActionScope(block).querySelector<HTMLButtonElement>(":scope > .obcc-code-wrap-toggle");
  if (!button) return;
  button.toggleClass("is-active", enabled);
  button.setAttr("aria-pressed", enabled ? "true" : "false");
  const label = enabled ? disableLabel : enableLabel;
  button.setAttr("title", label);
  button.setAttr("aria-label", label);
}

export type FixedCodeBlockActionsBinding = {
  version: number;
  frame: HTMLElement;
  actions: HTMLElement;
  sync: () => void;
  cleanup: () => void;
};

export type FixedCodeBlockElement = HTMLElement & {
  __cancipFixedCodeActionsBinding?: FixedCodeBlockActionsBinding;
};

export function fixedCodeBlockActionScope(block: HTMLElement): HTMLElement {
  const binding = (block as FixedCodeBlockElement).__cancipFixedCodeActionsBinding;
  if (binding?.actions.isConnected) return binding.actions;
  const frame = block.parentElement;
  if (frame?.hasClass("obcc-code-frame")) {
    return frame.querySelector<HTMLElement>(":scope > .obcc-code-action-layer") ?? block;
  }
  return block;
}

export function clearFixedCodeBlockActions(block: HTMLElement): void {
  const target = block as FixedCodeBlockElement;
  target.__cancipFixedCodeActionsBinding?.cleanup();
  delete target.__cancipFixedCodeActionsBinding;
  delete block.dataset.cancipFixedCodeActions;
}

export function sensitiveSettingKey(key: string): boolean {
  return /(?:api.?key|token|secret|password|credential)/i.test(key);
}

export function redactSettingsModuleValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSettingsModuleValue(item));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    sensitiveSettingKey(key) ? (child ? "configured" : "not configured") : redactSettingsModuleValue(child)
  ]));
}

export function cloneSettingsModuleValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isSensitiveLocalVersionPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.endsWith("config.json") || lower.includes(".config.")) return true;
  if (/(^|[^a-z0-9])config(?=$|[^a-z0-9])/i.test(lower)) return true;
  return isSecretBearingVaultPath(lower);
}

export function isSecretBearingVaultPath(path: string): boolean {
  const lower = normalizePath(path).toLowerCase();
  if (/(?:恢复码|备用码|密钥|凭据|令牌|密码)/.test(lower)) return true;
  return /(^|[^a-z0-9])(?:secrets?|passwords?|passwd|tokens?|credentials?|recovery|codes|api(?:keys?|[-_\s]+keys?)|private[-_\s]+keys?|ssh[-_\s]+keys?)(?=$|[^a-z0-9])/i.test(lower);
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function safeVaultFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\0/g, "").slice(0, 120) || "memory.md";
}

export function isOneClickHtmlPrompt(prompt: string): boolean {
  return /^\[(?:一键写 HTML|One-click HTML)\]\s*$/im.test(prompt);
}

export function oneClickHtmlTargetFromPrompt(prompt: string): string {
  if (!isOneClickHtmlPrompt(prompt)) return "";
  const match = prompt.match(/^(?:目标文件|Target file)\s*[：:]\s*([^\r\n]+)$/im);
  if (!match?.[1]) return "";
  const path = normalizePath(match[1].trim().replace(/\\/g, "/").replace(/^\/+/, ""));
  return /\.html?$/i.test(path) ? path : "";
}

export function oneClickHtmlFileStem(requirement: string): string {
  const withoutPath = requirement
    .replace(/[`"'“”‘’][^`"'“”‘’\r\n]+\.html?[`"'“”‘’]?/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .trim();
  const firstIdea = (withoutPath.split(/[\r\n，,。！？!?；;]/).find((part) => part.trim()) ?? withoutPath)
    .replace(/^(?:请|帮我|给我|麻烦|可以)?\s*(?:做|制作|创建|生成|写|设计|实现|build|create|make|design)\s*(?:一个|一份|个|an?\s+)?/i, "")
    .replace(/(?:交互式?|可交互的?)?\s*(?:HTML|网页|页面|web\s*page)\s*$/i, "")
    .trim();
  const safe = safeVaultFileName(firstIdea || "交互页面")
    .replace(/\.html?$/i, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return (safe && safe !== "memory.md" ? safe : "交互页面").slice(0, 48);
}

export function buildOneClickHtmlPrompt(requirement: string, path: string, chinese: boolean): string {
  const normalizedRequirement = trimContext(requirement.trim(), 6000);
  return chinese
    ? [`[一键写 HTML]`, `目标文件：${path}`, "需求：", normalizedRequirement].join("\n")
    : [`[One-click HTML]`, `Target file: ${path}`, "Requirements:", normalizedRequirement].join("\n");
}

export function interactiveHtmlValidationIssue(content: string): string {
  const source = content.trim();
  if (!/^<!doctype\s+html\b/i.test(source)) return "content must start with <!doctype html>";
  if (!/<html\b[^>]*>[\s\S]*<\/html>\s*$/i.test(source)) return "missing complete html element";
  if (!/<head\b[^>]*>[\s\S]*<\/head>/i.test(source) || !/<body\b[^>]*>[\s\S]*<\/body>/i.test(source)) {
    return "missing complete head or body";
  }
  if (/```(?:html)?/i.test(source)) return "remove Markdown code fences";
  const inlineScript = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .some((match) => !/\bsrc\s*=/.test(match[1] ?? "") && Boolean(match[2]?.trim()));
  const nativeInteraction = /<details\b|\bcontenteditable\s*=|\bon(?:click|input|change|submit|pointerdown)\s*=/i.test(source);
  if (!inlineScript && !nativeInteraction) return "missing working inline interaction";
  return "";
}

export function outcomeElementRect(element: HTMLElement): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

export function outcomeElementVisible(element: HTMLElement): boolean {
  const win = element.ownerDocument.defaultView;
  const rect = element.getBoundingClientRect();
  if (!win || rect.width <= 0 || rect.height <= 0) return false;
  const style = win.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0.01) return false;
  return rect.right > 0 && rect.bottom > 0 && rect.left < win.innerWidth && rect.top < win.innerHeight;
}

export function outcomeElementWithinViewport(element: HTMLElement): boolean {
  const win = element.ownerDocument.defaultView;
  if (!win) return false;
  const rect = element.getBoundingClientRect();
  return rect.left >= -1 && rect.top >= -1 && rect.right <= win.innerWidth + 1 && rect.bottom <= win.innerHeight + 1;
}

export function outcomeElementsOverlap(first: HTMLElement, second: HTMLElement): boolean {
  if (!outcomeElementVisible(first) || !outcomeElementVisible(second)) return false;
  const a = first.getBoundingClientRect();
  const b = second.getBoundingClientRect();
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
}

export function outcomeJsonPathValue(value: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").map((item) => item.trim()).filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)];
    } else if (isRecord(current)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function outcomeValuesEqual(first: unknown, second: unknown): boolean {
  return JSON.stringify(canonicalJsonValue(first)) === JSON.stringify(canonicalJsonValue(second));
}

export function outcomeCanvasChangedPixelRatio(canvas: HTMLCanvasElement): number {
  try {
    const sample = createDetachedElement(canvas.ownerDocument, "canvas");
    sample.width = 24;
    sample.height = 24;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const base = [pixels[0], pixels[1], pixels[2], pixels[3]];
    let changed = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const delta = Math.abs(pixels[index] - base[0])
        + Math.abs(pixels[index + 1] - base[1])
        + Math.abs(pixels[index + 2] - base[2])
        + Math.abs(pixels[index + 3] - base[3]);
      if (delta > 24) changed += 1;
    }
    return Number((changed / (pixels.length / 4)).toFixed(4));
  } catch {
    return 0;
  }
}

export function normalizeImportedMarkdown(content: string): string {
  return `${content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\0/g, "").trimEnd()}\n`;
}

export function normalizeExternalPath(path: string): string {
  let normalized = path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized === "~" || normalized.startsWith("~/")) {
    const home = getExternalHomeDirectory();
    if (home) normalized = normalized === "~" ? home : `${home}/${normalized.slice(2)}`;
  }
  return normalized;
}

export function getExternalHomeDirectory(): string | null {
  try {
    const requireLike = (window as unknown as { require?: (name: string) => unknown }).require;
    if (typeof requireLike !== "function") return null;
    const os = requireLike("os") as { homedir?: () => string };
    const home = typeof os.homedir === "function" ? os.homedir() : "";
    return home.trim().replace(/\\/g, "/").replace(/\/+$/, "") || null;
  } catch {
    return null;
  }
}

export function joinExternalPath(base: string, child: string): string {
  const normalizedBase = normalizeExternalPath(base);
  const normalizedChild = child.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalizedBase ? `${normalizedBase}/${normalizedChild}` : normalizedChild;
}

export function getDesktopFs(): DesktopFsLike | null {
  try {
    if (Platform.isMobileApp) return null;
    const requireLike = (window as unknown as { require?: (name: string) => unknown }).require;
    if (typeof requireLike !== "function") return null;
    const fs = requireLike("fs/promises") as Partial<DesktopFsLike>;
    if (typeof fs.readFile !== "function" || typeof fs.stat !== "function" || typeof fs.readdir !== "function") return null;
    return fs as DesktopFsLike;
  } catch {
    return null;
  }
}

export async function desktopPathExists(fs: DesktopFsLike, path: string, kind?: "file" | "directory"): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    if (kind === "file") return stat.isFile();
    if (kind === "directory") return stat.isDirectory();
    return true;
  } catch {
    return false;
  }
}

export async function listDesktopSkillFiles(fs: DesktopFsLike, root: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  const stack = [normalizeExternalPath(root)];
  while (stack.length && files.length < maxFiles) {
    const folder = stack.pop();
    if (!folder) continue;
    let entries: Array<string | { name: string; isFile(): boolean; isDirectory(): boolean }>;
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (!name || name === "node_modules" || name === ".git") continue;
      const child = joinExternalPath(folder, name);
      const isFile = typeof entry === "string" ? await desktopPathExists(fs, child, "file") : entry.isFile();
      const isDirectory = typeof entry === "string" ? await desktopPathExists(fs, child, "directory") : entry.isDirectory();
      if (isFile && name === "SKILL.md") {
        files.push(child);
        if (files.length >= maxFiles) break;
      } else if (isDirectory) {
        stack.push(child);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export async function listDesktopFilesByName(fs: DesktopFsLike, root: string, fileName: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  const stack = [normalizeExternalPath(root)];
  while (stack.length && files.length < maxFiles) {
    const folder = stack.pop();
    if (!folder) continue;
    let entries: Array<string | { name: string; isFile(): boolean; isDirectory(): boolean }>;
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = typeof entry === "string" ? entry : entry.name;
      if (!name || name === "node_modules" || name === ".git") continue;
      const child = joinExternalPath(folder, name);
      const isFile = typeof entry === "string" ? await desktopPathExists(fs, child, "file") : entry.isFile();
      const isDirectory = typeof entry === "string" ? await desktopPathExists(fs, child, "directory") : entry.isDirectory();
      if (isFile && name === fileName) {
        files.push(child);
        if (files.length >= maxFiles) break;
      } else if (isDirectory) {
        stack.push(child);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function normalizeSkillNameForImport(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildCodexSkillPackReadme(skillFiles: string[], skipped: string[]): string {
  return [
    "# Desktop Skill Pack for Cancip",
    "",
    "This folder contains selected desktop/local-agent Skill instructions copied into the Vault so Cancip can discover them on desktop and mobile.",
    "",
    "Use these on demand through `cancip.skills.list`, `cancip.skills.read`, `cancip.skills.refresh`, and `cancip.tools.index`. Do not inject the full pack into every prompt.",
    "",
    "## Installed Skills",
    ...(skillFiles.length ? skillFiles.map((path) => `- [[${path.replace(/\.md$/i, "")}]]`) : ["- none"]),
    "",
    "## Mobile caveat",
    "Some imported skills describe desktop tools, CLIs, browser automation, or runtime plugins. On Android, treat those as route instructions and use Cancip native commands, Obsidian commands, attachment parsers, GitHub API, or a desktop bridge when required.",
    "",
    "## Skipped sources",
    ...(skipped.length ? skipped.slice(0, 60).map((item) => `- ${item}`) : ["- none"])
  ].join("\n");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function makeMemorySnippet(content: string, tokens: string[], maxChars: number): string {
  const normalized = content.replace(/\0/g, "").trim();
  if (!tokens.length) return trimContext(normalized, maxChars);
  const lower = normalized.toLowerCase();
  const hit = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (hit === undefined) return trimContext(normalized, maxChars);
  const start = Math.max(0, hit - Math.floor(maxChars / 3));
  return trimContext(normalized.slice(start, start + maxChars), maxChars);
}

export function selectRelevantExperience(raw: string, prompt: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const entries = trimmed
    .split(/\n(?=## \d{4}-\d{2}-\d{2}T)/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length <= 1) return trimmed;
  const header = entries[0].startsWith("# ") ? entries.shift() : "# Cancip Experience";
  const tokens = tokenize(prompt).filter((token) => token.length >= 2).slice(0, 12);
  const relevant = tokens.length
    ? entries.filter((entry) => {
      const lower = entry.toLowerCase();
      return tokens.some((token) => lower.includes(token));
    })
    : [];
  if (!relevant.length) return "";
  const selected = relevant.slice(-3);
  return [header, ...selected].filter(Boolean).join("\n\n");
}

export function scoreAutomationSessionChoice(choice: AutomationSessionChoice, query: string): number {
  const title = choice.title.toLocaleLowerCase();
  const compactTitle = title.replace(/\s+/g, "");
  const compactQuery = query.toLocaleLowerCase().replace(/\s+/g, "");
  const queryTokens = tokenize(query);
  const titleTokens = new Set(tokenize(choice.title));
  let score = choice.archived ? -12 : 0;
  if (compactTitle && compactQuery.includes(compactTitle)) score += 80;
  if (compactQuery && compactTitle.includes(compactQuery.slice(0, Math.min(compactQuery.length, 40)))) score += 45;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += token.length > 1 ? 18 : 7;
    else if (title.includes(token)) score += token.length > 1 ? 8 : 3;
  }
  return score;
}

export function formatAutomationTemplates(templates: AutomationTemplate[]): string {
  return templates
    .map((template) => {
      const mode = template.command ? `command:${template.command}` : "prompt";
      return `- ${template.id}: ${template.title} [${template.schedule}, ${mode}] ${template.description}`;
    })
    .join("\n");
}

export function newsBriefPeriodLabel(period: NewsBriefPeriod): string {
  return period === "evening" ? "晚间" : "早间";
}

export function normalizeKnowledgeWikiText(value: unknown, maxChars: number): string {
  return trimContext(String(value ?? "")
    .replace(/<!--|-->/g, "")
    .replace(/\s+/g, " ")
    .trim(), maxChars);
}

export function normalizeKnowledgeWikiSource(value: unknown): string {
  const source = normalizePath(String(value ?? "").trim().replace(/^[-*]\s*/, ""));
  if (!source || source.includes("..") || /^[a-z][a-z\d+.-]*:\/\//i.test(source)) return "";
  return source.slice(0, 180);
}

export function normalizeKnowledgeWikiCard(raw: unknown, updatedAt = new Date().toISOString()): KnowledgeWikiCard | null {
  if (!isRecord(raw)) return null;
  const title = normalizeKnowledgeWikiText(raw.title, 90);
  const topic = normalizeKnowledgeWikiText(raw.topic, 50) || "未分类";
  const summary = normalizeKnowledgeWikiText(raw.summary, 360);
  if (title.length < 2 || summary.length < 12) return null;
  const facts = uniqueStrings((Array.isArray(raw.facts) ? raw.facts : [])
    .map((item) => normalizeKnowledgeWikiText(item, 180))
    .filter((item) => item.length >= 4))
    .slice(0, 4);
  const sources = uniqueStrings((Array.isArray(raw.sources) ? raw.sources : [])
    .map(normalizeKnowledgeWikiSource)
    .filter(Boolean))
    .slice(0, 5);
  const rawKey = normalizeKnowledgeWikiText(raw.key, 80);
  const key = /^[a-z\d_-]{3,80}$/i.test(rawKey)
    ? rawKey.toLowerCase()
    : stableTextHash(`${topic}\n${title}`);
  const confidence = raw.confidence === "high" ? "high" : "medium";
  return { key, topic, title, summary, facts, sources, confidence, updatedAt };
}

export function parseKnowledgeWikiCards(content: string): KnowledgeWikiCard[] {
  const cards: KnowledgeWikiCard[] = [];
  for (const match of content.matchAll(/<!-- cancip-knowledge-card:([^\s]+) -->/g)) {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1])) as unknown;
      const card = normalizeKnowledgeWikiCard(parsed, typeof (parsed as Record<string, unknown>)?.updatedAt === "string"
        ? String((parsed as Record<string, unknown>).updatedAt)
        : new Date().toISOString());
      if (card) cards.push(card);
    } catch {
      // Ignore malformed machine cards and preserve the surrounding Wiki text.
    }
  }
  return cards;
}

export function buildTranslateCurrentPagePrompt(input: CurrentPageTranslationCapture, targetLanguage: string): string {
  const source = [input.label, input.path].filter(Boolean).join(" · ") || input.source;
  return [
    `Translate the current page content below into ${targetLanguage}.`,
    "Requirements: preserve Markdown structure, heading levels, lists, tables, links, code blocks, shortcuts, paths, product names, and key terms; do not modify the source file; reply only with the translated text in chat. If the source is already in the target language, polish it into clearer natural wording.",
    `Source: ${source}`,
    "",
    "````markdown",
    input.text,
    "````"
  ].join("\n");
}

export function visiblePageTranslationSystemPrompt(): string {
  return [
    "You are Cancip's UI translation engine.",
    "Return JSON only. No markdown, no commentary.",
    "Translate concise visible UI labels into the requested target language.",
    "Keep product names, file paths, keyboard shortcuts, command IDs, numbers, and placeholders intact when appropriate.",
    "Output exactly: {\"translations\":[{\"id\":1,\"text\":\"...\"}]}."
  ].join("\n");
}

export function buildVisiblePageTranslationPrompt(targets: PageTranslationTarget[], targetLanguage: string): string {
  const items = targets.map((target) => ({ id: target.id, text: target.text }));
  return [
    `Target language: ${targetLanguage}`,
    "Translate these currently visible Obsidian/Cancip page labels. Keep each id unchanged.",
    JSON.stringify({ items })
  ].join("\n");
}

export function parseVisiblePageTranslations(answer: string): Map<number, string> {
  const parsed = parseFirstJsonObject(answer);
  const root = isRecord(parsed) ? parsed : null;
  const rawItems = Array.isArray(root?.translations) ? root.translations : Array.isArray(parsed) ? parsed : [];
  const result = new Map<number, string>();
  for (const item of rawItems) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "number" ? item.id : Number(item.id);
    const text = typeof item.text === "string" ? item.text : typeof item.translation === "string" ? item.translation : "";
    if (Number.isFinite(id) && text.trim()) result.set(id, text.trim());
  }
  return result;
}

export function collectCurrentPageTranslationTargets(app: App, limit: number): PageTranslationTarget[] {
  const root = currentPageTranslationRoot(app);
  if (!root) return [];
  const targets: PageTranslationTarget[] = [];
  const addTarget = (text: string, apply: (translated: string) => void) => {
    const normalized = normalizeTranslatableUiText(text);
    if (!normalized || targets.length >= limit) return;
    targets.push({ id: targets.length + 1, text: normalized, apply });
  };
  const walker = activeDocument.createTreeWalker(root, 4, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !isTranslatableUiTextElement(parent)) return 2;
      const normalized = normalizeTranslatableUiText(node.textContent ?? "");
      return normalized ? 1 : 2;
    }
  });
  for (let node = walker.nextNode(); node && targets.length < limit; node = walker.nextNode()) {
    const textNode = node as Text;
    addTarget(textNode.textContent ?? "", (translated) => {
      textNode.textContent = preserveUiTextOuterSpacing(textNode.textContent ?? "", translated);
    });
  }
  const attrElements = Array.from(root.querySelectorAll<HTMLElement>("button, [aria-label], [title], input, textarea"));
  for (const el of attrElements) {
    if (targets.length >= limit) break;
    if (!isTranslatableUiTextElement(el)) continue;
    for (const attr of ["aria-label", "title", "placeholder"] as const) {
      const value = el.getAttribute(attr) ?? "";
      addTarget(value, (translated) => el.setAttribute(attr, translated));
      if (targets.length >= limit) break;
    }
  }
  return targets;
}

export function currentPageTranslationRoot(app: App): HTMLElement | null {
  const modalRoots = Array.from(activeDocument.querySelectorAll<HTMLElement>(".modal.mod-settings, .modal:not(.obcc-button-edit-modal), .modal"))
    .filter((el) => isVisibleElement(el) && !el.closest(".obcc-button-edit-bubble, .obcc-selection-send-bubble, .obcc-ui-sort-overlay"));
  if (modalRoots.length) return modalRoots[modalRoots.length - 1];
  return (app.workspace.activeLeaf ?? app.workspace.getMostRecentLeaf())?.view?.containerEl ?? activeDocument.body;
}

export function normalizeTranslatableUiText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length > 120) return "";
  if (/^[\d\s()[\]{}:：.,，。/\\|+\-=*_#]+$/.test(normalized)) return "";
  if (/^(OK|✓|×|…|\.{1,3})$/i.test(normalized)) return "";
  return normalized;
}

export function preserveUiTextOuterSpacing(original: string, translated: string): string {
  const start = original.match(/^\s*/)?.[0] ?? "";
  const end = original.match(/\s*$/)?.[0] ?? "";
  return `${start}${translated}${end}`;
}

export function isTranslatableUiTextElement(el: HTMLElement): boolean {
  if (!isVisibleElement(el)) return false;
  if (el.closest("script, style, svg, canvas, textarea, select, option, .cm-editor, .markdown-source-view, .obcc-button-edit-bubble, .obcc-selection-send-bubble, .obcc-ui-sort-overlay, .obcc-ui-sort-snapshot-stage")) return false;
  if (el.closest(".obcc-chat-messages, .obcc-message, .obcc-process-details")) return false;
  return true;
}

export function isVisibleElement(el: HTMLElement): boolean {
  const view = activeDocument.defaultView ?? window;
  const style = view.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function formatVaultDailyReportItems(items: VaultDailyReportItem[], limit: number): string {
  if (!items.length) return "- none";
  return items
    .slice(0, limit)
    .map((item) => {
      const excerpt = item.excerpt ? `\n  excerpt: ${item.excerpt.replace(/\n+/g, " ")}` : "";
      return `- ${item.path} (${formatFileSize(item.size)}, ${new Date(item.mtime).toISOString()}) reason: ${item.reason}${excerpt}`;
    })
    .join("\n");
}

export function formatVaultDailyUnresolvedLinkIssues(items: VaultDailyUnresolvedLinkIssue[], limit: number): string {
  if (!items.length) return "- none";
  return items
    .slice(0, limit)
    .map((item) => {
      const count = item.count > 1 ? ` x${item.count}` : "";
      return `- ${item.source} -> ${item.target}${count}`;
    })
    .join("\n");
}

export function indentBlock(content: string, indent = "  "): string {
  return content.split(/\r?\n/).map((line) => `${indent}${line}`).join("\n");
}

export function vaultLinkBase(link: string): string {
  return link.split("#", 1)[0]?.trim().replace(/\.md$/i, "") ?? "";
}

export function formatVaultCurationCandidates(items: VaultCurationCandidate[], limit: number): string {
  if (!items.length) return "- none";
  return items
    .slice(0, limit)
    .map((item) => {
      const title = item.title ? ` title: ${item.title.replace(/\n+/g, " ").slice(0, 120)}` : "";
      const tags = item.tags.length ? ` tags: ${item.tags.map((tag) => `#${tag}`).join(" ")}` : " tags: none";
      const reasons = item.curationReasons.length ? ` reasons: ${item.curationReasons.join("; ")}` : "";
      const decision = ` decision: ${item.decision.action} allowedActions=${item.decision.allowedActions.join(",") || "none"}`;
      const composition = `\n  composition: chars=${item.composition.characters} lines=${item.composition.lines} headings=${item.composition.headings} lists=${item.composition.listItems} tasks=${item.composition.tasks} tables=${item.composition.tables} codeBlocks=${item.composition.codeBlocks} quotes=${item.composition.quotes} embeds=${item.composition.embeds}`;
      const linkRelations = item.linkRelations.length
        ? `\n  linkRelations:\n${indentBlock(formatVaultCurationLinkRelations(item.linkRelations), "    ")}`
        : "\n  linkRelations: none";
      const content = item.content ? `\n  content:\n${indentBlock(item.content, "    ")}` : "";
      const excerpt = item.excerpt ? `\n  excerpt: ${item.excerpt.replace(/\n+/g, " ")}` : "";
      return `- ${item.path} (${formatFileSize(item.size)}, created ${new Date(item.ctime).toISOString()}, modified ${new Date(item.mtime).toISOString()}) reason: ${item.reason}${reasons}${decision}${title}${tags} links: out=${item.outLinks} backlinks=${item.backlinks}${composition}${linkRelations}${excerpt}${content}`;
    })
    .join("\n");
}

export function formatVaultCurationLinkRelations(relations: VaultCurationLinkRelation[]): string {
  return relations
    .map((relation) => {
      const count = relation.count > 1 ? ` x${relation.count}` : "";
      const evidence = relation.evidence ? ` evidence: ${relation.evidence.replace(/\n+/g, " ")}` : "";
      return `- ${relation.direction}: ${relation.target}${count}; ${relation.relationHint}${evidence}`;
    })
    .join("\n");
}

export function isVaultCurationInboxLikePath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return /(^|\/)(inbox|收件箱|临时|暂存|草稿|drafts?|tmp|temp|未整理|待整理)(\/|$)/i.test(normalized);
}

export function isVaultCurationDateLikeBasename(basename: string): boolean {
  const normalized = basename.trim();
  return /^\d{4}[-_.]\d{1,2}[-_.]\d{1,2}(?:[ -_.].*)?$/.test(normalized)
    || /^\d{8}(?:[-_. ]?\d{4,6})?$/.test(normalized);
}

export function vaultCurationProtectionReasons(input: {
  path: string;
  content: string;
  backlinks: number;
  vaultFileCount: number;
  frontmatter?: Record<string, unknown>;
}): string[] {
  const protections: string[] = [];
  const path = normalizePath(input.path.replace(/\\/g, "/"));
  const content = String(input.content ?? "");
  const frontmatter = input.frontmatter ?? {};
  const curationFlag = frontmatter.cancip_curation ?? frontmatter.cancipCuration ?? frontmatter.auto_curation ?? frontmatter.autoCuration;
  const explicitOptOut = curationFlag === false
    || (typeof curationFlag === "string" && /^(?:false|off|no|skip|disabled)$/i.test(curationFlag.trim()))
    || /(^|\n)\s*(?:<!--\s*cancip[- ]curation\s*:\s*(?:off|skip|false)\s*-->|(?:这(?:个|份|篇)?(?:文件|笔记)?\s*)?(?:不需要|无需|不要)(?:自动)?整理(?:此|本)?(?:文件|笔记)?[。.!]?|(?:do not|don't|no need to)\s+(?:auto[- ]?)?(?:organize|curate)(?:\s+this\s+(?:file|note))?)[ \t]*(?=\n|$)/im.test(content.slice(0, 4000));
  if (explicitOptOut) protections.push("explicit user opt-out from curation");
  if (/(^|\/)(templates?|模板|模板库|模版|模版库)(\/|$)/i.test(path)) protections.push("template-like path");
  if (/<%[\s\S]{0,1200}?%>|\{\{\s*(?:title|date|time|name|content|cursor|selection|value(?::[^}]*)?|[^{}\n]{1,60})\s*\}\}|\btp\.(?:file|date|system|web|config)\b/i.test(content)) {
    protections.push("template syntax or placeholders");
  }
  const frequentThreshold = vaultCurationFrequentBacklinkThreshold(input.vaultFileCount);
  if (input.backlinks >= frequentThreshold) protections.push(`frequently referenced (${input.backlinks} backlinks; threshold ${frequentThreshold})`);

  const pluginFrontmatterKeys = ["excalidraw-plugin", "kanban-plugin", "database-plugin", "meta-bind", "obsidianUIMode"];
  if (pluginFrontmatterKeys.some((key) => Object.prototype.hasOwnProperty.call(frontmatter, key))
    || /(^|\n)\s*```(?:dataview|dataviewjs|tasks|runjs|button|meta-bind|base)\b|(^|\n)# Excalidraw Data\b|%%\s*(?:Excalidraw|notedraw|spaced-repetition)\b/i.test(content)) {
    protections.push("plugin-owned or plugin-syntax-heavy content");
  }

  const generatedKeys = ["generated", "generator", "generated_by", "generated-by", "auto_generated", "auto-generated"];
  const generatedMetadata = generatedKeys.some((key) => {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) return false;
    const value = frontmatter[key];
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    const text = flattenKeywordValue(value).join(" ").trim();
    return Boolean(text) && !/^(?:0|false|no)$/i.test(text);
  });
  if (generatedMetadata || /<!--\s*(?:auto[- ]?generated|generated file|do not edit)\b|\bDO NOT EDIT\b/i.test(content)) {
    protections.push("generated or do-not-edit content");
  }
  return uniqueStrings(protections);
}

export function vaultCurationFrequentBacklinkThreshold(vaultFileCount: number): number {
  const proportional = Math.ceil(Math.max(0, vaultFileCount) * 0.01);
  return Math.max(6, Math.min(24, proportional));
}

export function cancipCurationHasMarkdownDefect(content: string): boolean {
  const text = content.replace(/\r\n?/g, "\n");
  const fenceCount = (text.match(/(^|\n)(```|~~~)/g) ?? []).length;
  if (fenceCount % 2 !== 0) return true;
  if (/(^|\n)\s{0,3}#{1,6}[^#\s]/.test(text)) return true;
  if (/(^|\n)\s*[-*+]\S/.test(text)) return true;
  if (/(^|\n)\s*\d+[.)]\S/.test(text)) return true;
  if (/\]\([^)]+$/.test(text)) return true;
  return false;
}

