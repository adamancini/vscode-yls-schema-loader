---
type: pattern
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-0jlx
created: 2026-11-24
---
# Open Advisories After VYSL-0jlx

Follow-up candidates for the Sr. PM (from Anchor milestone review and retro).

1. Offer path has no committed through-activation test. Diagnostic, quick-fix and command are tested via their own entry points (createDiagnosticsProvider, SchemaCodeActionProvider, handler), but only the auto-restore has a real-wiring test. Add one test that activates the extension and drives the offer path. Same general rule as 'Cover activate() Wiring With a Committed Test'.
2. Stale restore quick-fix after an insertionMode switch. There is no configuration-change listener, so a diagnostic built in comment mode stays until the next refresh; the provider returns nothing when settings no longer match, but the diagnostic lingers. Add an onDidChangeConfiguration refresh.
3. README does not spell out the alias+URL case (a file matched by both an alias key and a URL key: restored using the URL key). Add one example.
4. VYSL-sqhc had no separate RED commit (RED evidence only in the proof). Require a tdd-red commit for walking-skeleton stories so RED is verifiable from history.
5. Process defect check: both delivery comments contained LEARNINGS; none missing.
