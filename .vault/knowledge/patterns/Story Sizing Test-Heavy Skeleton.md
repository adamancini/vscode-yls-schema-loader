---
type: pattern
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-gvc0
created: 2026-11-24
---
# Story Sizing: Test-Heavy Walking Skeletons

Category: Process. Evidence: VYSL-70kn diff +1040/-93 vs ~650 LOC budget (fluxCatalog.test.ts ~390, resolver tests +116, prettier-expanded fixture JSON 83).

- Budgets for new-module stories should state production and test LOC separately (e.g. ~250 prod / ~400 test) and note fixtures expand under prettier.
- No story in this epic was rejected; the overshoot was accepted because it was tests. Do not split a story solely for test volume, but do split when production code exceeds budget.
- 70kn's exhaustive TESTING list (12 ACs, 20+ scenarios) mapped one-to-one to evidence rows; this made PM acceptance fast and is worth repeating.
- Epic outcome: 3 stories, 0 rejections, net deletion in aqw2 (+91/-1049). Hard-tdd label was not used, so no comparison data exists.