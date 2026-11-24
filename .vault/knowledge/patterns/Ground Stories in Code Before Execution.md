---
type: pattern
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-0jlx
created: 2026-11-24
---
# Ground Stories in Code Before Execution

Category: Process / Testing. Evidence: VYSL-0jlx Sr. PM grounding, VYSL-sqhc and VYSL-uk3t proofs.

## What paid off
The Sr. PM read the code before writing stories and caught two flaws in the user's stated decisions:
1. Non-URL `yaml.schemas` keys (alias `kubernetes`) would produce a broken `$schema=` directive. Resolution: only http/https/file keys are restorable; alias-only matches stay covered (VYSL-sqhc AC 9; LEARNING: coverageState must test any-pattern match before URL selection).
2. `*.yaml` only matches the workspace root under minimatch on relative paths; `**/*.yaml` matches everything. This drove the three-step URL selection rule and the README broad-pattern warning.
Both shipped with unit tests per rule step. Zero rejections in the epic.

## Practices to keep
- Behavior-preserving stubs for RED in TypeScript (exports present, old logic): suite compiles, new tests fail on assertions, negative/regression tests pass and thereby pin current behavior.
- Plan commit grouping BEFORE the RED commit: a test pinned to a package.json description must be committed with the description change, not in RED (VYSL-uk3t needed reset --soft to split).
- Mocha: a test mixing waitFor (4s) and staysFalseFor needs `async function () { this.timeout(...) }`, not an arrow.
- Dedicated fixture per mutating test; budget one spare fixture in the story for regression tests (uk3t needed a 7th).
- Delete helpers that lose their last importer (isCovered) and move their cases to the replacement suite.
- Hard-TDD note: this epic had no hard-tdd labeled stories; no rejection-rate comparison is possible. uk3t had a separate tdd-red commit; sqhc did not.
