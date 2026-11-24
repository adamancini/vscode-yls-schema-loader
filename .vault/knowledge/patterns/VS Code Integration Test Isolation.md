---
type: pattern
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-gvc0
created: 2026-11-24
---
# VS Code Integration Test Isolation

Category: Testing. Evidence: VYSL-70kn and VYSL-bhp3 LEARNINGS.

## Findings
- All integration tests that open the same fixture path share ONE in-memory TextDocument for the whole test-host session. An edit by one test (even a failing one) makes the document covered for the next, giving a false GREEN. VYSL-bhp3's first RED run showed it; fix was a dedicated fixture (catalog-disabled-manual-branch.yaml).
- The activated extension in the test host reacts to every document the tests open. Real catalog instance must be disabled (ylsSchemaLoader.enableFluxCatalog=false, Workspace scope, restored in teardown) and the test injects its own via a stub-fetch fixture catalog.
- Ordering matters: open the document FIRST, then enable autoInsert. autoInsertSchemas reads the setting synchronously before its first await, so the extension's own open handler never races the test.

## Rules for future stories
1. Every test that mutates a document gets its own fixture file. State this in story TESTING sections.
2. Setup of every suite that opens YAML disables the activated extension's real network-capable instances; teardown restores.
3. In a RED run, confirm the test fails for the intended reason on a fresh fixture, not only that it fails.
4. Never let a test reach the real network; inject fetchFn plus in-memory store.