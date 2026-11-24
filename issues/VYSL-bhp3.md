---
id: VYSL-bhp3
title: "Release 0.3.0 with the bundled mapping pruned to catalog gaps"
status: open
priority: 1
type: task
labels: [capstone]
parent: VYSL-gvc0
created_at: 2026-11-24T16:30:01Z
created_by: ada
updated_at: 2026-11-24T16:30:01Z
content_hash: "sha256:0b950561fe3eb346953e2028d3e6587879613616398176a5ee92cd9afbc59bd7"
---

## Description
Description:
Capstone. Prune the bundled mapping down to the one entry the Flux schema catalog does not cover, prove the final resolver chain end-to-end with a scripted demo test, and ship the user-facing record of the change: README, CHANGELOG and version 0.3.0.

Context:
After VYSL-70kn (catalog stage) and VYSL-aqw2 (GitHub + CRDs-catalog removal) the chain is user overrides -> Flux catalog -> bundled mapping -> session cache -> unresolved. src/lib/bundledMappingData.json still holds 53 kind/apiVersion entries. Verified against the live catalog index on 2026-11-24 (9,743 group/kind/version triples): 52 of the 53 are covered by the catalog and are therefore unreachable duplicates. The single gap is
  { "kind": "Kustomization", "apiVersion": "kustomize.config.k8s.io/v1beta1", "url": "https://json.schemastore.org/kustomization.json" }
(the native kubectl/kustomize CLI kustomization.yaml kind; https://schemas.fluxoperator.dev/catalog/kustomize.config.k8s.io/kustomization_v1beta1.json returns 404). The Flux CRD of the same kind name, kustomize.toolkit.fluxcd.io/v1 Kustomization, IS in the catalog and is one of the 52.
Several existing tests assert the old bundled Kargo Stage URL (https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json) and must be retargeted. package-lock.json is stale: its two root "version" fields say 0.2.2 while package.json says 0.2.7.

USER INTENT:
The user wants the catalog to be the source of truth in fact and on paper: no shadow copy of catalog-covered schemas left in the extension, documentation that tells users where schemas come from now, what was removed, and how to turn the catalog off, and a version they can publish.

IMPLEMENTATION:
1. src/lib/bundledMappingData.json: reduce to an array containing only the Kustomization entry quoted above.
2. src/lib/bundledMapping.test.ts: replace the `bundledMappingData seed content` suite with: the data has exactly one entry and it equals the entry above; resolveBundled returns undefined for Stage kargo.akuity.io/v1alpha1 and for Kustomization kustomize.toolkit.fluxcd.io/v1.
3. Retarget tests that relied on a bundled Kargo Stage:
   - Tests that run the REGISTERED command of the activated extension (test/integration/applySchema.test.ts, the insertSchemaForCurrentDocument test in test/integration/codeActions.test.ts) run with the real catalog disabled by the testUtils helper, so they must resolve through the bundled mapping: change their fixtures (test/fixtures/apply-schema-comment-mode.yaml, test/fixtures/apply-schema-yamlschemas-mode.yaml, test/fixtures/current-document-command.yaml) to `apiVersion: kustomize.config.k8s.io/v1beta1` / `kind: Kustomization` and expect https://json.schemastore.org/kustomization.json.
   - Tests that call autoInsertSchemas / createInsertSchemaCommandHandler directly (test/integration/autoInsert.test.ts and others) inject a FluxCatalog over test/fixtures/flux-catalog-index.json and expect catalog URLs, e.g. https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json and .../warehouse_v1alpha1.json. Rename test titles and fixtures that say "bundled" where they now exercise the catalog.
   - The test added by VYSL-70kn asserting "catalog disabled -> Stage resolves through the bundled entry" becomes "catalog disabled -> Stage is unresolved, native Kustomization resolves through the bundled entry".
4. Scripted demo: new test/integration/resolutionChain.test.ts with new fixture test/fixtures/resolution-chain.yaml, a five-document file in this order: Warehouse kargo.akuity.io/v1alpha1, Stage kargo.akuity.io/v1alpha1, ConfigMap v1, Kustomization kustomize.config.k8s.io/v1beta1, Widget widgets.example.com/v1. Workspace settings for the test: autoInsert=true, additionalMappings=[{ kind: "Warehouse", apiVersion: "kargo.akuity.io/v1alpha1", url: "https://override.example.com/warehouse.json" }] (reset both in teardown). Call autoInsertSchemas once with an injected catalog (counting stub fetch, in-memory store). Expected comment line directly above each document:
   Warehouse -> https://override.example.com/warehouse.json (override beats catalog)
   Stage -> https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json
   ConfigMap -> https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json
   Kustomization -> https://json.schemastore.org/kustomization.json (bundled)
   Widget -> no comment inserted
   and the stub fetch was called exactly once, with https://schemas.fluxoperator.dev/index.json. Second test, same fixture content in a second fixture file (test/fixtures/resolution-chain-catalog-off.yaml), catalog built with isEnabled: () => false: only Warehouse and Kustomization get comments, fetch count is 0.
5. README.md:
   - Features: replace the four-stage list with the final chain (your additionalMappings -> Flux schema catalog -> bundled mapping -> session cache), state that every resolved source applies directly, and remove all GitHub-confirmation and CRDs-catalog wording, including in the Never-edits-silently and auto-insert bullets.
   - Replace the "Bundled schemas" section with a "Schema sources" section: the Flux schema catalog (link https://schemas.fluxoperator.dev/catalog/) built from upstream projects' CRDs at tagged releases, covering core Kubernetes and 120+ projects; the index https://schemas.fluxoperator.dev/index.json is downloaded at most once every 24 hours, cached in VS Code global state, and reused when offline; lookups never happen while typing; the one bundled entry (native Kustomization via SchemaStore) and why; unresolved kinds prompt for a URL or can be added with additionalMappings.
   - Extension Settings table: remove enableWebDiscovery and githubRepoHints, add enableFluxCatalog (boolean, default true, "Resolve schemas from the Flux schema catalog. Turn off in air-gapped environments to prevent any request to schemas.fluxoperator.dev."), fix the autoInsert and additionalMappings descriptions (overrides now win over the catalog too).
   - Known limitations: remove the GitHub discovery bullet; reword the first bullet to "schemas come from your overrides, the Flux schema catalog, or the bundled mapping, not kubectl get crd".
6. CHANGELOG.md: add a `## 0.3.0` section at the top covering: Flux schema catalog is now the primary source (with the resolver order); catalog matches apply directly and are eligible for autoInsert; index cached for 24 hours in global state, stale copy used offline, never fetched per edit; new setting ylsSchemaLoader.enableFluxCatalog; REMOVED: GitHub heuristic discovery and its confirmation prompt, the datreeio/CRDs-catalog fallback, settings ylsSchemaLoader.enableWebDiscovery and ylsSchemaLoader.githubRepoHints (users who had enableWebDiscovery=false to stay offline must now set enableFluxCatalog=false); bundled mapping pruned from 53 entries to 1; inserted schema URLs for previously bundled kinds now point at schemas.fluxoperator.dev (existing comments in users' files are not rewritten).
7. Version: set 0.3.0 in package.json and in both root "version" fields of package-lock.json (`npm version 0.3.0 --no-git-tag-version` does both; do not create a git tag).
8. Real-endpoint smoke (run by hand once, NOT committed, NOT part of npm test): after `npm run compile`, run a one-off node script that builds createFluxCatalog from out/src/lib/fluxCatalog.js with the real global fetch and an in-memory store, takes the 53 pairs from `git show main:src/lib/bundledMappingData.json`, and prints lookup() for each. Expected: 52 resolve to https://schemas.fluxoperator.dev/catalog/... URLs and only Kustomization kustomize.config.k8s.io/v1beta1 is undefined. Then `curl -s -o /dev/null -w "%{http_code}"` three of the returned URLs and expect 200. Paste the output in the delivery proof. If any of the 52 does not resolve, keep that entry in the bundled mapping and report it.
9. Delivery LEARNINGS must include this line for the orchestrator: "Vault decision 'Prefer First-Party Sources for Schema Lookups' is superseded: the Flux schema catalog (built from upstream CRDs at tagged releases) is now the primary source; aggregator-as-fallback ordering no longer applies. Update the vault decision note."

KEY FILES:
Create: test/integration/resolutionChain.test.ts, test/fixtures/resolution-chain.yaml, test/fixtures/resolution-chain-catalog-off.yaml.
Modify: src/lib/bundledMappingData.json, src/lib/bundledMapping.test.ts, test/integration/applySchema.test.ts, test/integration/codeActions.test.ts, test/integration/autoInsert.test.ts, test/integration/insertSchemaCommandBranches.test.ts, test/fixtures/apply-schema-comment-mode.yaml, test/fixtures/apply-schema-yamlschemas-mode.yaml, test/fixtures/current-document-command.yaml, test/fixtures/auto-insert-bundled.yaml, test/fixtures/auto-insert-bundled-session-cache.yaml, README.md, CHANGELOG.md, package.json, package-lock.json.

OUT OF SCOPE:
- Publishing to the VS Code Marketplace, git tags, GitHub releases: the user publishes. Never in this backlog.
- Editing the vault decision note: the orchestrator does it from the LEARNINGS line.
- Rewriting schema comments already present in users' files to the new URLs: not requested. Never.
- Any change to src/lib/fluxCatalog.ts, src/lib/resolver.ts or event wiring: delivered by VYSL-70kn and VYSL-aqw2. A defect found there is reported as a bug, not patched here.
- A committed test that contacts the real catalog: tests must stay offline; the real-endpoint check is the manual smoke in step 8.

DIFF BUDGET:
About 18 files, under 450 changed LOC (the JSON prune removes about 260 lines).

CONSUMES:
- VYSL-70kn: src/lib/fluxCatalog.ts -> createFluxCatalog, FluxCatalog, CatalogStore
    spec: createFluxCatalog(options: { fetchFn: FetchFn; store: CatalogStore; isEnabled: () => boolean; now?: () => number }): FluxCatalog; interface FluxCatalog { lookup(kind: string, apiVersion: string): Promise<string | undefined> }; interface CatalogStore { get(): CachedCatalog | undefined; set(value: CachedCatalog): Thenable<void> | Promise<void> }
    source: story VYSL-70kn IMPLEMENTATION step 1
- VYSL-70kn: test/fixtures/flux-catalog-index.json -> trimmed real-shape catalog index
    schema: { v: 4, generatedAt: string, categories: string[], projects: [{ name, groups: [{ g: string, kinds: [[lowercaseKind, versions[], int, DisplayKind, extra?]] }] }] } listing at least kargo.akuity.io stage+warehouse v1alpha1, core configmap v1, apps deployment v1, kustomize.toolkit.fluxcd.io kustomization v1
    source: story VYSL-70kn KEY FILES and Catalog facts
- VYSL-70kn: package.json -> setting ylsSchemaLoader.enableFluxCatalog
    fields: type boolean, default true
    source: story VYSL-70kn IMPLEMENTATION step 5
- VYSL-70kn: test/integration/testUtils.ts -> helper that sets ylsSchemaLoader.enableFluxCatalog=false at workspace scope for a suite
    source: story VYSL-70kn IMPLEMENTATION step 8
- VYSL-aqw2: src/autoInsert.ts -> autoInsertSchemas
    spec: autoInsertSchemas(document: vscode.TextDocument, sessionCache: Map<string, string>, fluxCatalog: FluxCatalog): Promise<void>
    source: story VYSL-aqw2 IMPLEMENTATION step 5
- VYSL-aqw2: src/insertSchemaCommand.ts -> createInsertSchemaCommandHandler
    spec: createInsertSchemaCommandHandler(sessionCache: Map<string, string>, diagnostics: DiagnosticsProvider, fluxCatalog: FluxCatalog, overrides?: { promptManualUrl?: () => Thenable<string | undefined> }): (uri: vscode.Uri, startLine: number) => Promise<void>
    source: story VYSL-aqw2 IMPLEMENTATION step 4
- VYSL-aqw2: package.json -> configuration without ylsSchemaLoader.enableWebDiscovery / ylsSchemaLoader.githubRepoHints
    source: story VYSL-aqw2 IMPLEMENTATION step 7

PRODUCES:
- src/lib/bundledMappingData.json -> bundled mapping with exactly one entry (Kustomization, kustomize.config.k8s.io/v1beta1, https://json.schemastore.org/kustomization.json).
- test/integration/resolutionChain.test.ts -> scripted end-to-end demo of the final chain.
- README.md, CHANGELOG.md -> 0.3.0 documentation.
- package.json, package-lock.json -> version 0.3.0.

TESTING:
Default coverage: unit + integration, test-first: retarget and add the tests, watch them fail against the unpruned data, then prune.
- Unit: bundledMapping.test.ts as in step 2.
- Integration: resolutionChain.test.ts both scenarios in step 4; retargeted applySchema, codeActions, autoInsert tests in step 3, including the bottom-to-top multi-document test.
- Negative paths that must be asserted: Widget stays untouched in both demo scenarios; with the catalog off, Stage and ConfigMap stay untouched and fetch count is 0; a formerly bundled kind (Stage) no longer resolves from the bundled mapping.
- No real network in any committed test; no skipped tests.
- Docs check, paste the output: rg -n -i "github heuristic|githubRepoHints|enableWebDiscovery|CRDs-catalog|datreeio" README.md package.json src test  -> no matches. (CHANGELOG.md keeps its history and names the removals in 0.3.0.)
- Gates: npm run compile, npm run lint, npm run format:check, npm test, npm run vscode:prepublish all green; paste the output.

Acceptance Criteria:
1. [Ubiquitous] src/lib/bundledMappingData.json contains exactly one entry: Kustomization, kustomize.config.k8s.io/v1beta1, https://json.schemastore.org/kustomization.json.
2. [Event] When auto-insert runs on the five-document demo file with the catalog enabled, the override, the two catalog URLs and the bundled URL are inserted above the right documents (bottom-to-top, no line corruption), the Widget document is untouched, and the index is fetched exactly once.
3. [Optional] Where the catalog is disabled, the same file gets only the override and bundled insertions and zero fetches occur.
4. [Unwanted] The system shall not resolve a catalog-covered kind (e.g. Stage kargo.akuity.io/v1alpha1) from the bundled mapping; with the catalog disabled and no override it is unresolved.
5. [Event] When the registered quick-fix command runs on a native Kustomization with the catalog disabled, it inserts https://json.schemastore.org/kustomization.json in both comment and yamlSchemas insertion modes.
6. README.md describes the final chain, the catalog as primary source, the 24-hour cached index and offline behavior, the enableFluxCatalog setting, and contains no reference to GitHub discovery, githubRepoHints, enableWebDiscovery or the CRDs-catalog (rg output attached).
7. CHANGELOG.md has a 0.3.0 section listing the new source, the new setting, every removal (GitHub heuristic, confirmation prompt, CRDs-catalog fallback, the two settings, the 52 bundled entries) and the enableWebDiscovery=false migration note.
8. package.json version is 0.3.0 and both root version fields in package-lock.json are 0.3.0; no git tag is created.
9. Real-endpoint verification (manual smoke, cannot be checked by stubbed tests): the one-off script output shows 52 of the 53 formerly bundled pairs resolving from the live index and only kustomize.config.k8s.io/v1beta1 Kustomization unresolved, and three returned URLs answer HTTP 200.
10. npm run compile, npm run lint, npm run format:check, npm test and npm run vscode:prepublish pass, and the delivery LEARNINGS contain the vault-decision line from step 9 of IMPLEMENTATION.

PROCESS:
Work only in the git worktree path given in your prompt (worktrees live under .worktrees/, already gitignored); never create or switch branches in the repository root. Commit messages must not mention Claude or Claude Code.

MANDATORY SKILLS TO REVIEW:
superpowers:test-driven-development, superpowers:verification-before-completion

## Acceptance Criteria


## Design


## Notes


## History


## Links
- Parent: [[VYSL-gvc0]]

## Comments
