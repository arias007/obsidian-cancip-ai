import process from "node:process";
import {
  loadMainBundle,
  loadAllSource,
  assertSourceCoverage,
  requireSpan,
  requireIncludes,
  declarationText,
  reachableFiles
} from "./lib/source-bundle.mjs";

let pass = 0;
let fail = 0;
const results = [];
function check(name, fn) {
  try {
    fn();
    pass += 1;
    results.push(["PASS", name]);
  } catch (error) {
    fail += 1;
    results.push(["FAIL", `${name} :: ${error && error.message}`]);
  }
}
function throws(fn) {
  try {
    fn();
  } catch {
    return true;
  }
  throw new Error("expected a throw, but nothing was thrown");
}

const main = assertSourceCoverage(loadMainBundle());
const all = assertSourceCoverage(loadAllSource());

console.log(`main-bundle: ${main.paths.length} file(s), ${main.totalBytes} bytes`);
for (const p of main.paths) console.log(`  - ${p}`);
console.log(`all-source : ${all.paths.length} file(s), ${all.totalBytes} bytes`);

check("main bundle starts at src/main.ts", () => {
  if (main.paths[0] !== "src/main.ts") throw new Error(`first file is ${main.paths[0]}`);
});

check("main bundle follows relative imports (agentBridge + reviewGate reachable)", () => {
  for (const expected of ["src/agentBridge.ts", "src/reviewGate.ts"]) {
    if (!main.paths.includes(expected)) throw new Error(`${expected} missing from main bundle`);
  }
});

check("main bundle excludes the separate worker entry point", () => {
  if (main.paths.includes("src/primeTtsWorker.ts")) {
    throw new Error("src/primeTtsWorker.ts is a separate esbuild entry point and must not be in the main bundle");
  }
});

check("all-source covers the worker entry point", () => {
  if (!all.paths.includes("src/primeTtsWorker.ts")) throw new Error("src/primeTtsWorker.ts missing from all-source");
});

check("reachableFiles is deterministic", () => {
  const a = reachableFiles("src/main.ts").join("|");
  const b = reachableFiles("src/main.ts").join("|");
  if (a !== b) throw new Error("two runs disagreed");
});

// ---------------------------------------------------------------- guard bites
check("coverage guard rejects a truncated source set", () => {
  throws(() => assertSourceCoverage({ label: "fake", paths: ["src/main.ts"], files: [{ path: "src/main.ts", text: "x", start: 0, end: 1 }], totalBytes: 1, text: "x" }));
});

check("coverage guard rejects a set whose core classes vanished", () => {
  throws(() =>
    assertSourceCoverage({
      label: "fake",
      paths: ["src/main.ts"],
      files: [{ path: "src/main.ts", text: "y".repeat(4_000_000), start: 0, end: 4_000_000 }],
      totalBytes: 4_000_000,
      text: "y".repeat(4_000_000)
    })
  );
});

check("requireSpan rejects a missing start anchor (raw indexOf would slice from -1)", () => {
  throws(() => requireSpan(main, "class NoSuchClass", "class CancipView"));
});

check("requireSpan rejects a missing end anchor (raw indexOf would slice to -1)", () => {
  throws(() => requireSpan(main, "class CancipView", "class NoSuchClass"));
});

check("requireSpan rejects reversed anchors (raw slice would silently return empty)", () => {
  throws(() => requireSpan(main, "class CancipSettingTab", "class CancipView"));
});

check("requireSpan rejects anchors that live in two different files", () => {
  throws(() => requireSpan(main, "class CancipPlugin", "export function registerBridgeHost"));
});

check("requireIncludes rejects absent text", () => {
  throws(() => requireIncludes(main, "__definitely_not_present__"));
});

check("declarationText rejects an absent declaration", () => {
  throws(() => declarationText(main, "NoSuchDeclaration"));
});

// ------------------------------------------------- equivalence with the old idiom
check("requireSpan matches the legacy indexOf/slice result for a real anchor pair", () => {
  const legacy = main.text.slice(main.text.indexOf("class CancipDocumentWorkbenchView"), main.text.indexOf("class CancipReviewLeafView"));
  const modern = requireSpan(main, "class CancipDocumentWorkbenchView", "class CancipReviewLeafView");
  if (legacy !== modern) throw new Error(`legacy ${legacy.length} chars vs requireSpan ${modern.length} chars`);
  if (!modern.includes("CancipDocumentWorkbenchView")) throw new Error("span does not contain its own start anchor");
});

check("declarationText returns an exact class body", () => {
  const decl = declarationText(main, "CancipSettingTab");
  if (!decl.startsWith("class CancipSettingTab")) throw new Error(`unexpected start: ${decl.slice(0, 40)}`);
  if (decl.length < 10000) throw new Error(`suspiciously short (${decl.length} chars)`);
});

for (const [status, name] of results) {
  if (status === "FAIL") console.error(`${status}  ${name}`);
  else console.log(`${status}  ${name}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
