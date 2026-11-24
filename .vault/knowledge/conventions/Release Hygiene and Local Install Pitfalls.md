---
type: convention
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-0jlx
created: 2026-11-24
---
# Release Hygiene and Local Install Pitfalls

Category: Process / Tooling. Evidence: session signals around 0.3.2 and 0.3.3, VYSL-0jlx retro.

## Run the full suite before every publish, docs-only included
- A docs-only copyedit of package.json descriptions broke a test that pins them verbatim. 0.3.2 shipped with that test red because the dispatcher published without running the suite.
- Rule: before any vsce publish run a clean build then the full suite: `rm -rf out dist && npm test`. No exemption for docs-only changes. Any change to a pinned string (package.json description, README-derived text) must update the pinning test in the same commit (VYSL-uk3t did this correctly: settings.test.ts re-pinned in b59afa7).
- Add this to the release checklist / dispatcher publish step.

## A local VSIX that "doesn't take"
- The Marketplace auto-updater can silently install an older published version over a local build and mark the local one obsolete.
- Check `~/.vscode/extensions/extensions.json` and `~/.vscode/extensions/.obsolete` first. Fix: disable auto-update for the extension while testing, or install with a version higher than Marketplace, then reload.

## Scope pvg gates
- An unscoped `pvg gates` scans .vscode-test VS Code binaries and worktree copies and fails on unrelated duplication/file_loc. Pass the changed paths (src, test/integration) or run inside the worktree. Seen in VYSL-sqhc and VYSL-uk3t.
- `prettier --check` from outside a worktree needs `--ignore-path <wt>/.prettierignore` plus .gitignore.
