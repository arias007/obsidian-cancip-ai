/**
 * Extraction planner for the main.ts split.
 *
 * The unsafe way to split a single-file bundle is to guess a cut and hope. This
 * computes one instead.
 *
 * Model
 * -----
 * Take every top-level declaration in main.ts as a node. Draw an edge A -> B when
 * A's body references the top-level name B. Now:
 *
 *   - A module can hold a set S of declarations only if S is *closed*: no member
 *     references anything still declared in main.ts. Otherwise the new module
 *     would have to import back from main.ts, i.e. a cycle.
 *   - The largest such S is obtained by repeatedly removing any member that
 *     references something outside S, until the set stops shrinking.
 *
 * Round one deliberately restricts candidates to declarations with no
 * module-initialisation semantics — function declarations (hoisted), type aliases
 * and interfaces (erased at emit). Classes and top-level statements are excluded,
 * because moving those changes evaluation order, which is a real behavioural risk
 * rather than a mechanical move.
 *
 * Output: the closed set, grouped into connected clusters so each cluster can
 * become one topically coherent module, plus the reasons declarations were
 * rejected.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import ts from "typescript";
import { repoRoot } from "./lib/source-bundle.mjs";

const mainPath = join(repoRoot, "src", "main.ts");
const text = readFileSync(mainPath, "utf8").replace(/\r\n?/g, "\n");
const sf = ts.createSourceFile("main.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
if (sf.parseDiagnostics.length) {
  console.error(`src/main.ts has ${sf.parseDiagnostics.length} parse diagnostic(s); refusing to plan.`);
  process.exit(1);
}

const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const spanLines = (node) => sf.getLineAndCharacterOfPosition(node.getEnd()).line - sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

// ------------------------------------------------------------------ inventory
const declarations = new Map(); // name -> record
const duplicates = [];
for (const st of sf.statements) {
  let name = "";
  if (st.name && st.name.getText) name = st.name.getText(sf);
  // `const X = …` is a VariableStatement and carries no `name` of its own. Missing
  // these would hide every reference to a top-level constant, which makes
  // functions that read such a constant look falsely closed.
  else if (ts.isVariableStatement(st)) {
    const first = st.declarationList.declarations[0];
    if (first && ts.isIdentifier(first.name)) name = first.name.text;
  }
  if (!name) continue;

  let category;
  if (ts.isFunctionDeclaration(st)) category = "function";
  else if (ts.isClassDeclaration(st)) category = "class";
  else if (ts.isTypeAliasDeclaration(st)) category = "type";
  else if (ts.isInterfaceDeclaration(st)) category = "interface";
  else if (ts.isEnumDeclaration(st)) category = "enum";
  else if (ts.isVariableStatement(st)) category = "const";
  else category = "other";

  if (declarations.has(name)) duplicates.push(name);
  declarations.set(name, { name, category, node: st, line: lineOf(st), lines: spanLines(st) });
}

const topLevelNames = new Set(declarations.keys());

// ------------------------------------------------------- reference extraction
/**
 * Identifiers referenced by a declaration, intersected with top-level names.
 * Over-approximates on purpose: a shadowed local or a property name that happens
 * to match a top-level name counts as a reference. That only shrinks the closed
 * set, so it errs towards safety.
 */
function referencesOf(node, selfName) {
  const found = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const name = n.text;
      if (name !== selfName && topLevelNames.has(name)) {
        // Skip identifiers that are purely a property/key name (obj.Foo, { Foo: 1 }).
        const parent = n.parent;
        const isPropertyName =
          (ts.isPropertyAccessExpression(parent) && parent.name === n) ||
          (ts.isPropertyAssignment(parent) && parent.name === n) ||
          (ts.isPropertySignature(parent) && parent.name === n) ||
          (ts.isMethodSignature(parent) && parent.name === n) ||
          (ts.isMethodDeclaration(parent) && parent.name === n) ||
          (ts.isPropertyDeclaration(parent) && parent.name === n) ||
          (ts.isPropertyAccessChain(parent) && parent.name === n) ||
          (ts.isQualifiedName(parent) && parent.right === n);
        if (!isPropertyName) found.add(name);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

const refs = new Map();
for (const [name, record] of declarations) {
  refs.set(name, referencesOf(record.node, name));
}

// --------------------------------------------------- largest closed candidate set
const CANDIDATE_CATEGORIES = new Set(["function", "type", "interface"]);
let closed = new Set([...declarations.values()].filter((d) => CANDIDATE_CATEGORIES.has(d.category)).map((d) => d.name));
const rejected = new Map(); // name -> why

for (;;) {
  let removed = 0;
  for (const name of [...closed]) {
    const outside = [...refs.get(name)].filter((target) => !closed.has(target));
    if (outside.length) {
      rejected.set(name, outside);
      closed.delete(name);
      removed += 1;
    }
  }
  if (!removed) break;
}

// --------------------------------------------------------- cluster the closed set
// Undirected connected components: declarations that reference each other end up
// in one module, so a moved name is always resolvable inside its own file.
const adjacency = new Map();
for (const name of closed) adjacency.set(name, new Set());
for (const name of closed) {
  for (const target of refs.get(name)) {
    if (closed.has(target) && target !== name) {
      adjacency.get(name).add(target);
      adjacency.get(target).add(name);
    }
  }
}
const seen = new Set();
const clusters = [];
for (const name of closed) {
  if (seen.has(name)) continue;
  const stack = [name];
  const members = [];
  seen.add(name);
  while (stack.length) {
    const current = stack.pop();
    members.push(current);
    for (const next of adjacency.get(current)) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  const lines = members.reduce((sum, member) => sum + declarations.get(member).lines, 0);
  const categories = {};
  for (const member of members) {
    const category = declarations.get(member).category;
    categories[category] = (categories[category] || 0) + 1;
  }
  members.sort((a, b) => declarations.get(a).line - declarations.get(b).line);
  clusters.push({ members, lines, categories, firstLine: declarations.get(members[0]).line });
}
clusters.sort((a, b) => b.lines - a.lines);

// ------------------------------------------------ partition into module segments
// A segment is safe to emit as its own module as long as modules only import from
// themselves or from earlier segments. Splitting along a topological order of the
// closed set's SCC condensation guarantees exactly that: every edge points
// forward, so no two segments can form a cycle.
function stronglyConnectedComponents(nodes, edgesOf) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const low = new Map();
  const components = [];

  const strongConnect = (node) => {
    indices.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of edgesOf(node)) {
      if (!indices.has(next)) {
        strongConnect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), indices.get(next)));
      }
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      for (;;) {
        const member = stack.pop();
        onStack.delete(member);
        component.push(member);
        if (member === node) break;
      }
      components.push(component);
    }
  };

  for (const node of nodes) if (!indices.has(node)) strongConnect(node);
  return components;
}

const closedList = [...closed];
// Edges only inside the closed set; targets outside the set cannot exist by construction.
const edgesOf = (name) => [...refs.get(name)].filter((target) => closed.has(target) && target !== name);
const components = stronglyConnectedComponents(closedList, edgesOf);
const componentOf = new Map();
components.forEach((members, i) => members.forEach((member) => componentOf.set(member, i)));

// Kahn topological order over the condensation.
const indegree = new Array(components.length).fill(0);
const outEdges = new Map();
for (const name of closedList) {
  const from = componentOf.get(name);
  for (const target of edgesOf(name)) {
    const to = componentOf.get(target);
    if (from === to) continue;
    if (!outEdges.has(from)) outEdges.set(from, new Set());
    if (!outEdges.get(from).has(to)) {
      outEdges.get(from).add(to);
      indegree[to] += 1;
    }
  }
}
const queue = [];
for (let i = 0; i < components.length; i += 1) if (indegree[i] === 0) queue.push(i);
const topo = [];
while (queue.length) {
  const current = queue.shift();
  topo.push(current);
  for (const next of outEdges.get(current) ?? []) {
    indegree[next] -= 1;
    if (indegree[next] === 0) queue.push(next);
  }
}
const emitted = new Set(topo);
// Any component left out of the topological order means the condensation had a
// cycle, which is impossible for an SCC condensation — surface it if it happens.
const orphanComponents = components.map((_, i) => i).filter((i) => !emitted.has(i));

const TARGET_SEGMENT_LINES = Number(process.env.CANCIP_SEGMENT_LINES ?? 3000);
// Identifier words (camelCase / PascalCase / snake_case split into lowercase tokens).
const TOPIC_RULES = [
  ["tts", ["tts", "speech", "voice", "phoneme", "phonemes", "speak", "speaking", "utterance", "utterances", "sentence", "sentences", "aloud", "audio", "playback", "highlight", "pronounce"]],
  ["office", ["office", "docx", "pptx", "xlsx", "ooxml", "epub", "pandoc", "xml", "archive", "spreadsheet", "worksheet", "slide"]],
  ["search", ["search", "rag", "index", "indexed", "embedding", "recall", "retrieve", "retrieval", "keyword", "ranked", "ranking", "query", "hits", "hit"]],
  ["pdf", ["pdf", "pymupdf", "pdfjs", "page", "pages", "viewport"]],
  ["model-api", ["model", "models", "api", "apikey", "profile", "provider", "completion", "completions", "llm", "stream", "streaming", "reasoning", "temperature", "tokens", "endpoint", "endpoints", "responses", "chat"]],
  ["settings", ["settings", "setting", "config", "preference", "preferences", "schema", "normalize", "normalized", "migrate", "migration", "options"]],
  ["review", ["review", "gate", "approval", "verdict", "consensus", "subagent", "subagents", "plan", "planning", "process", "processes", "acceptance", "capability"]],
  ["vault", ["vault", "file", "files", "folder", "folders", "path", "paths", "attachment", "frontmatter", "metadata", "cache", "storage", "note", "notes", "document", "documents"]],
  ["i18n", ["i18n", "translate", "translation", "locale", "language", "languages", "template", "templates", "translatable"]],
  ["workbench", ["workbench", "embed", "embeds", "iframe", "preview", "previews", "snapshot", "snapshots", "canvas", "thumbnail", "thumbnails", "frame"]],
  ["ui", ["ui", "render", "renders", "dom", "element", "elements", "button", "buttons", "icon", "icons", "menu", "modal", "popover", "panel", "tab", "tabs", "scroll", "tooltip", "notice", "style", "styles", "layout"]]
];

function words(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
}

function topicFor(members) {
  const scores = new Map();
  for (const member of members) {
    const tokens = new Set(words(member));
    for (const [topic, keywords] of TOPIC_RULES) {
      let hits = 0;
      for (const keyword of keywords) if (tokens.has(keyword)) hits += 1;
      if (hits) scores.set(topic, (scores.get(topic) ?? 0) + hits);
    }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : "misc";
}

const segments = [];
let current = { components: [], members: [], lines: 0 };
const flush = () => {
  if (!current.members.length) return;
  current.members.sort((a, b) => declarations.get(a).line - declarations.get(b).line);
  segments.push(current);
  current = { components: [], members: [], lines: 0 };
};
for (const componentIndex of topo) {
  const members = components[componentIndex];
  const lines = members.reduce((sum, member) => sum + declarations.get(member).lines, 0);
  // Never split an SCC across segments, and cut once the target size is reached.
  if (current.lines > 0 && current.lines + lines > TARGET_SEGMENT_LINES) flush();
  current.components.push(componentIndex);
  current.members.push(...members);
  current.lines += lines;
}
flush();

const closedLines = [...closed].reduce((sum, name) => sum + declarations.get(name).lines, 0);
const candidateTotal = [...declarations.values()].filter((d) => CANDIDATE_CATEGORIES.has(d.category)).length;

const topicCounts = new Map();
const plan = segments.map((segment, i) => {
  const topic = topicFor(segment.members);
  topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  return {
    index: i,
    topic,
    slug: `${topic}-${topicCounts.get(topic)}`,
    lines: segment.lines,
    members: segment.members,
    firstLine: declarations.get(segment.members[0]).line
  };
});

// ------------------------------------------------- positional module grouping
// Topological segments are structurally safe but scattered across the file, so
// their members share no theme. Grouping by original file position instead keeps
// declarations that the author wrote side by side in one module, which is what
// makes a module readable. Modules may import from each other freely — the only
// hard rule is that nothing imports back from main.ts, which the closed set
// already guarantees.
const bucketTarget = Number(process.env.CANCIP_BUCKET_LINES ?? 3000);
const byPosition = [...closed]
  .map((name) => ({ name, ...declarations.get(name) }))
  .sort((a, b) => a.line - b.line);
const positionBuckets = [];
{
  let bucket = { lines: 0, members: [], startLine: byPosition[0]?.line ?? 0 };
  for (const member of byPosition) {
    if (bucket.lines > 0 && bucket.lines + member.lines > bucketTarget) {
      positionBuckets.push(bucket);
      bucket = { lines: 0, members: [], startLine: member.line };
    }
    bucket.lines += member.lines;
    bucket.members.push(member);
  }
  if (bucket.members.length) positionBuckets.push(bucket);
}

const summary = {
  mainTsLines: text.split("\n").length,
  topLevelDeclarations: declarations.size,
  duplicateNames: [...new Set(duplicates)].slice(0, 20),
  candidateDeclarations: candidateTotal,
  closedDeclarations: closed.size,
  closedLines,
  rejectedDeclarations: rejected.size,
  closedSetComponents: components.length,
  orphanComponents,
  proposedModules: plan.length,
  rejected: [...rejected.entries()].map(([name, outside]) => ({ name, references: outside })),
  positionBuckets: positionBuckets.map((bucket, i) => {
    const members = bucket.members.map((m) => m.name);
    return {
      index: i,
      topic: topicFor(members),
      lines: bucket.lines,
      startLine: bucket.startLine,
      endLine: bucket.members[bucket.members.length - 1].line,
      memberCount: members.length,
      members
    };
  }),
  clusters: clusters.map((c) => ({
    lines: c.lines,
    members: c.members.length,
    categories: c.categories,
    firstLine: c.firstLine,
    sample: c.members.slice(0, 12)
  })),
  plan: plan.map((p) => ({ index: p.index, topic: p.topic, slug: p.slug, lines: p.lines, firstLine: p.firstLine, memberCount: p.members.length, members: p.members }))
};

writeFileSync(join(repoRoot, "outputs", "build", "analysis", "extraction-plan.json"), JSON.stringify(summary, null, 2));

console.log(`main.ts: ${summary.mainTsLines} 行, 顶层声明 ${summary.topLevelDeclarations} 个`);
console.log(`候选（函数/类型/接口）: ${summary.candidateDeclarations}`);
console.log(`封闭可提取         : ${summary.closedDeclarations} 个声明, 共 ${summary.closedLines} 行`);
console.log(`因引用回 main.ts 被否决: ${summary.rejectedDeclarations}`);
console.log(`封闭集内强连通分量 : ${summary.closedSetComponents}（拓扑序切分 → ${summary.proposedModules} 个模块）`);
if (orphanComponents.length) console.error(`警告: ${orphanComponents.length} 个分量未进入拓扑序（不应发生）`);
console.log(`\n=== 封闭集切分出的簇（按行数降序，前 12）===`);
console.log("行数\t成员\t起点\t组成\t样例");
for (const c of summary.clusters.slice(0, 12)) {
  const cats = Object.entries(c.categories).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`${c.lines}\t${c.members}\t${c.firstLine}\t${cats}\t${c.sample.slice(0, 6).join(", ")}`);
}
console.log(`\n=== 拟生成的模块（拓扑序，目标每模块 ${TARGET_SEGMENT_LINES} 行）===`);
console.log("序号\t主题\t行数\t成员\t起点");
for (const p of summary.plan) console.log(`${p.index}\t${p.slug}\t${p.lines}\t${p.memberCount}\t${p.firstLine}`);
console.log(`\n=== 被否决的声明（必须留在 main.ts，${summary.rejectedDeclarations} 个）===`);
for (const r of summary.rejected) console.log(`${r.name}  ->  ${r.references.join(", ")}`);
console.log(`\n=== 按原文件位置分桶（每桶约 ${bucketTarget} 行，供提取器使用）===`);
console.log("序号\t主题\t行数\t成员\t区间");
for (const b of summary.positionBuckets) {
  console.log(`${b.index}\t${b.topic}\t${b.lines}\t${b.memberCount}\t${b.startLine}-${b.endLine}`);
}
console.log(`\n完整计划已写入 outputs/build/analysis/extraction-plan.json`);
