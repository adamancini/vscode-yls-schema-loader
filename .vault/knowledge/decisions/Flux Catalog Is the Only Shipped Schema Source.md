---
type: decision
project: vscode-yls-schema-loader
status: active
actionable: pending
supersedes: Prefer First-Party Sources for Schema Lookups
source_epic: VYSL-gvc0
created: 2026-11-24
---
# Flux Catalog Is the Only Shipped Schema Source

Decision (v0.3.0): the Flux schema catalog (built from upstream CRDs at tagged releases) is the only shipped source. The extension embeds no schemas; everything is a lookup. Chain: additionalMappings override, Flux catalog (cached index, offline), session cache, unresolved (manual URL prompt).

Supersedes the Claude-vault decision Prefer First-Party Sources for Schema Lookups (aggregator-as-fallback ordering no longer applies). The orchestrator should update that note in vault Claude.

Rationale: user said they do not want to ship embedded schemas and wants scope kept simple; catalog covers 52 of 53 former bundled pairs. Removed: bundled mapping, GitHub repo heuristic and confirmation prompt, datreeio CRDs-catalog probe, related settings. Consequences: native Kustomization needs a user override (README example); single point of dependence on schemas.fluxoperator.dev, mitigated by 24h cache plus stale reuse.