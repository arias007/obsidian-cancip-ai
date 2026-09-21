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

function referencesOf(node, selfName) {
  const found = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      const name = n.text;
      if (name !== selfName && topLevelNames.has(name)) {
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
    const outside = [...refs.get(byName.get(name))].filter((target) => !closed.has(target));
    if (outside.length) {
      closed.delete(name);
      removed += 1;
    }
  }
  if (!removed) break;
}

// ------------------------------------------------------------------- imports
// localName -> how main.ts obtains it (default / named / namespace).
const importOrigins = new Map();
for (const st of sf.statements) {
  if (!ts.isImportDeclaration(st)) continue;
  const source = st.moduleSpecifier.text;
  const clause = st.importClause;
  if (!clause) continue;
  if (clause.name) importOrigins.set(clause.name.text, { source, kind: "default" });
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      importOrigins.set(element.name.text, {
        source,
        kind: "named",
        imported: element.propertyName ? element.propertyName.text : element.name.text
      });
    }
  } else if (bindings && ts.isNamespaceImport(bindings)) {
    importOrigins.set(bindings.name.text, { source, kind: "namespace" });
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
for (const module of modules) {
  const own = new Set(module.members);
  const used = new Set();
  for (const member of module.members) for (const name of refs.get(byName.get(member))) used.add(name);

  const externalImports = new Map(); // source -> {default:Set, named:Map, namespace:Set}
  const siblingImports = new Map(); // slug -> Set<name>
  for (const name of used) {
    if (own.has(name)) continue;
    if (closed.has(name)) {
      const target = moduleOf.get(name);
      if (!siblingImports.has(target)) siblingImports.set(target, new Set());
      siblingImports.get(target).add(name);
      continue;
    }
    const origin = importOrigins.get(name);
    if (!origin) {
      failures.push(`${module.slug}: ${member} references ${name}, which is neither moved nor imported`);
      continue;
    }
    if (!externalImports.has(origin.source)) externalImports.set(origin.source, { default: new Set(), named: new Map(), namespace: new Set() });
    const bucket = externalImports.get(origin.source);
    if (origin.kind === "default") bucket.default.add(name);
    else if (origin.kind === "namespace") bucket.namespace.add(name);
    else bucket.named.set(name, origin.imported);
  }

  const lines = [];
  lines.push(`/*`);
  lines.push(` * Cancip ${module.slug} — extracted from src/main.ts by scripts/extract-main-modules.mjs.`);
  lines.push(` * Declarations here were proven to reference nothing left behind in main.ts, so this`);
  lines.push(` * module never imports back from it. Regenerate the plan with scripts/plan-main-split.mjs.`);
  lines.push(` */`);
  for (const [source, bucket] of [...externalImports.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (bucket.default.size) for (const name of [...bucket.default].sort()) lines.push(`import ${name} from ${JSON.stringify(source)};`);
    if (bucket.namespace.size) for (const name of [...bucket.namespace].sort()) lines.push(`import * as ${name} from ${JSON.stringify(source)};`);
    if (bucket.named.size) {
      const specifiers = [...bucket.named.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([local, imported]) => (local === imported ? local : `${imported} as ${local}`));
      lines.push(`import { ${specifiers.join(", ")} } from ${JSON.stringify(source)};`);
    }
  }
  for (const [slug, names] of [...siblingImports.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`import { ${[...names].sort().join(", ")} } from "./${slug}";`);
  }
  lines.push("");
  for (const member of module.members) {
    const { start, end } = ranges.get(member);
    lines.push(`export ${raw.slice(start, end).trimEnd()}`);
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
