---
type: debug
project: vscode-yls-schema-loader
status: active
actionable: pending
source_epic: VYSL-gvc0
created: 2026-11-24
---
# Flux Catalog Facts and Hardening

Category: External dependencies. Evidence: VYSL-70kn, VYSL-bhp3.

- Index shape matched the story: top-level v (4), generatedAt, categories, projects. URL pattern catalog/<group>/<lowercaseKind>_<version>.json; kind MUST be lowercase; groupless v1 maps to core.
- Parsed-index lookups use Object.hasOwn to avoid prototype-chain hits for kinds such as constructor.
- Failure handling: lookup never rejects; stale copy reused on reject, HTTP error, or unparseable body; 5 min retry back-off after failure; 24h TTL; in-flight promise de-duplicates concurrent callers; disabled setting means zero fetches and zero store reads.
- Coverage: 52 of 53 formerly bundled pairs resolve; native kustomize.config.k8s.io/v1beta1 Kustomization is not in the catalog and requires an additionalMappings entry (json.schemastore.org/kustomization.json) documented in the README.
- Breaking changes and no migration notes are acceptable: sole user, user preference to keep scope simple.
- Out of scope by user choice: telemetry, catalog UI, bundled snapshot, version pinning, ETag revalidation.