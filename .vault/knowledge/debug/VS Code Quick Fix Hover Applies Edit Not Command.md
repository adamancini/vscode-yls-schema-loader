---
type: debug
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-0jlx
created: 2026-11-24
---
# VS Code Quick Fix Hover Applies Edit, Not Command

Category: External dependencies. Evidence: hover investigation between epics; VYSL-sqhc design and AC 4/5.

## Finding
Instrumentation proved the diagnostic hover's "Quick Fix..." menu applies `CodeAction.edit` but does NOT run `CodeAction.command`. Lightbulb/Ctrl+. may run commands, so command-only quick-fixes work in one path and silently do nothing in another.

## Rule
Every quick-fix must carry its work as `CodeAction.edit`, on every trigger kind (Invoke and Automatic), and attach no command. Fixed for the insert action in 0.3.3; the restore quick-fix (VYSL-sqhc) was built edit-only from the start. If the edit needs expensive data (catalog lookup), consider a local/cheap path or accept command-only and document it.

## Test pattern
Integration test: apply only the edit (workspace.applyEdit), then refresh diagnostics and assert exactly one directive is present and the provider publishes nothing further (VYSL-sqhc 'hover path' test).

## Unresolved, accepted
In the user's VS Code the hover Quick Fix menu closes itself within ~1s even with a still mouse (VS Code or Copilot). Do not try to fix it in the extension.

## Technique: throwaway debug VSIX
To see what the host actually does, package a throwaway VSIX that logs via a LogOutputChannel (createOutputChannel(name, {log:true})). The log file lands in `~/Library/Application Support/Code/logs/<session>/window<N>/exthost/<publisher.ext>/`. Never ship it.
