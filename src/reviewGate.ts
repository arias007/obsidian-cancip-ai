import { type DataAdapter, normalizePath } from "obsidian";

export type ReviewGateStructureKind = "rename" | "move" | "merge" | "split" | "folder";

export type ReviewGateStructureChange = {
  kind: ReviewGateStructureKind;
  old_path: string;
  new_path: string;
  reason: string;
  related_files?: string[];
};

export type ReviewGateLinks = {
  added?: string[];
  removed?: string[];
  current?: string[];
  suggested?: string[];
};

export type ReviewGateManifestItem = {
  path: string;
  old_text: string;
  new_text: string;
  changes: string[];
  links: ReviewGateLinks;
  structure: ReviewGateStructureChange[];
};

export type ReviewGateManifest = {
  schemaVersion: number;
  title: string;
  vault_label: string;
  folder: string;
  generated_at: string;
  source: string;
  items: ReviewGateManifestItem[];
};

export type ReviewGateBuildOptions = {
  title?: string;
  vaultLabel?: string;
  outputRoot: string;
  output?: string;
  paths?: unknown;
  scope?: unknown;
  items?: unknown;
  maxFiles: number;
  maxFileChars: number;
};

export type ReviewGateBuildResult = {
  outputDir: string;
  indexPath: string;
  manifestPath: string;
  summaryPath: string;
  itemCount: number;
  changedCount: number;
  structureCount: number;
};

type PreparedReviewItem = {
  index: number;
  path: string;
  page: string;
  proposed: string;
  added: number;
  removed: number;
  delta: number;
  changed: boolean;
  structure: ReviewGateStructureChange[];
  raw: ReviewGateManifestItem;
};

const STRUCTURE_LABELS: Record<ReviewGateStructureKind, string> = {
  rename: "rename",
  move: "move",
  merge: "merge",
  split: "split",
  folder: "folder"
};

const TEXT_EXTENSIONS = new Set(["md", "txt", "json", "jsonl", "csv", "ts", "tsx", "js", "jsx", "css", "html", "xml", "yml", "yaml", "base", "canvas"]);

export async function buildObReviewGatePackage(adapter: DataAdapter, options: ReviewGateBuildOptions): Promise<ReviewGateBuildResult> {
  const outputDir = reviewOutputDir(options);
  await ensureFolder(adapter, outputDir);
  await ensureFolder(adapter, `${outputDir}/proposed`);

  const manifest = await buildManifest(adapter, options, outputDir);
  const prepared: PreparedReviewItem[] = [];
  for (let index = 0; index < manifest.items.length; index += 1) {
    const item = manifest.items[index];
    const preparedItem = await writeReviewPage(adapter, outputDir, index + 1, item);
    prepared.push(preparedItem);
  }

  const summary = makeSummary(manifest, prepared);
  const manifestPath = `${outputDir}/manifest.json`;
  const summaryPath = `${outputDir}/summary.json`;
  const normalizedPath = `${outputDir}/review-manifest.normalized.json`;
  const indexPath = `${outputDir}/00-OB-review-index.html`;
  await adapter.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await adapter.write(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await adapter.write(normalizedPath, `${JSON.stringify(prepared, null, 2)}\n`);
  await adapter.write(indexPath, indexHtml(manifest, prepared));

  return {
    outputDir,
    indexPath,
    manifestPath,
    summaryPath,
    itemCount: prepared.length,
    changedCount: prepared.filter((item) => item.changed).length,
    structureCount: prepared.reduce((sum, item) => sum + item.structure.length, 0)
  };
}

export async function listReviewGatePackages(adapter: DataAdapter, outputRoot: string, limit = 12): Promise<string[]> {
  const root = safeVaultPath(outputRoot);
  try {
    const listing = await adapter.list(root);
    const folders = listing.folders
      .map((folder) => normalizePath(folder))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, Math.max(1, Math.min(50, limit)));
    const results: string[] = [];
    for (const folder of folders) {
      const indexPath = `${folder}/00-OB-review-index.html`;
      if (await adapter.exists(indexPath)) results.push(indexPath);
    }
    return results;
  } catch {
    return [];
  }
}

export function formatReviewGateResult(result: ReviewGateBuildResult): string {
  return [
    `index: ${result.indexPath}`,
    `manifest: ${result.manifestPath}`,
    `summary: ${result.summaryPath}`,
    `items: ${result.itemCount}`,
    `changed: ${result.changedCount}`,
    `structure: ${result.structureCount}`
  ].join("\n");
}

async function buildManifest(adapter: DataAdapter, options: ReviewGateBuildOptions, outputDir: string): Promise<ReviewGateManifest> {
  const title = cleanText(options.title) || "Cancip OB Review Gate";
  const itemsFromArgs = await itemsFromInput(adapter, options.items, options.maxFileChars);
  const paths = normalizeScopePaths(options.paths, options.scope);
  const itemsFromScope = itemsFromArgs.length ? [] : await scanScopeItems(adapter, paths, options.maxFiles, options.maxFileChars);
  const items = [...itemsFromArgs, ...itemsFromScope].slice(0, options.maxFiles);
  if (!items.length) {
    throw new Error("No reviewable files or manifest items found.");
  }
  return {
    schemaVersion: 1,
    title,
    vault_label: cleanText(options.vaultLabel) || "note",
    folder: outputDir,
    generated_at: new Date().toISOString(),
    source: "cancip.programmatic.reviewGate",
    items
  };
}

async function itemsFromInput(adapter: DataAdapter, rawItems: unknown, maxFileChars: number): Promise<ReviewGateManifestItem[]> {
  if (!Array.isArray(rawItems)) return [];
  const items: ReviewGateManifestItem[] = [];
  for (const raw of rawItems) {
    if (typeof raw === "string") {
      const path = safeVaultPath(raw);
      const content = await readTextIfExists(adapter, path, maxFileChars);
      if (content !== null) items.push(scanItem(path, content));
      continue;
    }
    if (!isRecord(raw)) continue;
    const rawPath = typeof raw.path === "string" ? raw.path : "";
    if (!rawPath.trim()) continue;
    const path = safeVaultPath(rawPath);
    const current = await readTextIfExists(adapter, path, maxFileChars);
    const oldText = typeof raw.old_text === "string" ? raw.old_text : typeof raw.oldText === "string" ? raw.oldText : current ?? "";
    const newText = typeof raw.new_text === "string" ? raw.new_text : typeof raw.newText === "string" ? raw.newText : oldText;
    items.push({
      path,
      old_text: truncateText(oldText, maxFileChars),
      new_text: truncateText(newText, maxFileChars),
      changes: normalizeStringArray(raw.changes),
      links: normalizeLinks(raw.links),
      structure: normalizeStructure(raw.structure ?? raw.structure_changes, path)
    });
  }
  return items;
}

async function scanScopeItems(adapter: DataAdapter, paths: string[], maxFiles: number, maxFileChars: number): Promise<ReviewGateManifestItem[]> {
  const targetPaths = paths.length ? paths : [""];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const path of targetPaths) {
    const safe = path ? safeVaultPath(path) : "";
    const stat = safe ? await adapter.stat(safe).catch(() => null) : null;
    if (!safe || stat?.type === "folder") {
      const listed = await listTextFiles(adapter, safe, maxFiles - files.length, Boolean(safe && safe.startsWith(".")));
      for (const file of listed) {
        if (!seen.has(file)) {
          seen.add(file);
          files.push(file);
        }
      }
    } else if (stat?.type === "file" && isReviewGateCandidate(safe, true) && !seen.has(safe)) {
      seen.add(safe);
      files.push(safe);
    }
    if (files.length >= maxFiles) break;
  }
  const items: ReviewGateManifestItem[] = [];
  for (const path of files.slice(0, maxFiles)) {
    const content = await readTextIfExists(adapter, path, maxFileChars);
    if (content !== null) items.push(scanItem(path, content));
  }
  return items;
}

function scanItem(path: string, content: string): ReviewGateManifestItem {
  return {
    path,
    old_text: content,
    new_text: content,
    changes: [],
    links: { current: extractWikiLinks(content) },
    structure: []
  };
}

async function listTextFiles(adapter: DataAdapter, folder: string, limit: number, includeHidden = false): Promise<string[]> {
  if (limit <= 0) return [];
  let listing: { files: string[]; folders: string[] };
  try {
    listing = await adapter.list(folder);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const file of listing.files.map((item) => normalizePath(item)).sort((a, b) => a.localeCompare(b))) {
    if (results.length >= limit) break;
    if (isReviewGateCandidate(file, includeHidden)) results.push(file);
  }
  for (const child of listing.folders.map((item) => normalizePath(item)).sort((a, b) => a.localeCompare(b))) {
    if (results.length >= limit) break;
    if (!includeHidden && basename(child).startsWith(".")) continue;
    if (isReviewGateExcludedFolder(child)) continue;
    const childResults = await listTextFiles(adapter, child, limit - results.length, includeHidden);
    results.push(...childResults);
  }
  return results;
}

async function readTextIfExists(adapter: DataAdapter, path: string, maxFileChars: number): Promise<string | null> {
  if (!isReviewGateCandidate(path, true)) return null;
  try {
    const stat = await adapter.stat(path);
    if (!stat || stat.type !== "file") return null;
    const text = await adapter.read(path);
    return truncateText(text.replace(/\0/g, ""), maxFileChars);
  } catch {
    return null;
  }
}

async function writeReviewPage(adapter: DataAdapter, outputDir: string, index: number, item: ReviewGateManifestItem): Promise<PreparedReviewItem> {
  const page = `${String(index).padStart(3, "0")}-${slug(basename(item.path))}.html`;
  const proposed = `proposed/${String(index).padStart(3, "0")}-${slug(basename(item.path))}.md`;
  const delta = lineDelta(item.old_text, item.new_text);
  await adapter.write(`${outputDir}/${proposed}`, item.new_text);
  const prepared: PreparedReviewItem = {
    index,
    path: item.path,
    page,
    proposed,
    added: delta.added,
    removed: delta.removed,
    delta: delta.total,
    changed: Boolean(delta.total || item.changes.length || item.structure.length),
    structure: item.structure,
    raw: item
  };
  await adapter.write(`${outputDir}/${page}`, reviewPageHtml(item, prepared));
  return prepared;
}

function reviewPageHtml(item: ReviewGateManifestItem, prepared: PreparedReviewItem): string {
  const pathJson = JSON.stringify(item.path);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(item.path)}</title>
<style>
html,body{margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1f2937;background:#f6f7f9}
body{display:grid;grid-template-rows:auto minmax(0,1fr)}
.bar{display:grid;grid-template-columns:minmax(0,1fr) minmax(170px,46vw) 30px;gap:5px;align-items:center;padding:5px 7px;background:#fff;border-bottom:1px solid #d9dee7}
.path{font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.review{display:grid;grid-template-columns:minmax(0,1fr) 28px auto;gap:4px;align-items:center}
.review input{height:26px;border:1px solid #d9dee7;border-radius:6px;padding:2px 6px;font-size:12px}
.btn{width:28px;height:26px;border:1px solid #d9dee7;border-radius:6px;background:#fff;cursor:pointer}
.state{font-size:11px;color:#667085;min-width:52px;white-space:nowrap}
body[data-decision="approved"] .bar{border-left:4px solid #138a4b}
body[data-decision="correction"] .bar{border-left:4px solid #a15c00}
.main{overflow:auto;padding:7px;display:grid;gap:7px}
.panel{background:#fff;border:1px solid #d9dee7;border-radius:7px;overflow:hidden}
.head{display:flex;align-items:center;gap:6px;padding:5px 7px;border-bottom:1px solid #eef2f7;font-size:12px;font-weight:700}
.body{overflow:auto}
.diff{max-height:min(52vh,620px)}
.drow{display:grid;grid-template-columns:42px 42px minmax(0,1fr);font-size:12px;line-height:1.35;border-bottom:1px solid rgba(217,222,231,.55)}
.drow span{padding:2px 4px;text-align:right;color:#667085;background:#f8fafc;border-right:1px solid #eef2f7;font-variant-numeric:tabular-nums}
pre{margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.drow pre{padding:2px 6px}
.del{background:#ffebe9}.add{background:#dafbe1}
.two{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.source{max-height:34vh}
.srow{display:grid;grid-template-columns:42px minmax(0,1fr);font-size:12px;line-height:1.35;border-bottom:1px solid rgba(217,222,231,.55)}
.srow span{padding:2px 4px;text-align:right;color:#667085;background:#f8fafc;border-right:1px solid #eef2f7;font-variant-numeric:tabular-nums}
.srow pre{padding:2px 6px}
.rendered{padding:8px;font-size:13px;line-height:1.55;display:none}
.mode-render .source{display:none}.mode-render .rendered{display:block}
.structure-note{background:#fff8e1;border:1px solid #f1d58a;border-radius:7px;padding:6px;font-size:12px}
@media(max-width:720px){.bar{grid-template-columns:minmax(0,1fr) minmax(168px,56vw) 28px}.main{padding:5px;gap:5px}.two{grid-template-columns:1fr}.source{max-height:28vh}.diff{max-height:48vh}}
</style>
</head>
<body>
<header class="bar">
  <div class="path">${esc(item.path)} <span>+${prepared.added}/-${prepared.removed}</span></div>
  <div class="review"><input placeholder="correction" data-note><button class="btn" title="blank approves locally; text records correction locally" data-submit>✎</button><span class="state" data-state></span></div>
  <button class="btn" title="source/rendered" data-mode>◐</button>
</header>
<main class="main">
  ${item.structure.length ? "<section class=\"structure-note\">This file has structure candidates. Use the □ panel on the index page for path/name review.</section>" : ""}
  <section class="panel"><div class="head">Diff <span>+${prepared.added}/-${prepared.removed}</span></div><div class="body diff">${diffRows(item.old_text, item.new_text)}</div></section>
  <section class="two">
    <div class="panel"><div class="head">Old</div><div class="body source">${numberedSource(item.old_text)}</div><div class="rendered">${renderMarkdownLite(item.old_text)}</div></div>
    <div class="panel"><div class="head">New</div><div class="body source">${numberedSource(item.new_text)}</div><div class="rendered">${renderMarkdownLite(item.new_text)}</div></div>
  </section>
</main>
<script>
const key = "cancip-review:" + ${pathJson};
const note = document.querySelector("[data-note]");
const state = document.querySelector("[data-state]");
function apply(data){
  document.body.dataset.decision = data.decision || "";
  state.textContent = data.decision ? (data.decision === "approved" ? "approved" : "correction") : "";
  if (data.note) note.value = data.note;
}
try { const saved = JSON.parse(localStorage.getItem(key) || "{}"); if (saved.decision) apply(saved); } catch (_) {}
document.querySelector("[data-submit]").addEventListener("click", () => {
  const value = note.value.trim();
  const data = { decision: value ? "correction" : "approved", note: value, file: ${pathJson}, time: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(data));
  apply(data);
});
document.querySelector("[data-mode]").addEventListener("click", () => document.body.classList.toggle("mode-render"));
</script>
</body>
</html>
`;
}

function indexHtml(manifest: ReviewGateManifest, items: PreparedReviewItem[]): string {
  const structureMap: Record<string, ReviewGateStructureChange[]> = {};
  for (const item of items) {
    if (item.structure.length) structureMap[item.path] = item.structure;
  }
  const rows = items
    .map((item) => {
      const structure = item.structure.length ? `<button class="sq" data-structure="${esc(item.path)}">□${item.structure.length}</button>` : "";
      const changed = item.changed ? "changed" : "unchanged";
      return `<div class="file ${changed}" data-path="${esc(item.path)}" data-src="${esc(item.page)}"><button class="main">${esc(item.path)}</button><span class="badges">${structure}<span class="badge">+${item.added}/-${item.removed}</span></span></div>`;
    })
    .join("");
  const first = items.find((item) => item.changed)?.page ?? items[0]?.page ?? "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(manifest.title)}</title>
<style>
html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#1f2937;background:#f6f7f9;overflow:hidden}
.top{height:36px;display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:6px;align-items:center;padding:4px 8px;background:#fff;border-bottom:1px solid #d9dee7;box-sizing:border-box}
.btn,.sq{height:26px;border:1px solid #d9dee7;border-radius:6px;background:#fff;cursor:pointer}
.brand{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stat{font-size:11px;color:#667085;border:1px solid #d9dee7;border-radius:999px;padding:2px 6px;background:#fbfcfe;white-space:nowrap}
iframe{width:100%;height:calc(100vh - 36px);border:0;background:#fff}
.overlay[hidden],.drawer[hidden]{display:none}
.overlay{position:fixed;inset:0;background:rgba(15,23,42,.25);z-index:10}
.panel{width:min(92vw,840px);height:calc(100vh - 18px);margin:9px;display:grid;grid-template-rows:auto auto minmax(0,1fr);background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,.24)}
.panel-head,.tools{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:6px;align-items:center;padding:6px;border-bottom:1px solid #d9dee7}
.tools{grid-template-columns:minmax(0,1fr) auto}
input{height:26px;border:1px solid #d9dee7;border-radius:6px;padding:2px 7px;font-size:12px}
.tree{overflow:auto;padding:7px;font-size:12px}
.file{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px;align-items:center;border-radius:6px;border-bottom:1px solid #eef2f7}
.file:hover{background:#eef2f7}
.file .main{width:100%;border:0;background:transparent;text-align:left;padding:6px;font-size:12px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badges{display:flex;gap:3px;align-items:center}
.badge,.sq{font-size:11px;line-height:1;white-space:nowrap}
.sq{border-color:#8bbcff;background:#edf4ff;color:#0a3069;font-weight:800;padding:0 7px;border-radius:999px}
.badge{display:inline-flex;border:1px solid #bfd7ff;background:#edf4ff;color:#0a3069;border-radius:999px;padding:3px 5px}
.unchanged{opacity:.72}
.drawer{position:fixed;right:10px;top:10px;z-index:20;width:min(460px,calc(100vw - 40px));max-height:calc(100vh - 20px);display:grid;grid-template-rows:auto minmax(0,1fr);background:#fff;border:1px solid #cfd6e1;border-radius:8px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,.24)}
.drawer-head{display:grid;grid-template-columns:30px minmax(0,1fr);gap:6px;align-items:center;padding:7px;border-bottom:1px solid #d9dee7}
.drawer-body{overflow:auto;padding:8px;display:grid;gap:6px}
.card{display:grid;gap:4px;border:1px solid #d9e8ff;border-radius:7px;background:#f8fbff;padding:6px;font-size:12px}
.kind{justify-self:start;border:1px solid #bfd7ff;background:#edf4ff;color:#0a3069;border-radius:999px;padding:2px 7px;font-size:11px;font-weight:800}
.paths{display:grid;gap:2px;font-size:11px;color:#344054}.paths div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reason{font-size:11px;color:#667085}
@media(max-width:720px){.panel{width:100vw;height:100vh;margin:0;border-radius:0}.drawer{top:auto;left:0;right:0;bottom:0;width:auto;max-height:58vh;border-radius:8px 8px 0 0}}
</style>
</head>
<body>
<header class="top"><button class="btn" data-open>☰</button><div class="brand">${esc(manifest.title)}</div><div class="stat">${items.filter((item) => item.changed).length}/${items.length} · □${Object.values(structureMap).reduce((sum, value) => sum + value.length, 0)}</div></header>
<iframe class="viewer" src="${esc(first)}"></iframe>
<div class="overlay" data-overlay hidden>
  <section class="panel">
    <div class="panel-head"><button class="btn" data-close>×</button><b>${esc(manifest.vault_label)}</b><span class="stat">${esc(manifest.generated_at)}</span></div>
    <div class="tools"><input data-search placeholder="filter path"><span class="stat">${items.length}</span></div>
    <nav class="tree">${rows}</nav>
  </section>
  <aside class="drawer" data-drawer hidden><div class="drawer-head"><button class="btn" data-drawer-close>×</button><b data-drawer-title>Structure</b></div><div class="drawer-body" data-drawer-body></div></aside>
</div>
<script type="application/json" id="structure-data">${JSON.stringify(structureMap).replace(/</g, "\\u003c")}</script>
<script>
const viewer = document.querySelector(".viewer");
const overlay = document.querySelector("[data-overlay]");
const drawer = document.querySelector("[data-drawer]");
const search = document.querySelector("[data-search]");
const data = JSON.parse(document.getElementById("structure-data").textContent || "{}");
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function showStructure(path){
  const items = data[path] || [];
  document.querySelector("[data-drawer-title]").textContent = path;
  document.querySelector("[data-drawer-body]").innerHTML = items.map(item => '<div class="card"><span class="kind">□ '+esc(item.kind)+'</span><div class="paths"><div>old: '+esc(item.old_path||"-")+'</div><div>new: '+esc(item.new_path||"-")+'</div></div>'+(item.reason?'<div class="reason">'+esc(item.reason)+'</div>':'')+'</div>').join("");
  drawer.hidden = false;
}
function refresh(){
  const q = (search.value || "").toLowerCase().trim();
  document.querySelectorAll(".file").forEach(row => row.hidden = q && !String(row.dataset.path || "").toLowerCase().includes(q));
}
document.querySelector("[data-open]").onclick = () => { overlay.hidden = false; setTimeout(() => search.focus(), 0); };
document.querySelector("[data-close]").onclick = () => { drawer.hidden = true; overlay.hidden = true; };
document.querySelector("[data-drawer-close]").onclick = () => drawer.hidden = true;
search.oninput = refresh;
document.querySelectorAll(".file").forEach(row => {
  row.querySelector(".main").onclick = () => { viewer.src = row.dataset.src || ""; overlay.hidden = true; };
  const sq = row.querySelector("[data-structure]");
  if (sq) sq.onclick = ev => { ev.stopPropagation(); showStructure(row.dataset.path || ""); };
});
</script>
</body>
</html>
`;
}

function makeSummary(manifest: ReviewGateManifest, prepared: PreparedReviewItem[]): Record<string, unknown> {
  return {
    schemaVersion: manifest.schemaVersion,
    title: manifest.title,
    vault_label: manifest.vault_label,
    folder: manifest.folder,
    generated_at: manifest.generated_at,
    items: prepared.map((item) => ({
      name: basename(item.path),
      path: item.path,
      rel_path: item.path,
      review_html: item.page,
      proposed: item.proposed,
      old_chars: item.raw.old_text.length,
      new_chars: item.raw.new_text.length,
      added_lines: item.added,
      removed_lines: item.removed,
      line_delta: item.delta,
      changed: item.changed,
      changes: item.raw.changes,
      links: item.raw.links,
      structure: item.structure
    }))
  };
}

function diffRows(oldText: string, newText: string): string {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const rows: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine === newLine) {
      rows.push(`<div class="drow ctx"><span>${index + 1}</span><span>${index + 1}</span><pre>${esc(oldLine ?? "")}</pre></div>`);
    } else {
      if (oldLine !== undefined) rows.push(`<div class="drow del"><span>${index + 1}</span><span></span><pre>${esc(oldLine)}</pre></div>`);
      if (newLine !== undefined) rows.push(`<div class="drow add"><span></span><span>${index + 1}</span><pre>${esc(newLine)}</pre></div>`);
    }
  }
  return rows.join("\n") || '<div class="empty">No diff</div>';
}

function numberedSource(text: string): string {
  return (text.split(/\r?\n/) || [""])
    .map((line, index) => `<div class="srow"><span>${index + 1}</span><pre>${esc(line)}</pre></div>`)
    .join("\n");
}

function renderMarkdownLite(text: string): string {
  const parts: string[] = [];
  let inList = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) {
      if (inList) {
        parts.push("</ul>");
        inList = false;
      }
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      if (inList) {
        parts.push("</ul>");
        inList = false;
      }
      const level = heading[1].length;
      parts.push(`<h${level}>${esc(heading[2])}</h${level}>`);
      continue;
    }
    const item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (item) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${esc(item[1])}</li>`);
      continue;
    }
    if (inList) {
      parts.push("</ul>");
      inList = false;
    }
    parts.push(`<p>${esc(line)}</p>`);
  }
  if (inList) parts.push("</ul>");
  return parts.join("\n");
}

function lineDelta(oldText: string, newText: string): { added: number; removed: number; total: number } {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  let added = 0;
  let removed = 0;
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index += 1) {
    if (oldLines[index] === newLines[index]) continue;
    if (oldLines[index] !== undefined) removed += 1;
    if (newLines[index] !== undefined) added += 1;
  }
  return { added, removed, total: added + removed };
}

function reviewOutputDir(options: ReviewGateBuildOptions): string {
  if (options.output && options.output.trim()) return safeVaultPath(options.output);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-");
  return safeVaultPath(`${options.outputRoot}/review-${stamp}`);
}

function normalizeScopePaths(paths: unknown, scope: unknown): string[] {
  const values: string[] = [];
  if (Array.isArray(paths)) {
    for (const item of paths) if (typeof item === "string" && item.trim()) values.push(item);
  } else if (typeof paths === "string" && paths.trim()) {
    values.push(...paths.split(/[,\n]/).map((item) => item.trim()).filter(Boolean));
  }
  if (typeof scope === "string" && scope.trim() && scope !== "current vault") {
    values.push(...scope.split(/[,\n]/).map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(values.map((item) => safeVaultPath(item)))];
}

function normalizeStructure(raw: unknown, fallbackPath: string): ReviewGateStructureChange[] {
  if (!Array.isArray(raw)) return [];
  const result: ReviewGateStructureChange[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const kind = String(item.kind ?? "").trim().toLowerCase();
    if (!isStructureKind(kind)) continue;
    result.push({
      kind,
      old_path: typeof item.old_path === "string" ? safeVaultPath(item.old_path) : fallbackPath,
      new_path: typeof item.new_path === "string" ? safeVaultPath(item.new_path) : typeof item.target_path === "string" ? safeVaultPath(item.target_path) : "",
      reason: cleanText(item.reason),
      related_files: normalizeStringArray(item.related_files)
    });
  }
  return result;
}

function normalizeLinks(raw: unknown): ReviewGateLinks {
  if (!isRecord(raw)) return {};
  return {
    added: normalizeStringArray(raw.added),
    removed: normalizeStringArray(raw.removed),
    current: normalizeStringArray(raw.current),
    suggested: normalizeStringArray(raw.suggested)
  };
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return typeof raw === "string" && raw.trim() ? [raw.trim()] : [];
  return raw.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function extractWikiLinks(text: string): string[] {
  const links = new Set<string>();
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const value = match[1].trim();
    if (value) links.add(value);
  }
  return [...links].sort((a, b) => a.localeCompare(b));
}

function safeVaultPath(rawPath: string): string {
  const value = normalizePath(rawPath.trim().replace(/\\/g, "/").replace(/^\/+/, ""));
  if (!value || value === ".") return "";
  if (/^[a-zA-Z]:/.test(value) || value.includes("://")) throw new Error(`Invalid vault-relative path: ${rawPath}`);
  const parts = value.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error(`Invalid vault-relative path: ${rawPath}`);
  return parts.join("/");
}

async function ensureFolder(adapter: DataAdapter, folderPath: string): Promise<void> {
  const folder = safeVaultPath(folderPath);
  const parts = folder.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const stat = await adapter.stat(current);
    if (stat?.type === "file") throw new Error(`Path is a file: ${current}`);
    if (!stat) await adapter.mkdir(current);
  }
}

function isTextPath(path: string): boolean {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot < 1) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function isReviewGateCandidate(path: string, includeHidden: boolean): boolean {
  const normalized = normalizePath(path);
  if (!isTextPath(normalized)) return false;
  if (!includeHidden && basename(normalized).startsWith(".")) return false;
  if (!includeHidden && normalized.startsWith(".")) return false;
  if (normalized === ".cancip/config.json") return false;
  if (normalized.startsWith(".cancip/sessions/")) return false;
  if (normalized.startsWith(".cancip/versions/")) return false;
  if (normalized.startsWith(".cancip/automations/")) return false;
  if (normalized.startsWith(".cancip/review-gates/")) return false;
  if (normalized.startsWith("AI/Cancip/Exports/")) return false;
  if (normalized.startsWith("AI/Cancip/Review/")) return false;
  if (normalized.startsWith(".trash/")) return false;
  return true;
}

function isReviewGateExcludedFolder(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === ".trash"
    || normalized === ".cancip/sessions"
    || normalized.startsWith(".cancip/sessions/")
    || normalized === ".cancip/versions"
    || normalized.startsWith(".cancip/versions/")
    || normalized === ".cancip/automations"
    || normalized.startsWith(".cancip/automations/")
    || normalized === ".cancip/review-gates"
    || normalized.startsWith(".cancip/review-gates/")
    || normalized === "AI/Cancip/Exports"
    || normalized.startsWith("AI/Cancip/Exports/")
    || normalized === "AI/Cancip/Review"
    || normalized.startsWith("AI/Cancip/Review/");
}

function basename(path: string): string {
  return path.split("/").pop() || "note";
}

function slug(value: string): string {
  return value.replace(/\.[^.]+$/g, "").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "note";
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\0/g, "").trim() : "";
}

function truncateText(value: string, maxChars: number): string {
  const limit = Math.max(1000, maxChars);
  return value.length <= limit ? value : `${value.slice(0, limit)}\n\n...[truncated by Cancip review gate]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStructureKind(value: string): value is ReviewGateStructureKind {
  return value === "rename" || value === "move" || value === "merge" || value === "split" || value === "folder";
}
