/**
 * Mechanical extractor for the main.ts split.
 *
 * Moves the *closed* set of top-level declarations (proved by
 * scripts/plan-main-split.mjs to reference nothing that stays behind) out of
 * src/main.ts and into src/main-parts/*.ts.
 *
 * Safety properties this script relies on and re-checks:
 *
 *   - Closure. Every moved declaration's references resolve inside the moved set
 *     or to something already imported from a real module. A reference that would
 *     have to point back into main.ts aborts the run rather than producing a
 *     circular import.
 *   - Round trip. Moved text is copied verbatim (no reformatting, original line
 *     endings), so the only change to the source is where a declaration lives.
 *   - Only declaration bodies move. Classes and top-level statements stay, because
 *     moving those changes module-initialisation order.
 *
 * Run without --apply for a dry run.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { repoRoot } from "./lib/source-bundle.mjs";

const APPLY = process.argv.includes("--apply");
const MODULE_DIR = "src/main-parts";
const mainPath = join(repoRoot, "src", "main.ts");
const planPath = join(repoRoot, "outputs", "build", "analysis", "extraction-plan.json");

// The plan is a build artifact (outputs/build/ is gitignored), so a fresh clone
// will not have it. Regenerate it instead of failing, otherwise the extractor
// looks broken on any machine that has not run the analyser first.
if (!existsSync(planPath)) {
  const analyzer = join(dirname(fileURLToPath(import.meta.url)), "plan-main-split.mjs");
  console.log("extraction-plan.json missing; regenerating via plan-main-split.mjs ...");
  execFileSync(process.execPath, [analyzer], { cwd: repoRoot, stdio: "inherit" });
}

const raw = readFileSync(mainPath, "utf8");
const EOL = raw.includes("\r\n") ? "\r\n" : "\n";
const sf = ts.createSourceFile("main.ts", raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
if (sf.parseDiagnostics.length) {
  console.error(`src/main.ts has ${sf.parseDiagnostics.length} parse diagnostic(s); aborting.`);
  process.exit(1);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));

// ------------------------------------------------------------------ inventory
const declarations = new Map();
for (const st of sf.statements) {
  let name = "";
  if (st.name && st.name.getText) name = st.name.getText(sf);
  else if (ts.isVariableStatement(st)) {
    const first = st.declarationList.declarations[0];
    if (first && ts.isIdentifier(first.name)) name = first.name.text;
  }
  declarations.set(st, {
    name,
    category: ts.isFunctionDeclaration(st)
      ? "function"
      : ts.isClassDeclaration(st)
        ? "class"
        : ts.isTypeAliasDeclaration(st)
          ? "type"
          : ts.isInterfaceDeclaration(st)
            ? "interface"
            : ts.isVariableStatement(st)
              ? "const"
              : "other"
  });
}
const byName = new Map([...declarations.entries()].filter(([, d]) => d.name).map(([st, d]) => [d.name, st]));
const topLevelNames = new Set(byName.keys());

// Collects every identifier the node references, regardless of where it is
// declared. Two consumers need different subsets, so the filter lives with them
// rather than here:
//   - the closure check only cares about names declared at the top level of
//     main.ts (a reference to anything else cannot create a circular import);
//   - module emission needs *all* names, because a moved declaration that calls
//     normalizePath() or mentions the type DataAdapter has to receive the same
//     `obsidian` import main.ts had, and one that mentions LocalAgentProvider
//     has to receive the same `type LocalAgentProvider` import from ./reviewGate.
//   Filtering here instead would silently drop every external import, which is
//   exactly the bug this function used to have.
function referencesOf(node, selfName) {
  const found = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const name = n.text;
      if (name !== selfName) {
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
for (const [st, d] of declarations) refs.set(st, referencesOf(st, d.name));

// ------------------------------------------------------- recompute the closure
const CANDIDATE_CATEGORIES = new Set(["function", "type", "interface"]);
let closed = new Set(
  [...declarations.entries()]
    .filter(([, d]) => d.name && CANDIDATE_CATEGORIES.has(d.category))
    .map(([, d]) => d.name)
);
for (;;) {
  let removed = 0;
  for (const name of [...closed]) {
    // Only a reference to another top-level main.ts declaration can force this
    // one to stay behind; a reference to an imported or ambient name cannot.
    const outside = [...refs.get(byName.get(name))].filter((target) => topLevelNames.has(target) && !closed.has(target));
    if (outside.length) {
      closed.delete(name);
      removed += 1;
    }
  }
  if (!removed) break;
}

// ------------------------------------------------------------------- imports
// localName -> how main.ts obtains it (default / named / namespace).
// typeOnly matters: `type LocalAgentProvider` must stay a type import, because a
// value import would ask the bundler for a runtime export that does not exist,
// and dropping the modifier entirely is what turns a `value is T` predicate into
// an unresolved name, silently disabling narrowing in every caller.
const importOrigins = new Map();
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st)) continue;
  const source = st.moduleSpecifier.text;
  const clause = st.importClause;
  if (!clause) continue;
  const clauseTypeOnly = Boolean(clause.isTypeOnly);
  if (clause.name) importOrigins.set(clause.name.text, { source, kind: "default", typeOnly: clauseTypeOnly });
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      importOrigins.set(element.name.text, {
        source,
        kind: "named",
        imported: element.propertyName ? element.propertyName.text : element.name.text,
        typeOnly: clauseTypeOnly || Boolean(element.isTypeOnly)
      });
    }
  } else if (bindings && ts.isNamespaceImport(bindings)) {
    importOrigins.set(bindings.name.text, { source, kind: "namespace", typeOnly: clauseTypeOnly });
  }
}

// ------------------------------------------------------------ module grouping
const buckets = plan.positionBuckets;
const bucketOf = new Map();
for (const bucket of buckets) for (const member of bucket.members) bucketOf.set(member, bucket.index);

const plannedMembers = buckets.flatMap((b) => b.members);
const closedSorted = [...closed].sort();
const plannedSorted = [...plannedMembers].sort();
if (JSON.stringify(closedSorted) !== JSON.stringify(plannedSorted)) {
  console.error("Plan mismatch: extraction-plan.json buckets do not match the recomputed closed set. Re-run scripts/plan-main-split.mjs.");
  const missing = closedSorted.filter((n) => !plannedMembers.includes(n));
  const extra = plannedSorted.filter((n) => !closed.has(n));
  console.error(`missing from plan: ${missing.length}, unexpected in plan: ${extra.length}`);
  console.error(`  missing: ${missing.slice(0, 20).join(", ")}`);
  console.error(`  unexpected: ${extra.slice(0, 20).join(", ")}`);
  process.exit(1);
}

// ------------------------------------------------------------- text ranges
function leadingStart(node) {
  let start = node.getStart(sf, true);
  const ranges = ts.getLeadingCommentRanges(raw, node.getFullStart()) ?? [];
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const range = ranges[i];
    if (range.end > start) continue;
    const gap = raw.slice(range.end, start);
    if (!/^[ \t]*(?:\r?\n[ \t]*)*$/.test(gap)) break;
    if (/\r?\n[ \t]*\r?\n/.test(gap)) break; // a blank line separates it: not attached
    start = range.pos;
  }
  return start;
}
function trailingEnd(node) {
  let end = node.getEnd();
  const lineEnd = raw.indexOf("\n", end);
  const stop = lineEnd < 0 ? raw.length : lineEnd;
  const tail = raw.slice(end, stop);
  if (tail.trim() && /^[ \t]*(?:\/\/.*|\/\*.*\*\/)[ \t]*$/.test(tail)) end = stop;
  return end;
}

const ranges = new Map();
for (const name of closed) {
  const node = byName.get(name);
  ranges.set(name, { start: leadingStart(node), end: trailingEnd(node) });
}

// --------------------------------------------------- which names must be exported
// Anything referenced from a statement that is NOT moving has to be importable.
const keptStatements = sf.statements.filter((st) => !declarations.get(st).name || !closed.has(declarations.get(st).name));
const keptRefs = new Set();
for (const st of keptStatements) {
  for (const name of referencesOf(st, "")) keptRefs.add(name);
}
const neededByMain = [...closed].filter((name) => keptRefs.has(name)).sort();

// -------------------------------------------------------------- module emission
const topicCounts = new Map();
const modules = buckets.map((bucket) => {
  const count = (topicCounts.get(bucket.topic) ?? 0) + 1;
  topicCounts.set(bucket.topic, count);
  const types = bucket.members.filter((name) => declarations.get(byName.get(name)).category === "type" || declarations.get(byName.get(name)).category === "interface").length;
  const mostlyTypes = types / bucket.members.length > 0.6;
  const base = mostlyTypes ? "types" : bucket.topic;
  const slug = base === "misc" || base === "types" ? `${base}-${count}` : count === 1 ? base : `${base}-${count}`;
  return { ...bucket, slug, members: [...bucket.members].sort((a, b) => ranges.get(a).start - ranges.get(b).start) };
});
const moduleOf = new Map();
for (const module of modules) for (const member of module.members) moduleOf.set(member, module.slug);

const failures = [];
const emitted = new Map();

// A moved module lives one directory deeper than main.ts, so a specifier that was
// "./reviewGate" in main.ts has to become "../reviewGate" - otherwise every
// relative dependency of every extracted declaration dangles.
function rewriteSpecifier(source) {
  return source.startsWith(".") ? source.replace(/^\.\//, "../") : source;
}

for (const module of modules) {
  const own = new Set(module.members);
  // name -> the members that reference it, so a failure can name the culprit.
  const usedBy = new Map();
  for (const member of module.members) {
    for (const name of refs.get(byName.get(member))) {
      if (name === member) continue;
      if (!usedBy.has(name)) usedBy.set(name, new Set());
      usedBy.get(name).add(member);
    }
  }

  const externalImports = new Map(); // source -> {default:Map, named:Map, namespace:Map}
  const siblingImports = new Map(); // slug -> Set<name>
  const unknown = []; // names still declared in main.ts: a closure breach
  for (const [name, owners] of usedBy) {
    if (own.has(name)) continue;
    if (closed.has(name)) {
      const target = moduleOf.get(name);
      if (!siblingImports.has(target)) siblingImports.set(target, new Set());
      siblingImports.get(target).add(name);
      continue;
    }
    const origin = importOrigins.get(name);
    if (origin) {
      if (!externalImports.has(origin.source)) externalImports.set(origin.source, { default: new Map(), named: new Map(), namespace: new Map() });
      const bucket = externalImports.get(origin.source);
      if (origin.kind === "default") bucket.default.set(name, origin);
      else if (origin.kind === "namespace") bucket.namespace.set(name, origin);
      else bucket.named.set(name, origin);
      continue;
    }
    // Not moved, not imported. If it is a top-level main.ts declaration the
    // closure proof was wrong for this declaration and the run must stop; if it
    // is not, it is a local, a parameter, or an ambient/lib global (window,
    // document, activeWindow, moment, ...) and needs no import at all.
    if (topLevelNames.has(name)) unknown.push(`${[...owners].slice(0, 3).join(", ")} -> ${name}`);
  }
  if (unknown.length) {
    failures.push(`${module.slug}: references names that stay in main.ts: ${unknown.slice(0, 5).join("; ")}`);
    continue;
  }

  const lines = [];
  lines.push(`/*`);
  lines.push(` * Cancip ${module.slug} — extracted from src/main.ts by scripts/extract-main-modules.mjs.`);
  lines.push(` * Declarations here were proven to reference nothing left behind in main.ts, so this`);
  lines.push(` * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.`);
  lines.push(` */`);
  const byLocalName = (a, b) => a[0].localeCompare(b[0]);
  for (const [source, bucket] of [...externalImports.entries()].sort(byLocalName)) {
    const specifier = JSON.stringify(rewriteSpecifier(source));
    for (const [name, info] of [...bucket.default.entries()].sort(byLocalName)) {
      lines.push(`import ${info.typeOnly ? "type " : ""}${name} from ${specifier};`);
    }
    for (const [name, info] of [...bucket.namespace.entries()].sort(byLocalName)) {
      lines.push(`import ${info.typeOnly ? "type " : ""}* as ${name} from ${specifier};`);
    }
    if (bucket.named.size) {
      const specifiers = [...bucket.named.entries()].sort(byLocalName).map(([local, info]) => {
        const core = local === info.imported ? local : `${info.imported} as ${local}`;
        return info.typeOnly ? `type ${core}` : core;
      });
      lines.push(`import { ${specifiers.join(", ")} } from ${specifier};`);
    }
  }
  for (const [slug, names] of [...siblingImports.entries()].sort(byLocalName)) {
    lines.push(`import { ${[...names].sort().join(", ")} } from "./${slug}";`);
  }
  lines.push("");
  for (const member of module.members) {
    const { start, end } = ranges.get(member);
    const body = raw.slice(start, end).trimEnd();
    // The `export` modifier has to sit immediately before the declaration, after
    // any doc comment attached to it. Prefixing the whole slice produced
    // `export // note` and `export /** ... */`, which still parse but detach the
    // comment from the declaration it documents (and break IDE tooltips).
    const declarationStart = byName.get(member).getStart(sf) - start;
    lines.push(`${body.slice(0, declarationStart)}export ${body.slice(declarationStart)}`);
    lines.push("");
  }
  emitted.set(module.slug, `${lines.join(EOL)}${EOL}`);
}

if (failures.length) {
  console.error("Refusing to extract: some moved declarations reference names that are neither moved nor imported.");
  for (const failure of failures.slice(0, 30)) console.error(`  ${failure}`);
  process.exit(1);
}

// ------------------------------------------------------------- rewrite main.ts
const removals = [...ranges.values()].sort((a, b) => b.start - a.start);
let nextMain = raw;
for (const { start, end } of removals) {
  // Leave the first line's newline count intact where possible so the file keeps
  // its shape; a single blank line marks where the declaration used to be.
  nextMain = `${nextMain.slice(0, start)}${nextMain.slice(end)}`;
}
nextMain = nextMain.replace(/(?:\r?\n){3,}/g, `${EOL}${EOL}`);

// Group by module so main.ts imports each part once.
const mainImportLines = [];
const neededByModule = new Map();
for (const name of neededByMain) {
  const slug = moduleOf.get(name);
  if (!neededByModule.has(slug)) neededByModule.set(slug, []);
  neededByModule.get(slug).push(name);
}
for (const [slug, names] of [...neededByModule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  mainImportLines.push(`import { ${names.sort().join(", ")} } from "./main-parts/${slug}";`);
}
const mainImportBlock = mainImportLines.length ? `${mainImportLines.join(EOL)}${EOL}` : "";

const firstStatement = sf.statements[0];
const insertAt = firstStatement ? firstStatement.getStart(sf) : 0;
nextMain = `${nextMain.slice(0, insertAt)}${mainImportBlock}${nextMain.slice(insertAt)}`;

// ------------------------------------------------------------------- reporting
console.log(`mode: ${APPLY ? "APPLY" : "dry run"}`);
console.log(`main.ts: ${raw.split("\n").length} 行 → 预计 ${nextMain.split("\n").length} 行`);
console.log(`搬出声明: ${closed.size} 个（留 ${keptRefs.size ? neededByMain.length : 0} 个名字需要 main.ts 继续引用）`);
console.log(`生成模块: ${modules.length} 个`);
console.log("模块\t行数\t成员\tmain.ts 引用数");
for (const module of modules) {
  const referenced = neededByModule.get(module.slug)?.length ?? 0;
  console.log(`${module.slug}\t${module.lines}\t${module.members.length}\t${referenced}`);
}
console.log(`\nmain.ts 新增 import 块:`);
console.log(mainImportBlock.trimEnd() || "(无需新增)");

if (!APPLY) {
  console.log("\n(dry run — pass --apply to write files)");
  process.exit(0);
}

mkdirSync(join(repoRoot, MODULE_DIR), { recursive: true });
for (const [slug, text] of emitted) writeFileSync(join(repoRoot, MODULE_DIR, `${slug}.ts`), text);
writeFileSync(mainPath, nextMain);
console.log(`\n已写入 ${emitted.size} 个模块到 ${MODULE_DIR}/，并重写 src/main.ts`);
