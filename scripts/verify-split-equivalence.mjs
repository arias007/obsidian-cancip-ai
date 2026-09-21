/**
 * Proves that the main.ts split only *relocated* code.
 *
 * Byte-comparing the bundles proves nothing, because esbuild names and orders the
 * emitted code by the module graph. The claim that actually needs proving is about
 * the source: every top-level declaration that exists after the split must be
 * byte-identical to one that existed before it, and nothing may be added or lost.
 *
 * Approach: parse the pre-split baseline and the current source tree into
 * top-level statements, normalise each one (drop module modifiers, normalise line
 * endings, trim), and compare the two multisets. A statement that was edited,
 * duplicated, dropped, or newly written shows up as a named mismatch.
 *
 *   node scripts/verify-split-equivalence.mjs --baseline <git-ref|file>
 *
 * The baseline is also accepted from outputs/build/backup/main.ts.pre-split, which
 * is what the extractor writes before its first --apply.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import ts from "typescript";
import { repoRoot } from "./lib/source-bundle.mjs";

const argumentIndex = process.argv.indexOf("--baseline");
const baselineArg = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : "";
const fallbackBaseline = join(repoRoot, "outputs", "build", "backup", "main.ts.pre-split");

let baselineText = "";
let baselineLabel = "";
if (baselineArg && existsSync(baselineArg)) {
  baselineText = readFileSync(baselineArg, "utf8");
  baselineLabel = baselineArg;
} else if (baselineArg) {
  baselineText = execFileSync("git", ["show", `${baselineArg}:src/main.ts`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  baselineLabel = `git:${baselineArg}:src/main.ts`;
} else if (existsSync(fallbackBaseline)) {
  baselineText = readFileSync(fallbackBaseline, "utf8");
  baselineLabel = fallbackBaseline;
} else {
  console.error("No baseline. Pass --baseline <git-ref|file>, or keep outputs/build/backup/main.ts.pre-split in place.");
  process.exit(1);
}

// Normalise a statement to the thing we are comparing: its own code, independent
// of where it lives and of whether the extractor had to add an `export` prefix.
function normaliseStatement(statement, sourceFile) {
  return statement
    .getText(sourceFile)
    .replace(/\r\n/g, "\n")
    .replace(/^(?:\s*(?:export\s+default|export|declare)\b)+\s*/, "")
    .trim();
}

function collectStatements(text) {
  const sourceFile = ts.createSourceFile("bundle.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    const normalised = normaliseStatement(statement, sourceFile);
    if (!normalised) continue;
    found.set(normalised, (found.get(normalised) ?? 0) + 1);
  }
  return found;
}

const currentTexts = ["src/main.ts", "src/main-parts"]
  .flatMap((relative) => {
    const absolute = join(repoRoot, relative);
    if (relative.endsWith(".ts")) return [absolute];
    return readdirSync(absolute).filter((name) => name.endsWith(".ts")).map((name) => join(absolute, name));
  })
  .map((absolute) => readFileSync(absolute, "utf8"));

const before = collectStatements(baselineText);
let after = new Map();
for (const text of currentTexts) {
  for (const [statement, count] of collectStatements(text)) {
    after.set(statement, (after.get(statement) ?? 0) + count);
  }
}

const beforeTotal = [...before.values()].reduce((a, b) => a + b, 0);
const afterTotal = [...after.values()].reduce((a, b) => a + b, 0);
console.log(`baseline : ${baselineLabel}`);
console.log(`current  : src/main.ts + ${currentTexts.length - 1} file(s) under src/main-parts`);
console.log(`statements: ${beforeTotal} before, ${afterTotal} after\n`);

const missing = [];
const extra = [];
const differingCount = [];
for (const [statement, count] of before) {
  const other = after.get(statement) ?? 0;
  if (other === 0) missing.push(statement);
  else if (other !== count) differingCount.push(statement);
}
for (const [statement, count] of after) {
  if (!before.has(statement)) extra.push(statement);
}
const duplicateCount = [...after.entries()].filter(([, count]) => count > 1).length;

console.log(`missing after the split  : ${missing.length}`);
console.log(`newly present            : ${extra.length}`);
console.log(`duplicated in the result : ${duplicateCount}`);

const describe = (statement) => {
  const head = statement.split("\n")[0].slice(0, 90);
  return `    ${head}`;
};
if (missing.length) {
  console.log("\nmissing:");
  for (const statement of missing.slice(0, 10)) console.log(describe(statement));
}
if (extra.length) {
  console.log("\nnewly present:");
  for (const statement of extra.slice(0, 10)) console.log(describe(statement));
}

// A check that cannot fail is decoration: refuse to report success on an empty
// comparison, which is what a bad baseline or a stale backup would produce.
if (beforeTotal < 2000) {
  console.error(`\nBaseline looks wrong (only ${beforeTotal} statements); refusing to report equivalence.`);
  process.exit(1);
}
if (missing.length || extra.length || differingCount.length) {
  console.error("\nSplit is NOT equivalent: the source changed beyond relocation.");
  process.exit(1);
}
console.log(`\nEquivalent: all ${afterTotal} top-level statements are byte-identical to the baseline, none added or lost.`);
