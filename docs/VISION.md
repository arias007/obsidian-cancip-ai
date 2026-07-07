# Cancip Vision

Cancip is intended to become a mobile-first Codex for an Obsidian vault.

The key boundary is deliberate: Cancip should control the vault, not the whole
device. That keeps the risk much lower than a general remote-desktop assistant
while preserving most of the value users want from Codex-style software work:
reading context, editing files, managing projects, building plugins, using
GitHub, and keeping an auditable trail.

## Product Position

Cancip should feel like Codex on a phone, scoped to one Obsidian vault.

It should be able to:

- Understand and search the whole vault.
- Read, write, create, rename, and organize vault files through validated
  vault-relative actions.
- Maintain project memory in `.cancip/` and selected core-memory folders.
- Manage GitHub repositories when the user configures credentials or tokens.
- Build, adapt, install, and package Obsidian plugins.
- Prefer source-level plugin changes when source is available.
- Patch built plugin JavaScript only as a fallback, with clear audit notes.

It should not try to:

- Control the whole phone or computer.
- Become a remote desktop system.
- Silently delete, move, or publish important data without a reviewable action
  record.

## Frontend Direction

Cancip should absorb the useful parts of Smart Composer and Codex.

From Smart Composer:

- Obsidian-native right-side chat panel.
- Current-file context chips.
- Vault Chat / file mention workflow.
- Compact mobile composer.
- Tool visibility and quick context controls.
- Obsidian Markdown rendering and link-aware output.

From Codex:

- Session and project list.
- Access mode selector.
- Plan mode.
- Action review and execution transparency.
- A focused composer with model, reasoning, image, tools, and project controls.
- Clear status while the agent is reading, planning, editing, building, or
  waiting for approval.

The first screen should be the actual working chat experience, not a landing
page.

## Backend Direction

Cancip should become a local-first agent runtime inside the vault.

It should absorb these ideas:

- Codex: project-scoped configuration, tool execution, approval modes, and
  action logs.
- Claude Code-style agents: code edits, patch review, build/test loops, and
  source-aware refactoring.
- OpenClaw-style routing: named tools, explicit capabilities, and lightweight
  workflow dispatch.
- Hermes-style memory/workflows: durable memory files, reusable workflows, and
  low-friction context recall.

The backend should be split into small capabilities instead of one vague
super-tool:

- `vault`: read/write/list/search vault files.
- `memory`: manage `.cancip/` and core memory.
- `github`: repo status, diff, branch, commit, push, release, issue, PR.
- `plugin`: inspect, adapt, build, package, and install Obsidian plugins.
- `rag`: local lightweight indexing and retrieval.
- `audit`: record actions, approvals, diffs, and outputs.

## Self-Improvement Loop

Cancip should grow toward solving most ordinary Obsidian problems on its own.
The practical target is that roughly 80% of vault management, plugin command,
search, memory, attachment, review, automation, and source-editing requests can
be routed, attempted, verified, and summarized without handing the task back to
another desktop agent.

That requires a closed loop, not just more prompt text:

- Keep reusable smoke/regression cases for prompt economy, memory routing,
  command execution, plugin discovery, approvals, review-gate behavior, and
  mobile UI paths.
- Treat `npm run verify` as the core gate before committing runtime or prompt
  changes.
- Keep heavy mobile UI/button tests isolated from the core gate so one
  WebView/eval timeout does not hide unrelated regressions.
- Write a latest machine-readable smoke report so Cancip, a subagent, or a
  desktop agent can resume from the smallest failing case.
- When a failure repeats, turn the fix into a programmatic case instead of
  relying only on memory or instructions.

## GitHub Scope

Cancip should manage GitHub from the phone when configured:

- Check repo status.
- Read issues, PRs, releases, and workflow results.
- Create branches and commits.
- Push changes after approval or in full-access mode when policy allows.
- Create issues and PRs.
- Package and publish Obsidian plugin releases.

GitHub secrets must stay outside normal chat output. Tokens should live in
vault-local config or a safer platform store, and UI should show only whether a
credential is present.

## Plugin Builder Scope

Cancip should make plugin development possible from mobile.

Preferred path:

1. Work from source.
2. Modify TypeScript/CSS/manifest files.
3. Run check/build scripts through an approved tool route.
4. Install the built plugin into the vault.
5. Restart/reload Obsidian when needed.
6. Keep backups and hashes.

Fallback path:

1. Inspect built `main.js`, `styles.css`, and `manifest.json`.
2. Apply small targeted patches to built files.
3. Record that the change was made at build-output level.
4. Prefer reconstructing or finding source later.

## Safety Model

Cancip should keep two modes:

- `ask-for-approval`: default; actions are proposed and summarized before
  execution.
- `full-access`: can execute implemented tool actions across the vault and
  configured project folders, but actions remain logged and path-validated.

Even in `full-access`, high-risk operations should be explicit in the audit
trail:

- Deletes.
- Bulk moves/renames.
- Git push/release.
- Secret/config changes.
- Plugin installation over an existing plugin.
- Any operation outside the vault or configured project workspace.

The important design point is not "no power"; it is "power inside a clear,
auditable boundary."

## Near-Term Milestones

1. Render chat as Obsidian Markdown.
2. Add Codex-like composer controls: model, access mode, plan mode, tools,
   image, current project.
3. Add durable chat sessions under `.cancip/sessions/`.
4. Add action log under `.cancip/logs/`.
5. Add explicit GitHub config and read-only repo status.
6. Add plugin source workspace registration.
7. Add source build/package/install workflow.
8. Add GitHub branch/commit/push workflow with approval gates.
9. Add lightweight local RAG index that can be rebuilt on mobile.
