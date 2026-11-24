---
type: convention
project: vscode-yls-schema-loader
status: active
actionable: applied
source_epic: VYSL-gvc0
created: 2026-11-24
---
# Clean Build Gate for Compiled Tests

Category: Testing / Process. Evidence: session signal on epic branch; VYSL-aqw2 ran `rm -rf out && npm run compile`.

Stale compiled tests in the gitignored out/ directory (from deleted sources) inflated counts on the epic branch (101 unit / 35 integration vs the real 68 / 29) until cleaned. Mocha globs out/**/*.test.js, so deleted-source tests keep running.

## Rules
1. Any story that deletes or renames source or test files must run its gate from a clean build: `rm -rf out && npm test` (consider adding a clean step to the compile or pretest script).
2. Epic-merge gates run from a clean build and compare test counts against the sum of story proofs.
3. Treat an unexplained test-count delta as a defect to investigate, not noise.
4. The repo has no remote CI, so every green claim is local. A cheap CI workflow (compile, lint, clean test) would make the claim independent; propose as a follow-up, not scope creep.