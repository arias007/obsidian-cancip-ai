/**
 * Shared source-access layer for every verify script.
 *
 * Why this exists
 * ---------------
 * Before the main.ts split, 11 of the 12 verify scripts hard-coded
 * `readFile("src/main.ts")`. That made the gates depend on a *single file
 * layout*, in two different ways:
 *
 *   1. Coverage: after extracting code into a new module, a gate would read a
 *      much smaller main.ts and pass while checking nothing. Silent vacuity.
 *   2. Position: the `source.slice(source.indexOf(A), source.indexOf(B))` idiom
 *      silently degrades. If an anchor moves out of the file (or moves after
 *      its partner) `indexOf` returns -1 or swaps order, so the slice becomes
 *      "" or an unrelated span. `!span.includes(x)` then *passes* — the most
 *      dangerous outcome possible, because a broken gate reports green.
 *
 * So this module provides:
 *   - `loadMainBundle()`  — every source file reachable from src/main.ts via
 *     relative imports, i.e. exactly the input set of the main.js bundle. This
 *     keeps working automatically as files are split out, because a new module
 *     becomes reachable the moment main.ts imports it.
 *   - `loadAllSource()`   — the whole src tree, for gates that genuinely scan
 *     everything.
 *   - `requireSpan()`     — offset slicing that *asserts* both anchors exist,
 *     are ordered, and live in the same file. A moved anchor throws instead of
 *     yielding a quietly-empty span.
 *   - `requireIncludes` / `declarationText` — hard-failing lookups.
 *   - `assertSourceCoverage()` — anti-vacuity guard: proves the loader actually
 *     read the real tree before any gate is allowed to trust it.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function toPosix(p) {
  return p.split(sep).join("/");
}

/** Deterministically list every .ts file under src (sorted by repo-relative path). */
export function listSourceFiles(root = repoRoot) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(abs);
    }
  };
  walk(join(root, "src"));
  return out.map((abs) => toPosix(relative(root, abs))).sort();
}

const RELATIVE_IMPORT_RE = /(?:^|[\r\n;])\s*(?:import|export)\s[\s\S]*?from\s*["'](\.[^"']*)["']/g;
const SIDE_EFFECT_IMPORT_RE = /(?:^|[\r\n;])\s*import\s*["'](\.[^"']*)["']/g;

function relativeSpecifiers(text) {
  const found = new Set();
  for (const re of [RELATIVE_IMPORT_RE, SIDE_EFFECT_IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) found.add(m[1]);
  }
  return [...found];
}

function resolveSpecifier(fromPath, specifier, known) {
  const baseDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const joined = toPosix(join(baseDir, specifier));
  const candidates = [`${joined}.ts`, `${joined}/index.ts`, joined];
  return candidates.find((candidate) => known.has(candidate)) ?? null;
}

/**
 * Every src file reachable from an entry file by following relative imports,
 * in deterministic order with the entry first.
 */
export function reachableFiles(entryPath = "src/main.ts", root = repoRoot) {
  const all = listSourceFiles(root);
  const known = new Set(all);
  if (!known.has(entryPath)) throw new Error(`source-bundle: entry file not found: ${entryPath}`);
  const ordered = [];
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    ordered.push(path);
    const text = readFileSync(join(root, path), "utf8");
    for (const spec of relativeSpecifiers(text)) {
      const resolved = resolveSpecifier(path, spec, known);
      if (resolved) visit(resolved);
    }
  };
  visit(entryPath);
  return ordered;
}

function buildBundle(paths, root, label) {
  const files = [];
  let text = "";
  for (const path of paths) {
    const raw = readFileSync(join(root, path), "utf8");
    // Source files on this host are CRLF. The gates' anchors and regular
    // expressions are written against LF, so normalise once here and every
    // consumer (requireSpan included) sees the same text. Byte accounting below
    // still uses the on-disk size so the coverage floor stays meaningful.
    const content = raw.replace(/\r\n?/g, "\n");
    const start = text.length;
    // A single newline separator keeps offsets stable and never merges the last
    // line of one file into the first line of the next.
    text += content.endsWith("\n") ? content : `${content}\n`;
    files.push({ path, text: content, start, end: text.length, bytes: Buffer.byteLength(raw), crlf: raw.length !== content.length });
  }
  const bundle = {
    label,
    root,
    files,
    text,
    totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
    paths: files.map((f) => f.path),
    fileAt(offset) {
      for (const f of files) if (offset >= f.start && offset < f.end) return f;
      return null;
    },
    /** Text of the single file that owns `needle`; throws if absent or ambiguous across files. */
    fileTextFor(needle) {
      const owners = files.filter((f) => f.text.includes(needle));
      if (owners.length === 0) throw new Error(`${label}: required text not found in any source file: ${JSON.stringify(needle)}`);
      if (owners.length > 1) throw new Error(`${label}: required text found in ${owners.length} files (${owners.map((f) => f.path).join(", ")}); narrow the anchor: ${JSON.stringify(needle)}`);
      return owners[0];
    }
  };
  return bundle;
}

/** Source set that feeds the main.js bundle (src/main.ts plus everything it imports). */
export function loadMainBundle(root = repoRoot) {
  return buildBundle(reachableFiles("src/main.ts", root), root, "main-bundle");
}

/** Full src tree. */
export function loadAllSource(root = repoRoot) {
  return buildBundle(listSourceFiles(root), root, "all-source");
}

/**
 * Anti-vacuity guard. Proves the loader read the real tree before a gate trusts it.
 * Deliberately checks shape, not exact numbers, so ordinary edits do not break it
 * while a truncated/misrooted read fails loudly.
 */
export const COVERAGE = {
  minTotalBytes: 3_000_000,
  requiredFiles: ["src/main.ts"],
  requiredDeclarations: ["CancipPlugin", "CancipView", "CancipSettingTab"]
};

export function assertSourceCoverage(bundle, expected = COVERAGE) {
  if (!bundle || !Array.isArray(bundle.files) || !bundle.files.length) {
    throw new Error("assertSourceCoverage: bundle is empty or not a bundle");
  }
  for (const required of expected.requiredFiles) {
    if (!bundle.paths.includes(required)) {
      throw new Error(`assertSourceCoverage: ${bundle.label} is missing ${required} (read ${bundle.paths.length} file(s))`);
    }
  }
  if (bundle.totalBytes < expected.minTotalBytes) {
    throw new Error(
      `assertSourceCoverage: ${bundle.label} read only ${bundle.totalBytes} bytes, below the ${expected.minTotalBytes} floor. ` +
        `A gate must not run on a truncated source set.`
    );
  }
  for (const name of expected.requiredDeclarations) {
    if (!new RegExp(`\\bclass\\s+${name}\\b`).test(bundle.text)) {
      throw new Error(`assertSourceCoverage: ${bundle.label} does not declare class ${name}; the source set looks wrong`);
    }
  }
  return bundle;
}

/** Hard-failing `includes`: use for preconditions instead of `source.includes(x)`. */
export function requireIncludes(bundle, needle, what = "text") {
  if (!bundle.text.includes(needle)) {
    throw new Error(`${bundle.label}: required ${what} not found in the source set: ${JSON.stringify(needle)}`);
  }
  return true;
}

/**
 * Offset span between two anchors, replacing the fragile
 * `text.slice(text.indexOf(a), text.indexOf(b))` idiom.
 *
 * Guarantees, all of which the raw idiom silently violated:
 *   - both anchors exist (else throw)
 *   - `to` occurs after `from` (else throw, instead of yielding "")
 *   - both anchors live in the SAME source file (else throw)
 *
 * The same-file rule is the point of the whole exercise: if a refactor moves one
 * anchor into another module, the gate must be updated deliberately. It must
 * never quietly start measuring a different span.
 */
export function requireSpan(bundle, from, to, { label = "requireSpan", allowCrossFile = false } = {}) {
  const fromIndex = bundle.text.indexOf(from);
  if (fromIndex < 0) throw new Error(`${label}: start anchor not found: ${JSON.stringify(from)}`);
  const toIndex = bundle.text.indexOf(to, fromIndex + from.length);
  if (toIndex < 0) {
    throw new Error(`${label}: end anchor ${JSON.stringify(to)} not found after start anchor ${JSON.stringify(from)}`);
  }
  const fromFile = bundle.fileAt(fromIndex);
  const toFile = bundle.fileAt(toIndex);
  if (!allowCrossFile && fromFile && toFile && fromFile.path !== toFile.path) {
    throw new Error(
      `${label}: anchors span two files (${fromFile.path} → ${toFile.path}). ` +
        `Splitting source files must not silently change what this gate measures; ` +
        `update the anchor pair deliberately.`
    );
  }
  return bundle.text.slice(fromIndex, toIndex);
}

/**
 * "A appears before B" assertion.
 *
 * The raw idiom it replaces is `text.indexOf(a) < text.indexOf(b)`, which is
 * `true` whenever `a` is simply absent (`-1 < n` for any n >= 0). That turns a
 * missing anchor into a passing gate. Here a missing anchor throws.
 */
export function requireOrder(bundle, before, after, { label = "requireOrder" } = {}) {
  const beforeIndex = bundle.text.indexOf(before);
  if (beforeIndex < 0) throw new Error(`${label}: expected-earlier text not found: ${JSON.stringify(before)}`);
  const afterIndex = bundle.text.indexOf(after);
  if (afterIndex < 0) throw new Error(`${label}: expected-later text not found: ${JSON.stringify(after)}`);
  if (beforeIndex >= afterIndex) {
    throw new Error(`${label}: ordering violated — ${JSON.stringify(before)} (at ${beforeIndex}) does not precede ${JSON.stringify(after)} (at ${afterIndex})`);
  }
  return true;
}

/**
 * One class member's span: from its declaration to the start of the next member
 * at the same indentation. Replaces the dynamic
 * `text.slice(text.indexOf("private X"), text.indexOf("\n  private ", …))` idiom,
 * which yields "" (and therefore a vacuous `!includes` pass) when X is absent.
 */
export function memberSpan(bundle, memberNeedle, { label = "memberSpan", indent = "  " } = {}) {
  const start = bundle.text.indexOf(memberNeedle);
  if (start < 0) throw new Error(`${label}: class member not found: ${JSON.stringify(memberNeedle)}`);
  const nextIndex = bundle.text.indexOf(`\n${indent}private `, start + memberNeedle.length);
  const end = nextIndex < 0 ? bundle.text.length : nextIndex;
  if (end <= start) throw new Error(`${label}: empty span for ${JSON.stringify(memberNeedle)}`);
  return bundle.text.slice(start, end);
}

/**
 * Boolean form of the ordering check, for use inside named check expressions.
 *
 * Returns false when either anchor is missing, so a moved anchor fails the named
 * check instead of the raw idiom's `-1 < n` vacuous pass.
 */
export function isOrdered(bundle, before, after) {
  const beforeIndex = bundle.text.indexOf(before);
  const afterIndex = bundle.text.indexOf(after);
  if (beforeIndex < 0 || afterIndex < 0) return false;
  return beforeIndex < afterIndex;
}

/** Parse helper shared by gates that need the AST. */
export function createSourceFile(bundle, label = bundle.label) {
  const sf = ts.createSourceFile(label, bundle.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics.length) {
    throw new Error(`${label}: ${sf.parseDiagnostics.length} parse diagnostic(s)`);
  }
  return sf;
}

/**
 * Name of a top-level statement, covering the forms that do not carry `name`
 * directly (`const X = …` lives on the VariableStatement's declarationList).
 */
export function statementName(st, sf) {
  if (st.name && typeof st.name.getText === "function") return st.name.getText(sf);
  if (ts.isVariableStatement(st)) {
    const first = st.declarationList.declarations[0];
    if (first && first.name && ts.isIdentifier(first.name)) return first.name.text;
  }
  return "";
}

/**
 * Exact text of a top-level declaration by name, resolved through the AST rather
 * than string offsets. Works no matter which module the declaration lives in.
 */
export function declarationText(bundle, name, { kinds } = {}) {
  const sf = createSourceFile(bundle);
  for (const st of sf.statements) {
    if (statementName(st, sf) !== name) continue;
    if (kinds && !kinds.some((kind) => st.kind === kind)) continue;
    return bundle.text.slice(st.getStart(sf), st.getEnd());
  }
  throw new Error(`${bundle.label}: top-level declaration ${JSON.stringify(name)} not found`);
}

/** All top-level declarations, as {name, kind, text, file}. */
export function topLevelDeclarations(bundle) {
  const out = [];
  for (const file of bundle.files) {
    const sf = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const st of sf.statements) {
      out.push({
        name: statementName(st, sf),
        kind: ts.SyntaxKind[st.kind],
        text: file.text.slice(st.getStart(sf), st.getEnd()),
        file: file.path
      });
    }
  }
  return out;
}
