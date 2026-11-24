---
id: VYSL-gvc0
title: "Flux schema catalog as first-class schema source"
status: closed
priority: 1
type: epic
created_at: 2026-11-24T16:26:35Z
created_by: ada
updated_at: 2026-11-24T18:05:18Z
content_hash: "sha256:55f7a4c60ef7bb2a169dcd6f143f20af8f77e17473fbc45b5f8bcfd14b420f8a"
labels: [milestone, accepted]
closed_at: 2026-11-24T18:05:15Z
close_reason: "All stories accepted, gate passed: full suite green, Anchor VALIDATED, merged to main 5ad4cd1"
---

## Description
Description:
Make the Flux schema catalog (https://schemas.fluxoperator.dev/catalog/) the first-class source of yaml-language-server schemas for the VS Code extension adamancini.yls-schema-loader, and remove every source it supersedes, including the bundled mapping: the extension ships no embedded schema data. Ships as v0.3.0.

BUSINESS CONTEXT:
The extension detects kind/apiVersion in Kubernetes-style YAML and wires a schema via a diagnostic + quick-fix flow that never edits silently unless the source is deterministically verified. Today (v0.2.7) schemas come from a hand-curated bundled mapping of 53 kind/apiVersion pairs, then an unreliable GitHub repo-guessing heuristic (confirmation required), then a datreeio/CRDs-catalog probe. The Flux schema catalog is built from upstream projects' CRDs at tagged releases, is regenerated daily, and covers 127 projects / 9,743 group-kind-version triples including core Kubernetes. It covers 52 of the 53 bundled entries. Using it as the primary source gives far wider coverage with no hand maintenance. The user's decisions: "I don't want to have to ship embedded schemas; they should all be lookups", and keep the scope simple.

PROBLEM BEING SOLVED:
Current chain: bundled mapping (merged with user additionalMappings) -> session cache -> GitHub heuristic (confirm required, unreliable, rate-limited) -> datreeio/CRDs-catalog (one network probe per lookup). Coverage is narrow, the heuristic guesses wrong, and the bundled list needs manual upkeep.

TARGET STATE:
Resolver chain, first match wins:
1. user ylsSchemaLoader.additionalMappings overrides
2. Flux schema catalog (resolved offline from a cached copy of index.json)
3. session cache
4. unresolved (manual URL prompt in the quick-fix; nothing in auto-insert)
With ylsSchemaLoader.enableFluxCatalog=false the chain is overrides -> session cache -> unresolved and no request is ever made to schemas.fluxoperator.dev.
The GitHub heuristic stage, the datreeio/CRDs-catalog stage, the bundled mapping (code and data), and everything that only they used are gone. ylsSchemaLoader.additionalMappings stays: it is user configuration, not shipped data.
Known consequence: the native kustomize kind (kustomize.config.k8s.io/v1beta1 Kustomization) is not in the catalog, so it is unresolved by default; the README documents an additionalMappings example for it using https://json.schemastore.org/kustomization.json. That entry is NOT shipped as a default.

ARCHITECTURE INTEGRATION:
- TypeScript VS Code extension, single esbuild bundle (dist/extension.js), VS Code engine ^1.90.0. Pure logic lives in src/lib/*.ts with colocated mocha unit tests (src/lib/*.test.ts, tdd ui: suite/test); VS Code-facing code lives in src/*.ts with integration tests under test/integration/ run by @vscode/test-cli in a real VS Code host. Fixtures in test/fixtures/.
- Trust boundary pattern: the resolver result carries a `source` field; features filter by source. Direct-apply sources apply with no confirmation and are eligible for auto-insert. The new `fluxCatalog` source is direct-apply.
- Network discipline pattern: network-touching resolution is never wired to the per-edit debounced onDidChangeTextDocument handler (that handler refreshes diagnostics only). Auto-insert runs on document open and the initial activation scan only. The catalog index is fetched at most once per TTL window, de-duplicated across concurrent callers by a single in-flight promise.
- Catalog facts (verified 2026-11-24): GET https://schemas.fluxoperator.dev/index.json returns application/json, about 607 KB, top-level keys {v, generatedAt, categories, projects}, v = 4. Schema URL pattern: https://schemas.fluxoperator.dev/catalog/<group>/<lowercaseKind>_<version>.json. The kind segment MUST be lowercase (original case returns 404). Groupless apiVersion "v1" maps to group "core" (core/configmap_v1.json returns 200).
- Multi-document inserts are applied bottom-to-top so earlier insertion points never shift. Must not regress.

DESIGN REQUIREMENTS:
No UI design work. No new commands, views or prompts. One new boolean setting. Catalog hits behave exactly like today's bundled hits: quick-fix applies immediately, auto-insert applies on open when enabled.

EXPLICITLY OUT OF SCOPE FOR THE WHOLE EPIC (user: "keep the scope simple"):
Telemetry, a UI for browsing the catalog, a bundled snapshot of the index, schema version pinning, ETag/If-None-Match revalidation, publishing to the Marketplace.

Acceptance Criteria:
1. A Kubernetes-style document whose kind/apiVersion is in the Flux schema catalog gets the catalog URL inserted by the quick-fix with no confirmation prompt, and by auto-insert on open when ylsSchemaLoader.autoInsert is true.
2. The catalog index is fetched at most once per TTL window, is cached in VS Code globalState, is reused stale when the network is unavailable, and is never fetched from the per-edit handler.
3. ylsSchemaLoader.enableFluxCatalog (boolean, default true) disables all catalog network access when false.
4. The GitHub heuristic stage and the datreeio/CRDs-catalog stage no longer exist in code, settings, tests or docs.
5. The bundled mapping no longer exists in code or data; ylsSchemaLoader.additionalMappings still works and is checked first; the README shows the additionalMappings example for the native kustomize Kustomization.
6. README, CHANGELOG and package version (0.3.0) describe the shipped behavior; npm run compile, npm run lint and npm test are green.

MANDATORY SKILLS TO REVIEW:
superpowers:test-driven-development, superpowers:verification-before-completion

## Acceptance Criteria


## Design


## Notes


## History
- 2026-11-24T18:05:15Z status: open -> closed

## Links


## Comments
