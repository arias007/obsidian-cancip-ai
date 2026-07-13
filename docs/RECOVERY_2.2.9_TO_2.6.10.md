# Cancip 2.8.0 Recovery Baseline

## Source of truth

- Recovery base: tag `2.2.9`, commit `65ed357c0be2c31fb8eba52930bb76649175b739`.
- The `2.2.9` TypeScript tree is the last large maintainable source before the catastrophic `2.6.10` replacement. `src/main.ts` has 38,795 lines and contains the full button editor, long-press registration, sorting, clipboard migration, custom sibling buttons, and rule matching code.
- It is not an exact source copy of the released `2.2.9` runtime. A clean build from that source reproduces the `2.1.9` `main.js` exactly, while the released `2.2.9` runtime contains 35 additional hot-patched methods.
- New recovery branch: `codex/2.8.0-recovery`.
- Immutable source archive: `C:/Users/35007/Documents/Codex/backups/cancip-source-2.2.9-65ed357-20260713.zip`.
- Source archive SHA256: `AAC009E30E42B2161CFE255517DFBB4E22ED453AB389279B6C8CEEB205A346A3`.
- Runtime patch-chain archive: `C:/Users/35007/Documents/Codex/backups/cancip-runtime-patch-chain-2.5.4-to-2.6.10-20260713.zip`.
- Patch-chain archive SHA256: `7ACD20FA4A09D1393A34FA8E73EBA29B09C7168B813BD2759FDFDCC5BB1765FA`.
- Closest recovered source candidate found later: `C:/Users/35007/Documents/Codex/github-staging/cancip-2.3.9-skills`, dirty worktree manifest `2.5.3`.
- Closest source candidate archive: `C:/Users/35007/Documents/Codex/backups/cancip-source-2.5.3-dirty-near-2.6.10-20260713.zip`.
- Closest source candidate SHA256: `EAD0732DE06CC79B23551EF2F520A61DB5DD9E7BC30FC19FCA57B21E17A41FBD`.

## Why 2.6.10 is not a valid source base

The `2.6.10` release commit replaced the complete source instead of carrying it forward:

- Parent `2.2.9` `src/main.ts`: 38,795 lines.
- Tagged `2.6.10` `src/main.ts`: 22,681 lines.
- Release commit source delta: 10,890 added lines and 28,002 deleted lines.
- The tagged `2.6.10` source does not contain `openButtonEditModal`, `installButtonEditLongPress`, or the other complete button-management implementation.
- The tagged `2.6.10` release `main.js` does contain those methods, and the smoke tests call them.

Therefore the released runtime and committed source diverged. Rebuilding from the tagged `2.6.10` source necessarily removes runtime-only features.

## Source parity history

- `2.1.1`: source and released runtime method sets match.
- `2.1.9`: source and released runtime method sets match; this is the last verified source-synchronized release.
- `2.2.9`: source has 1,068 named methods; released runtime has 1,103. The release changed only built `main.js`/`styles.css`, not TypeScript.
- A clean build from the `2.2.9` source produces the exact `2.1.9` `main.js` Git blob `c5440eb495ebc052f6fb021efe9d37fcefa5f97f`.
- `2.6.10`: committed source has only 603 named methods while the released runtime has 1,153; 576 runtime methods are absent from the tagged source and 26 source methods are absent from the runtime.
- Local dirty `cancip-2.3.9-skills` worktree: manifest `2.5.3`, source has 1,114 named methods. Compared with the released `2.6.10` runtime, only 39 runtime methods are absent and there are zero extra source methods. This is the closest recovered TypeScript source candidate, but it is still not a complete `2.6.10` source.

The `2.8.0` recovery tree therefore preserves the released `2.2.9` runtime files and blocks normal builds until the runtime-only behavior has been restored to TypeScript.

## Closest recovered source candidate

The best local candidate is no longer the tagged `2.2.9` source. A later dirty worktree exists at:

`C:/Users/35007/Documents/Codex/github-staging/cancip-2.3.9-skills`

Important facts:

- Branch: `codex/2.3.9-builtin-skills`.
- Last commit: `9303d04 Migrate Cancip automation improvements`.
- Working tree is dirty and must be preserved.
- Committed `9303d04` manifest is `2.4.1` with 1,073 source methods.
- Dirty worktree manifest is `2.5.3` with 1,114 source methods.
- Released `2.6.10` runtime has 1,153 methods.
- Dirty `2.5.3` source is missing 39 methods from the released `2.6.10` runtime and has no extra methods compared with that runtime.

This candidate should be evaluated as the practical migration base before starting from `2.2.9`. The remaining 39 methods can be ported from the preserved `2.5.4 -> 2.6.10` runtime patch chain.

Missing from the closest source candidate compared with released `2.6.10` runtime:

`applyUiButtonRuleToElement`, `applyUiButtonRulesInternal`, `applyUiButtonRulesToMutationRecords`, `applyUiButtonRulesToMutationRecordsInternal`, `cachedPendingReviewGateItemPaths`, `cachedReviewGatePackage`, `clearUiButtonRuleApplyTimer`, `clearUiRuleMarksInDocument`, `curationAutomationActionGate`, `currentSessionTimeline`, `currentTurnNeedsVisibleFinal`, `displayCommonSettings`, `driveStructuredFinal`, `ensureCurrentSessionTimelineStatus`, `excludeAiCreatedReviewItemsFromVaultCuration`, `invalidateReviewGateSnapshot`, `liveChangedFileEntries`, `liveChangedFileTotals`, `meaningfulProcessBlocks`, `migrateHiddenReviewGatesToVisible`, `migrateVisibleExportJsonToHidden`, `openLiveFilesMenu`, `playEnglishTtsPartIfAvailable`, `prewarmReviewGateData`, `processStepDetailText`, `processStepHeadline`, `refreshChatViewsForSession`, `renderHeaderLiveStatus`, `reviewGateSnapshot`, `setStatusBarStylesIfChanged`, `toggleLiveFilesMenu`, `uiButtonDocuments`, `uiButtonIdentityForElement`, `uiButtonMenuGroupGuardForElement`, `uiButtonRuleMatchesElement`, `uiButtonViewTypeForTarget`, `updateMobileStatusBarMetrics`, `vaultCurationPreflight`, and `visibleFinalAssistantForMessages`.

### Runtime-only methods already present in released 2.2.9

The first recovery batch is the following 35 methods:

`allReviewGatePackagePaths`, `applyUiButtonHiddenRulesFast`, `applyUiButtonHiddenRulesForMutations`, `buildVaultCurationScanPack`, `clearStaleUiRuleHiddenMarks`, `closeDuplicateReviewLeaves`, `compactProcessSummary`, `enhanceRenderedCodeBlocks`, `enhanceRenderedMarkdown`, `installSrPdfToolbarPatch`, `installSrReviewBlankTabGuard`, `isCurrentRender`, `isForcedVisibleStatusBarTarget`, `listReviewGateCandidates`, `livePendingReviewGateItems`, `markSrReviewTabIntent`, `markStaleReviewGateItems`, `markSupersededReviewGateItems`, `migrateLegacyReviewLeaves`, `preflightAutomationRun`, `reconcileAutomationStateFile`, `reconcileCancipSharedState`, `reconcileReviewGatePackages`, `reconcileSessionHistoryIndexFromVault`, `recordAutomationExperience`, `renderPendingReviewGateList`, `repairSrReviewBlankTab`, `restoreForcedStatusBarDom`, `reviewGateItemHasNewerPendingItem`, `reviewGateItemLivePendingState`, `reviewGateItemWithOldestPendingBaseline`, `reviewGateManifestItemsForPath`, `shouldGroupProcessRecord`, `syncStatusBarEntry`, and `uiRuleScopeRoot`.

## Search results

- GitHub branches checked: `main`, `codex/2.7.0-review-fixes`.
- GitHub tags and commit history checked back through the button-management versions.
- GitHub Actions artifacts: zero retained artifacts.
- Local Cancip Git object database: no unreachable commits containing another source tree.
- Local Codex workspace, Desktop, Downloads, and `D:/share`: no complete `2.6.10` TypeScript source found. However, `C:/Users/35007/Documents/Codex/github-staging/cancip-2.3.9-skills` contains the closest recovered dirty `2.5.3` TypeScript source candidate.
- Local `work/cancip-2.5.4` through `work/cancip-2.6.10`: no TypeScript source, but the sequential runtime patch scripts, version tests, screenshots, README, and final runtime are preserved.

## Functional improvements after 2.2.9

The entries below are confirmed from the released runtime, sequential patch scripts, regression tests, and README. They are migration requirements for 2.8.0, not claims that the tagged `2.6.10` TypeScript source is complete.

### 2.2.9 to 2.5.4 runtime line

1. Mobile composer and `@` popup track the Android visual keyboard and adapt popup height to available space.
2. `@` discovery includes files, folders, Skills, automations, plugins, attachments, tools, Cancip functions, command-bus entries, and Obsidian commands.
3. Review layout reserves the mobile status bar and renders structure changes as a compact type plus `old -> new` route.
4. New-file curation targets manually created Markdown, excludes AI-created review items, skips clean notes, and only proposes reciprocal links for strongly related unlinked notes.
5. AI Vault mutations are captured into Review Gate items; failed review registration can roll back unregistered AI changes.
6. Status-bar visibility gains a mutation guard and forced-visibility recovery.
7. Spaced Repetition review gains Pdftion bridge helpers, PDF resolution, and review-queue command repair.
8. Multiple Cancip views gain per-session request ownership and additional-view session opening.
9. Memory Dream and completed-workflow experience harvesting gain local source packs and compact summaries.

### 2.5.5

1. Model responses use hidden structured `continue` or `final` control metadata instead of semantic guessing from prose.
2. Complex tool and automation turns cannot close on a preparation plan or process-only response.
3. Structured-final correction retries are bounded, and false completion remains resumable.
4. New daily automations wait until the next day when created after today's scheduled time, while genuinely missed runs can catch up.
5. Elapsed time, token usage, changed-file links, and verification remain programmatic.

### 2.5.6

1. Empty `@` results interleave categories so Skills cannot crowd out files, plugins, commands, and automations.
2. Selected mentions become editable and removable context chips rather than opaque inline tokens.
3. Mobile mention/composer positioning follows the active WebView viewport.
4. Session history reads before replacing rows, preserves the visible list during refresh, lazy-loads batches, sorts pinned sessions first, and shows loaded/total counts.
5. Process and raw model context remain traceable without occupying the first-level answer surface.

### 2.5.7

1. Live plan and changed-file totals move beside the Cancip title and open detailed panels.
2. Changed files are deduplicated, bounded, show added/removed lines, and open directly in the Vault.
3. One first-level process record keeps readable progress visible while raw sent/received payloads, tool JSON, and audits remain folded.
4. Empty audit sections and leaked markup/truncation text are filtered structurally.
5. Advanced settings become horizontal peer pages instead of a collapsing advanced accordion.
6. New chat renders and focuses immediately, then persists the previous session in the background.
7. Verified multi-action workflows can be harvested into reusable experience Skills.

### 2.5.8

1. Visible final-answer closure retries up to five times; missing closure cannot be stored as success.
2. Running and completed session state broadcasts across open Cancip views and restores correctly when brought to the foreground.
3. Stale or detached background work remains resumable when no visible final answer exists.
4. PrimeTTS separates display text from spoken text, preserves displayed digits, converts spoken numbers, keeps Chinese words and adjacent English phrases intact, routes English chunks to a system English voice, and widens look-ahead decoding.
5. Button rules gain modification time, recent-first settings order, view/command/icon/target identity, Markdown-view narrowing for legacy broad menu rules, and stronger hidden-display enforcement.

### 2.5.9

1. Sessions gain normalized creation, activity, start, completion, stop, and failure timestamps.
2. History, commands, event audit, parent/child rows, and exports use the same timeline data.
3. Legacy sessions recover only timestamps supported by stored data or a valid session id.
4. Review view activation recovers deferred leaves, reuses rendered content, verifies mobile tab selection, and avoids rescanning the same package.
5. Synced review packages shadow same-name legacy packages and merge pending decisions without duplicates.
6. Paired review panes synchronize vertically on mobile and horizontally on desktop.

### 2.6.0

1. New-file curation performs a programmatic preflight and skips empty, clean, short, or merely cosmetic candidates without an API request.
2. Summary work is restricted to long notes; missing H1 alone is not a defect.
3. API curation batches are capped at four meaningful candidates with bounded source text; deferred candidates stay queued.
4. Curation runs in an isolated session with a stable minimal prompt and rejects whitespace, punctuation, blank-line, heading-marker, and other cosmetic-only writes at execution time.
5. Review status, list, and view share one deduplicated snapshot with an in-flight promise, bounded TTL, prewarming, and unchanged-DOM suppression.
6. Status refreshes are coalesced and the fallback visibility interval is slowed.
7. Keyboard overlap uses the chat host plus active WebView viewport; review clearance uses measured mobile status-bar height.

### 2.6.1 to 2.6.7 button-rule hardening

1. `2.6.1`: newly mounted detached menus receive an immediate frame pass and one trailing pass; Cancip-created nodes cannot cause a self-loop; same-name items are separated by stable menu-group identity.
2. `2.6.2`: observers, cleanup, selector lookup, and view identity cover every live Obsidian document/WebView and deduplicate cross-document results.
3. `2.6.3`: observers and timers are owned per live WebView, discover new WebViews after layout changes, and avoid stale-window timers.
4. `2.6.4`: internal rule mutations cannot recursively trigger observer work.
5. `2.6.5`: observer suspension is structural and restored safely after rule application.
6. `2.6.6`: menu insertions apply only to added subtrees; full refreshes cache selector candidates while preserving hide, sort, rename, icon, and exact identity behavior.
7. `2.6.7`: mutation filtering watches actual editable buttons, menu items, status items, and tab headers while ignoring unrelated body/container churn.

### 2.6.8

1. Review lists filter Cancip's own review/export artifacts and stale internal files.
2. Mobile review tree and detail panels remain independently scrollable above the status bar.
3. Keyboard positioning combines visual-viewport shrinkage with direct footer overlap and retries through Android keyboard animation.
4. History omits redundant created/activity rows, while individual messages show exact timestamps.
5. Only the current running turn auto-expands; raw details stay folded and generic progress filler is excluded from visible process/final content.

### 2.6.9

1. Review JSON/JSONL defaults to hidden `.cancip/review-gates` storage.
2. Startup migrates legacy visible review JSON into hidden storage and removes only safely migrated internal files.
3. Legacy visible review paths canonicalize to hidden paths so old approvals and sessions remain usable.
4. Human Markdown session exports stay visible while machine JSON moves to `.cancip/exports`.

### 2.6.10

1. Conversation times show local seconds without a timezone suffix.
2. Composer geometry records visual-viewport bottom, left, and right offsets and fixes the focused footer above the Android keyboard.
3. Review shell reserves mobile status-bar clearance; file tree, diff body, and detail rail own vertical scrolling.

## Runtime method inventory

- Named class methods in released `2.2.9` runtime: 1,103.
- Named class methods in tagged `2.2.9` TypeScript: 1,068.
- Named class methods in the audited clean source build: 1,068, exactly matching released `2.1.9` rather than released `2.2.9`. That audit artifact was not retained as the release output; `outputs/cancip` was restored to the original `2.2.9` runtime afterward.
- Named class methods in released `2.6.10` runtime: 1,153.
- The `2.6.10` runtime contains 50 net additional named methods, including final-control, review-cache, live-file, multi-WebView button-rule, timeline, mobile-layout, and curation-preflight helpers.
- Some `2.2.9` methods disappear by `2.6.10` because behavior was refactored or replaced. These must be mapped before migration rather than blindly copied or deleted.

High-risk replacement areas include Review Gate reconciliation, automation-state reconciliation, explicit curation scope, status-bar DOM restoration, Markdown/code enhancement, process grouping, and fast hidden-button paths.

## Migration rule for 2.8.0

1. Prefer evaluating the dirty `2.5.3` source candidate as the new editable recovery base because it is much closer to the released `2.6.10` runtime than tagged `2.2.9`.
2. If the dirty `2.5.3` candidate cannot be stabilized, fall back to the tagged `2.2.9` source plus the existing parity guard.
3. Restore the remaining runtime-only methods and related CSS from the preserved `2.5.4 -> 2.6.10` patch chain into TypeScript/CSS.
4. Recreate each version's regression checks against source-built output.
5. Build after every group and compare required runtime methods and user-visible behavior.
6. Keep `npm run build` guarded by `verify:source-parity` until the known runtime-only method set is restored.
7. Never patch or treat minified `main.js` as the authoritative source again.
8. Do not call a release source-complete unless a clean checkout builds the same feature inventory that the release tests require.
