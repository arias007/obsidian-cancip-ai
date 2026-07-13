import { readFile } from "node:fs/promises";
import process from "node:process";
import ts from "typescript";

const requiredCoreMethods = [
  "addSiblingUiButton",
  "executeCustomUiButtonRule",
  "installButtonEditLongPress",
  "openButtonEditModal",
  "startUiButtonSortMode",
  "uiButtonClipboardPayload"
];

// These methods exist in the released 2.2.9 runtime but were never committed
// to src/main.ts. Keep builds blocked until their behavior is restored in source.
const runtimeOnly229Methods = [
  "allReviewGatePackagePaths",
  "applyUiButtonHiddenRulesFast",
  "applyUiButtonHiddenRulesForMutations",
  "buildVaultCurationScanPack",
  "clearStaleUiRuleHiddenMarks",
  "closeDuplicateReviewLeaves",
  "compactProcessSummary",
  "enhanceRenderedCodeBlocks",
  "enhanceRenderedMarkdown",
  "installSrPdfToolbarPatch",
  "installSrReviewBlankTabGuard",
  "isCurrentRender",
  "isForcedVisibleStatusBarTarget",
  "listReviewGateCandidates",
  "livePendingReviewGateItems",
  "markSrReviewTabIntent",
  "markStaleReviewGateItems",
  "markSupersededReviewGateItems",
  "migrateLegacyReviewLeaves",
  "preflightAutomationRun",
  "reconcileAutomationStateFile",
  "reconcileCancipSharedState",
  "reconcileReviewGatePackages",
  "reconcileSessionHistoryIndexFromVault",
  "recordAutomationExperience",
  "renderPendingReviewGateList",
  "repairSrReviewBlankTab",
  "restoreForcedStatusBarDom",
  "reviewGateItemHasNewerPendingItem",
  "reviewGateItemLivePendingState",
  "reviewGateItemWithOldestPendingBaseline",
  "reviewGateManifestItemsForPath",
  "shouldGroupProcessRecord",
  "syncStatusBarEntry",
  "uiRuleScopeRoot"
];

const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("src/main.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
if (ast.parseDiagnostics.length) {
  throw new Error(`src/main.ts has ${ast.parseDiagnostics.length} parse diagnostic(s)`);
}

const methods = new Set();
const visit = (node) => {
  if (ts.isMethodDeclaration(node) && node.name) methods.add(node.name.getText(ast));
  ts.forEachChild(node, visit);
};
visit(ast);

const required = [...requiredCoreMethods, ...runtimeOnly229Methods];
const missing = required.filter((name) => !methods.has(name));
const result = {
  sourceMethodCount: methods.size,
  requiredMethodCount: required.length,
  restoredMethodCount: required.length - missing.length,
  missing
};

if (missing.length) {
  console.error(JSON.stringify(result, null, 2));
  console.error("Build blocked: restoring the released 2.2.9 runtime behavior to TypeScript is incomplete.");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result, null, 2));
}
