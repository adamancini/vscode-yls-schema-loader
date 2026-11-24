---
type: pattern
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-gvc0
created: 2026-11-24
---
# Cover activate() Wiring With a Committed Test

Category: Testing / Architecture. Evidence: Anchor advisory on VYSL-gvc0; VYSL-70kn and VYSL-bhp3 proofs.

## Gap
No committed test exercises the activated extension's OWN FluxCatalog instance through activate(). The global fetch cast and the globalState store adapter (key fluxCatalog.index) in src/extension.ts are unexecuted by tests; integration tests disable it and inject a stub. A live manual run passed, and bhp3 did a manual real-endpoint smoke (52/53 resolve) that is not committed.

## Follow-up story candidate
- Integration test that activates the extension with the catalog enabled, intercepts fetch at the boundary (or serves a local stub endpoint), and asserts the index is fetched once, persisted to globalState, and reused after a simulated restart.
- Consider a small factory in src/ that builds the catalog from (context, fetch) so the adapter is unit-testable.

## General rule
When tests replace a production wiring path with an injected one, add exactly one test that runs the real wiring, or record the gap explicitly in the story.