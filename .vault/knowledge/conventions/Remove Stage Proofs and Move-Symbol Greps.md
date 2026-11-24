---
type: convention
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-gvc0
created: 2026-11-24
---
# Removal Stories: Proof Patterns and Importer Greps

Category: Process. Evidence: VYSL-aqw2, VYSL-bhp3 LEARNINGS.

1. When a story moves a type or symbol, grep for every importer; do not trust the story's traced list. aqw2 found three extra importers of FetchFn (extension.ts, fluxCatalog.test.ts, testUtils.ts).
2. Removal rg patterns must account for legitimate matches (package.json repository/bugs/homepage github.com URLs, test override URLs). Specify an allowlist or narrow the pattern when writing the story. Prefer placeholder URLs in unit tests so src has zero matches; keep real URLs only in one demo scenario.
3. A package.json contributes test (read from the test host) cheaply pins removed settings and description text.
4. Walking-skeleton story that keeps the old source alongside the new one (70kn) leaves thin-file flags from pvg verify until the deleting story; note this expected flag in the story to avoid padding.
5. Write the test-first step as retargeting tests to the final state; compile failure on removed exports is an acceptable compile-RED, backed by a behavioral RED (bhp3 showed 4 failing integration tests).