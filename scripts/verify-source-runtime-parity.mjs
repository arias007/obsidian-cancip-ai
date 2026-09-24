import { readFile } from "node:fs/promises";
import process from "node:process";
import ts from "typescript";
import { assertSourceCoverage, loadMainBundle } from "./lib/source-bundle.mjs";

// Covers every source file reachable from src/main.ts, so extracting a class into
// its own module keeps it inside the protected inventory instead of looking
// "missing from source".
const bundle = assertSourceCoverage(loadMainBundle());
const sourceText = bundle.text;
const runtimeText = await readFile(new URL("../outputs/cancip/main.js", import.meta.url), "utf8");

// Floor guard: an unparsable or empty build artifact would otherwise report zero
// missing methods and let the build through while checking nothing.
const RUNTIME_METHOD_FLOOR = 2000;

function namedMethods(text, kind, label) {
  const ast = ts.createSourceFile(label, text, ts.ScriptTarget.Latest, true, kind);
  if (ast.parseDiagnostics.length) {
    throw new Error(`${label} has ${ast.parseDiagnostics.length} parse diagnostic(s)`);
  }
  const methods = new Set();
  const visit = (node) => {
    if (ts.isMethodDeclaration(node) && node.name) methods.add(node.name.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return methods;
}

const sourceMethods = namedMethods(sourceText, ts.ScriptKind.TS, "main-bundle sources");
const runtimeMethods = namedMethods(runtimeText, ts.ScriptKind.JS, "outputs/cancip/main.js");

if (runtimeMethods.size < RUNTIME_METHOD_FLOOR) {
  console.error(`Build blocked: runtime method inventory is only ${runtimeMethods.size}, below the ${RUNTIME_METHOD_FLOOR} floor — the build artifact is empty or unparsable.`);
  process.exit(1);
}

const intentionallyRemovedRuntimeMethods = new Set([
  "applyPersonalizedDiaryButtons",
  "activateNativeNoteDrawSurface",
  // Dropped on purpose: the per-turn workspace snapshot was replaced by the base
  // capability block plus on-demand obsidian.tabs / obsidian.currentView calls.
  // Keeping the snapshot method would re-create the payload it was removed for.
  "buildWorkspaceStateContext",
  "callChoiceSuggestionModel",
  "clearPersonalizedDiaryButtons",
  "close",
  "createPlanButton",
  "createNoteDrawWorkbenchStage",
  "deterministicChoiceOptionsForMessage",
  "expandExchangeAuditStep",
  "ensureModelChoiceOptions",
  "findPendingReviewBaselineItem",
  "globalFinalAnswerTemplatePrompt",
  "hydrateSubagentCards",
  "insertContextEditClipboardText",
  "insertPersonalizedDiary",
  "installReviewTreeTouchScroll",
  "isNativeSelectionToolbarProtected",
  "lightweightCapabilityPolicyPrompt",
  "noteDrawControllerForStage",
  "noteDrawRuntime",
  "prewarmBuiltinPrimeTts",
  "reviewGateTerminalDecisionPaths",
  "renderReviewBlockControls",
  "schedulePersonalizedDiaryButtons",
  "scheduleNativeNoteDrawSurfaceSync",
  "scheduleBuiltinPrimeTtsWarmup",
  "shouldGenerateModelChoiceOptions",
  "shouldPreferPluginDataSettings",
  "syncNativeNoteDrawSurface"
]);
const removedFromRuntime = [...runtimeMethods]
  .filter((name) => intentionallyRemovedRuntimeMethods.has(name) && !sourceMethods.has(name))
  .sort();
const missingFromSource = [...runtimeMethods]
  .filter((name) => !sourceMethods.has(name) && !intentionallyRemovedRuntimeMethods.has(name))
  .sort();
const extraInSource = [...sourceMethods].filter((name) => !runtimeMethods.has(name)).sort();
const result = {
  sourceMethodCount: sourceMethods.size,
  runtimeMethodCount: runtimeMethods.size,
  missingFromSourceCount: missingFromSource.length,
  extraInSourceCount: extraInSource.length,
  intentionallyRemovedRuntimeMethodCount: removedFromRuntime.length,
  missingFromSource,
  extraInSource,
  intentionallyRemovedRuntimeMethods: removedFromRuntime
};

if (missingFromSource.length) {
  console.error(JSON.stringify(result, null, 2));
  console.error("Build blocked: TypeScript source does not yet cover the protected runtime feature inventory.");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result, null, 2));
}
