---
type: convention
project: vscode-yls-schema-loader
status: active
actionable: applied
source_epic: VYSL-gvc0
created: 2026-11-24
---
# Developer Environment Friction (pvg guard, verify flag, worktrees)

Category: Tooling. Evidence: LEARNINGS in VYSL-70kn, aqw2, bhp3.

- The pvg guard treats developer sessions as dispatcher and blocks `cd <worktree>`, even inside compound commands. Use `git -C <abs>`, `npm --prefix <abs>`, absolute paths. npm still runs scripts with the worktree as cwd.
- pvg verify takes `--format text` (space). `--format=text`, as written in the developer prompt, is rejected. Fix the prompt (paivot-graph) or avoid the flag.
- Each worktree needs its own `npm ci`; node_modules is not shared.
- No coverage tool (c8/nyc) is configured and on-the-fly install was blocked by permission policy. Proofs report no percentage. Decide whether to add c8 or state coverage is not required.
- VS Code test host stderr noise (DEP0169 url.parse, AgentHostCustomizationMarketplace) comes from the host, not extension code.
- Include these in the developer story boilerplate so each developer does not rediscover them.
- (VYSL-0jlx) Scope `pvg gates` to changed paths; unscoped runs scan .vscode-test and worktree copies. See [[Release Hygiene and Local Install Pitfalls]].