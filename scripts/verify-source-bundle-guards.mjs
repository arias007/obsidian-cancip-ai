import process from "node:process";
import ts from "typescript";
import {
  loadMainBundle,
  loadAllSource,
  assertSourceCoverage,
  requireSpan,
  requireIncludes,
  declarationText,
  declarationSourceText,
  createSourceFile,
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

// ------------------------------------------------- declarationSourceText
// These guards matter because the vm-sandbox verify scripts transpile extracted
// declarations with no module system. If the `export` modifier survives, the
// transpiled text grows an `Object.defineProperty(exports, ...)` prologue and the
// sandbox dies with "exports is not defined" - a failure that only appears after
// a declaration has moved out of main.ts.
function declarationNodeFor(name) {
  const sf = createSourceFile(main);
  for (const st of sf.statements) {
    const named = st.name && typeof st.name.getText === "function" ? st.name.getText(sf) : "";
    if (named === name) return { node: st, sf };
  }
  throw new Error(`no top-level declaration named ${name}`);
}

check("declarationSourceText strips the export modifier an extracted declaration carries", () => {
  // Verify the premise first: this declaration really is exported, so a no-op
  // implementation cannot pass this check by accident.
  const { node, sf } = declarationNodeFor("extractResponsesStreamDelta");
  if (!node.getText(sf).startsWith("export ")) throw new Error("expected an extracted (exported) declaration; premise not met");
  const text = declarationSourceText(node, sf);
  if (/^\s*(export|declare)\b/.test(text)) throw new Error(`modifier survived: ${text.slice(0, 40)}`);
  if (!/^\s*function\s+extractResponsesStreamDelta\b/.test(text)) throw new Error(`unexpected body start: ${text.slice(0, 60)}`);
});

check("transpiling a stripped extracted declaration emits no CommonJS prologue", () => {
  const { node, sf } = declarationNodeFor("extractResponsesStreamDelta");
  const emit = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  if (!emit(node.getText(sf)).includes("__esModule")) throw new Error("premise not met: the raw declaration did not produce a prologue");
  if (emit(declarationSourceText(node, sf)).includes("__esModule")) throw new Error("stripped declaration still emits the CommonJS prologue");
});

check("declarationSourceText leaves a non-exported declaration untouched", () => {
  const { node, sf } = declarationNodeFor("CancipSettingTab");
  if (declarationSourceText(node, sf) !== node.getFullText(sf)) throw new Error("non-exported declaration was modified");
});

check("declarationSourceText keeps leading comments and blank lines attached", () => {
  // Synthetic fixture: in the real bundle a declaration's leading trivia is
  // usually just blank lines, which cannot prove comments survive.
  const text = "/* keep me */\n\n/** doc for f */\nexport function f(): number {\n  return 1;\n}\n";
  const sf = ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = sf.statements[0];
  const stripped = declarationSourceText(node, sf);
  if (!stripped.startsWith("/* keep me */\n\n/** doc for f */\n")) throw new Error(`leading comments lost: ${JSON.stringify(stripped.slice(0, 60))}`);
  if (!stripped.includes("function f(): number")) throw new Error(`body not preserved: ${JSON.stringify(stripped)}`);
  if (/\bexport\b/.test(stripped)) throw new Error(`export survived: ${JSON.stringify(stripped)}`);
});

// ------------------------------------------- prompt policy must not pre-match
// The prompt assembler used to decide *which policy sections to send* by
// pattern-matching the user's own wording: the runtime-version line sat behind
// /cancip.{0,20}(version|版本)/, the automation block behind
// /自动化|定时|通知|automation|schedule|notification/, and the skill block behind a
// skill keyword. Any rephrasing silently dropped the policy, which is exactly why
// "换个问法就不会了". The rule now is: the model is given the ability to call tools
// and read/write files and decides what applies - the assembler must not predict.
//
// Text matching is not enough for the conditionality checks: the first draft used
// /if\s*\([^)]*\)\s*\{?\s*sections\.push\(/ against the old source, and `[^)]*`
// cannot span the `)` that closes `.test(prompt)`, so the check passed on code it
// was written to reject. Ancestors are read from the AST instead.
function methodPushes(source, methodName) {
  const sf = createSourceFile(source);
  let method = null;
  const visitMethods = (node) => {
    if (ts.isMethodDeclaration(node) && node.name && node.name.getText(sf) === methodName) method = node;
    ts.forEachChild(node, visitMethods);
  };
  visitMethods(sf);
  if (!method) throw new Error(`no method named ${methodName} in the bundle`);
  const pushes = [];
  const visitPushes = (node) => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "sections"
      && node.expression.name.getText(sf) === "push") {
      pushes.push(node);
    }
    ts.forEachChild(node, visitPushes);
  };
  visitPushes(method);
  return { sf, method, pushes };
}

function conditionalAncestor(node, stopAt) {
  let ancestor = node.parent;
  while (ancestor && ancestor !== stopAt) {
    if (ts.isIfStatement(ancestor) || ts.isConditionalExpression(ancestor) || ts.isCaseClause(ancestor)) return ancestor;
    ancestor = ancestor.parent;
  }
  return null;
}

const modePrompt = methodPushes(main, "modePrompt");

check("modePrompt does not select policy sections by pattern-matching the prompt", () => {
  const body = modePrompt.method.getText(modePrompt.sf);
  if (/\.test\(\s*prompt\s*\)/.test(body)) {
    throw new Error("modePrompt tests the raw prompt again - section selection must not depend on wording");
  }
  const gates = body.match(/\/[^/\n]{6,160}\/i?\.test\(/g) || [];
  if (gates.length) throw new Error(`modePrompt regained keyword gate(s): ${gates.join(" | ")}`);
});

check("the system prompt is constant: no classification-gated policy sections", () => {
  // The contract is four payload blocks (system prompt, global memory, session
  // history, latest user prompt). The system prompt may not grow or shrink with
  // how the user phrased the turn: policy prose lives in tool files
  // (cancip.tools.help / *.help / CANCIP_NAV.md), not in conditional injections.
  const bannedCalls = [
    "resourceRetrievalPolicyPrompt",
    "automationAgentPolicyPrompt",
    "skillRoutePolicyPrompt",
    "baseCapabilityPrompt",
    "scorePolicyPrompt",
    "nativeToolProtocolPrompt",
    "nativeFinalAnswerPrompt",
    "oneClickHtmlSystemPrompt",
    "liveStateRulePrompt",
    "directVaultFileAccessPrompt",
    "lightweightToolCatalogPrompt",
    "directVaultFileReadToolPrompt",
    "directVaultFileMutationToolPrompt",
    "vaultTargetOpenToolPrompt"
  ];
  const body = modePrompt.method.getText(modePrompt.sf);
  const back = bannedCalls.filter((name) => body.includes(`this.${name}`));
  if (back.length) throw new Error(`modePrompt regained classification-gated policy sections: ${back.join(", ")}`);
  if (modePrompt.pushes.some((call) => call.getText(modePrompt.sf).includes("Cancip runtime version"))) {
    throw new Error("the runtime version line is back - it belongs to tools.help, not the per-turn payload");
  }
});

check("the tool block and access mode are pushed unconditionally", () => {
  const toolPush = modePrompt.pushes.find((call) => call.getText(modePrompt.sf).includes("toolPrompt"));
  const accessPush = modePrompt.pushes.find((call) => call.getText(modePrompt.sf).includes("accessPrompt"));
  if (!toolPush) throw new Error("the constant tool block is missing");
  if (!accessPush) throw new Error("the access-mode block is missing");
  for (const push of [toolPush, accessPush]) {
    const gate = conditionalAncestor(push, modePrompt.method);
    if (gate) {
      throw new Error(`a must-send block is conditional again (line ${modePrompt.sf.getLineAndCharacterOfPosition(gate.getStart(modePrompt.sf)).line + 1})`);
    }
  }
});

// ------------------------------------------- pre-match capability machinery
// The plugin must reach capability by calling Obsidian's commands and reading and
// writing files, not by predicting from the prompt which reads to run. That family
// derived actions straight from the wording and pre-executed them; it is removed
// and must not come back. `bestSimpleVaultTargetCandidate`,
// `simpleVaultTargetHasAmbiguousExactMatches`,
// `shouldAnswerDirectlyFromProgrammaticReadOnly` and `programmaticMemoryReadActions`
// stay: they run only on actions that already executed, or resolve an
// obsidian.execute call from the args the model itself supplied.
const REMOVED_PREMATCH_METHODS = [
  "forceReadOnlyCapabilityDiscovery",
  "runProgrammaticImplementationFallback",
  "programmaticImplementationActionsForPrompt",
  "programmaticVaultOpenSelectionFollowupAction",
  "programmaticSimpleVaultTargetAction",
  "programmaticImplementationRouteDetail",
  "programmaticReadOnlyActionsForPrompt",
  "executeProgrammaticReadOnlyActions",
  "readOnlyCapabilityDiscoveryActions",
  "readOnlyActionStatus",
  "answerInformationTaskFromToolRuns",
  "readActiveFileFromCurrentViewIfUseful",
  "recentVaultOpenSelectionContext"
];

check("the prompt-pre-matching capability family has not been reintroduced", () => {
  const back = REMOVED_PREMATCH_METHODS.filter((name) => main.text.includes(name));
  if (back.length) throw new Error(`pre-match machinery is back: ${back.join(", ")}`);
});

check("the removed pre-match family is not advertised through the runtime test api", () => {
  const api = methodPushes(main, "installRuntimeTestApi");
  const body = api.method.getText(api.sf);
  const leaks = REMOVED_PREMATCH_METHODS.filter((name) => body.includes(name));
  if (leaks.length) throw new Error(`installRuntimeTestApi still binds: ${leaks.join(", ")}`);
});

for (const [status, name] of results) {
  if (status === "FAIL") console.error(`${status}  ${name}`);
  else console.log(`${status}  ${name}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
