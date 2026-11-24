---
id: VYSL-bhp3
title: "Release 0.3.0 with the bundled mapping removed"
status: closed
priority: 1
type: task
labels: [capstone, accepted]
parent: VYSL-gvc0
created_at: 2026-11-24T16:30:01Z
created_by: ada
updated_at: 2026-11-24T17:33:24Z
content_hash: "sha256:032acc2c099cf99632f18a9a02cd86c8b9166cf674a8ad342a18e96ee2d9c973"
was_blocked_by: [VYSL-70kn, VYSL-aqw2]
assignee: dev-VYSL-bhp3
follows: [VYSL-70kn, VYSL-aqw2]
closed_at: 2026-11-24T17:33:24Z
close_reason: "Accepted via pvg story accept"
---

## Description
Description:
Capstone. Remove the bundled mapping entirely (code, data and the 'bundled' resolver source) so that every schema is a lookup, prove the final resolver chain end-to-end with a scripted demo test, and ship the user-facing record of the change: README, CHANGELOG and version 0.3.0.

Context:
After VYSL-70kn (catalog stage) and VYSL-aqw2 (GitHub + CRDs-catalog removal) the chain is user overrides -> Flux catalog -> bundled mapping -> session cache -> unresolved. The user's decision: "I don't want to have to ship embedded schemas; they should all be lookups." So the bundled stage goes, and the final chain is:
  user ylsSchemaLoader.additionalMappings -> Flux schema catalog (cached index) -> session cache -> unresolved
and with ylsSchemaLoader.enableFluxCatalog=false: overrides -> session cache -> unresolved.
ylsSchemaLoader.additionalMappings stays: it is user configuration, not shipped data.

Verified against the source at commit ae44f94 and the live catalog index on 2026-11-24:
- src/lib/bundledMappingData.json holds 53 kind/apiVersion entries; 52 are in the catalog. The one gap is the native kubectl/kustomize CLI kind, Kustomization at kustomize.config.k8s.io/v1beta1 (https://schemas.fluxoperator.dev/catalog/kustomize.config.k8s.io/kustomization_v1beta1.json returns 404). It becomes UNRESOLVED by default. It must NOT be shipped as a default entry anywhere; the README documents how a user adds it. (The Flux CRD kustomize.toolkit.fluxcd.io/v1 Kustomization is in the catalog and unaffected.)
- src/lib/bundledMapping.ts exports the MappingEntry interface and resolveBundled(entries, kind, apiVersion). Both are ALSO what the user-override stage uses: src/settings.ts imports MappingEntry for getAdditionalMappings, and the resolver uses the lookup for overrideEntries. That logic must move, not disappear.
- Many existing tests assert the bundled Kargo Stage URL https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json and must be retargeted.
- package-lock.json is stale: its two root "version" fields say 0.2.2 while package.json says 0.2.7.

USER INTENT:
The user wants the extension to carry no embedded schema data at all: the catalog is the source of truth, user overrides are the escape hatch, and the documentation tells users where schemas come from now, what was removed, how to map a kind the catalog lacks (native kustomize being the worked example), and how to turn the catalog off.

IMPLEMENTATION:
1. Move the override lookup into src/lib/resolver.ts: export `interface MappingEntry { kind: string; apiVersion: string; url: string }` and `function resolveOverride(entries: MappingEntry[], kind: string, apiVersion: string): string | undefined` (exact kind + apiVersion match, same behavior as today's resolveBundled). Move its two unit tests into src/lib/resolver.test.ts. Point src/settings.ts at './lib/resolver' for MappingEntry.
2. Delete src/lib/bundledMapping.ts, src/lib/bundledMapping.test.ts and src/lib/bundledMappingData.json.
3. src/lib/resolver.ts final shape:
   Resolution = { source: 'override'; url: string } | { source: 'fluxCatalog'; url: string } | { source: 'sessionCache'; url: string } | { source: 'unresolved' }
   ResolverDeps = { overrideEntries: MappingEntry[]; sessionCache: Map<string, string>; lookupFluxCatalog: (kind: string, apiVersion: string) => Promise<string | undefined> }
   DIRECT_APPLY_SOURCES = override, fluxCatalog, sessionCache.
   resolveSchema order: overrides -> catalog -> session cache -> 'unresolved'.
4. src/insertSchemaCommand.ts and src/autoInsert.ts: remove the bundledMappingData import and the bundledEntries dep. Fix any comment in src/ that still mentions the bundled mapping (resolver.ts, autoInsert.ts, extension.ts).
5. package.json: rewrite the ylsSchemaLoader.additionalMappings description to "Your own kind/apiVersion to schema URL mappings. Checked first, before the Flux schema catalog; use it for kinds the catalog does not cover or to pin a different schema." Make sure no other description mentions a bundled mapping.
6. Retarget tests that relied on a bundled Kargo Stage:
   - Tests that run the REGISTERED command of the activated extension (test/integration/applySchema.test.ts, the insertSchemaForCurrentDocument test in test/integration/codeActions.test.ts) run with the real catalog disabled by the testUtils helper, so nothing resolves by default any more. Give them a workspace-scoped ylsSchemaLoader.additionalMappings entry for the fixture's kind (Stage, kargo.akuity.io/v1alpha1, https://override.example.com/stage.json), expect that URL, and reset the setting in teardown. Their fixtures stay as they are.
   - Tests that call autoInsertSchemas / createInsertSchemaCommandHandler directly (test/integration/autoInsert.test.ts and others) inject a FluxCatalog over test/fixtures/flux-catalog-index.json and expect catalog URLs, e.g. https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json and https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/warehouse_v1alpha1.json. Rename test titles that say "bundled"; fixture file names may stay.
   - The test added by VYSL-70kn asserting "catalog disabled -> Stage resolves through the bundled entry" becomes "catalog disabled and no override -> Stage is unresolved and auto-insert leaves the document untouched".
   - src/lib/resolver.test.ts: drop the bundled-ordering tests; keep override-beats-catalog, catalog-before-session-cache, session cache, unresolved.
7. Scripted demo: new test/integration/resolutionChain.test.ts with new fixture test/fixtures/resolution-chain.yaml, a five-document file in this order: Warehouse kargo.akuity.io/v1alpha1, Stage kargo.akuity.io/v1alpha1, ConfigMap v1, Kustomization kustomize.config.k8s.io/v1beta1, Widget widgets.example.com/v1. Each scenario opens its own copy of the content (test/fixtures/resolution-chain.yaml, test/fixtures/resolution-chain-catalog-off.yaml, test/fixtures/resolution-chain-kustomize-override.yaml), sets autoInsert=true at workspace scope, calls autoInsertSchemas once with an injected catalog (counting stub fetch, in-memory store), and resets settings in teardown.
   Scenario A, additionalMappings=[{ kind: "Warehouse", apiVersion: "kargo.akuity.io/v1alpha1", url: "https://override.example.com/warehouse.json" }], catalog enabled. Expected comment line directly above each document:
     Warehouse -> https://override.example.com/warehouse.json (override beats catalog)
     Stage -> https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json
     ConfigMap -> https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json
     Kustomization -> no comment inserted (not in the catalog, nothing shipped)
     Widget -> no comment inserted
     and the stub fetch was called exactly once, with https://schemas.fluxoperator.dev/index.json.
   Scenario B, same override, catalog built with isEnabled: () => false: only Warehouse gets a comment; fetch count is 0.
   Scenario C, additionalMappings=[{ kind: "Kustomization", apiVersion: "kustomize.config.k8s.io/v1beta1", url: "https://json.schemastore.org/kustomization.json" }], catalog enabled: the Kustomization document gets https://json.schemastore.org/kustomization.json (proves the README example works); Widget still untouched.
8. README.md:
   - Features: replace the four-stage list with the final chain (your additionalMappings -> Flux schema catalog -> session cache), state that every resolved source applies directly, and remove all GitHub-confirmation, CRDs-catalog and bundled-mapping wording, including in the Never-edits-silently and auto-insert bullets.
   - Replace the "Bundled schemas" section with a "Schema sources" section: the extension ships no embedded schemas; the Flux schema catalog (link https://schemas.fluxoperator.dev/catalog/) is built from upstream projects' CRDs at tagged releases and covers core Kubernetes and 120+ projects; its index https://schemas.fluxoperator.dev/index.json is downloaded at most once every 24 hours, cached in VS Code global state, and reused when offline; lookups never happen while typing; kinds the catalog lacks are unresolved (the quick-fix asks for a URL) until mapped with additionalMappings.
   - In that section, a short "Kinds the catalog does not cover" note naming the native kubectl/kustomize kustomization.yaml kind (kustomize.config.k8s.io/v1beta1 Kustomization, distinct from Flux's kustomize.toolkit.fluxcd.io Kustomization which IS covered) with this settings example verbatim:
     "ylsSchemaLoader.additionalMappings": [
       { "kind": "Kustomization", "apiVersion": "kustomize.config.k8s.io/v1beta1", "url": "https://json.schemastore.org/kustomization.json" }
     ]
   - Extension Settings table: remove enableWebDiscovery and githubRepoHints, add enableFluxCatalog (boolean, default true, "Resolve schemas from the Flux schema catalog. Turn off in air-gapped environments to prevent any request to schemas.fluxoperator.dev."), fix the autoInsert and additionalMappings descriptions (no bundled mapping; overrides are checked first).
   - Known limitations: remove the GitHub discovery bullet; reword the first bullet to "schemas come from your additionalMappings or the Flux schema catalog, not kubectl get crd"; add that with enableFluxCatalog off only your additionalMappings resolve.
9. CHANGELOG.md: add a `## 0.3.0` section at the top covering: Flux schema catalog is now the source of schemas (with the resolver order); catalog matches apply directly and are eligible for autoInsert; index cached for 24 hours in global state, stale copy used offline, never fetched per edit; new setting ylsSchemaLoader.enableFluxCatalog; REMOVED: the bundled mapping (all 53 embedded entries; the extension ships no schema data), GitHub heuristic discovery and its confirmation prompt, the datreeio/CRDs-catalog fallback, settings ylsSchemaLoader.enableWebDiscovery and ylsSchemaLoader.githubRepoHints. Mark the entry as BREAKING. List what changed only: no upgrade notes, migration guidance or deprecation prose (there are no other users of this extension and breaking changes are expected).
10. Version: set 0.3.0 in package.json and in both root "version" fields of package-lock.json (`npm version 0.3.0 --no-git-tag-version` does both; do not create a git tag).
11. Real-endpoint smoke (run by hand once, NOT committed, NOT part of npm test): after `npm run compile`, run a one-off node script that builds createFluxCatalog from the compiled fluxCatalog module in the out directory with the real global fetch and an in-memory store, takes the 53 pairs from `git show main:src/lib/bundledMappingData.json`, and prints lookup() for each. Expected: 52 resolve to https://schemas.fluxoperator.dev/catalog/... URLs and only Kustomization kustomize.config.k8s.io/v1beta1 is undefined. Then `curl -s -o /dev/null -w "%{http_code}"` three of the returned URLs and expect 200. Paste the output in the delivery proof. If any other pair does not resolve, do NOT re-add bundled data and do not add a CHANGELOG note: just report the pair in the delivery.
12. Delivery LEARNINGS must include this line for the orchestrator: "Vault decision 'Prefer First-Party Sources for Schema Lookups' is superseded: the Flux schema catalog (built from upstream CRDs at tagged releases) is now the only shipped source and the extension embeds no schemas; aggregator-as-fallback ordering no longer applies. Update the vault decision note."

KEY FILES:
Delete: src/lib/bundledMapping.ts, src/lib/bundledMapping.test.ts, src/lib/bundledMappingData.json.
Create: test/integration/resolutionChain.test.ts, test/fixtures/resolution-chain.yaml, test/fixtures/resolution-chain-catalog-off.yaml, test/fixtures/resolution-chain-kustomize-override.yaml.
Modify: src/lib/resolver.ts, src/lib/resolver.test.ts, src/settings.ts, src/insertSchemaCommand.ts, src/autoInsert.ts, src/extension.ts (comments only), test/integration/applySchema.test.ts, test/integration/codeActions.test.ts, test/integration/autoInsert.test.ts, test/integration/insertSchemaCommandBranches.test.ts, README.md, CHANGELOG.md, package.json, package-lock.json.

OUT OF SCOPE:
- Compatibility shims, deprecation paths, migration or upgrade notes anywhere (code, README, CHANGELOG): no other users, breaking changes expected. The README note on kinds the catalog does not cover is usage documentation and stays. Never.
- Shipping any default mapping, including the native kustomize entry, in code, data or as a package.json setting default: the user explicitly refused embedded schemas. Never.
- A bundled snapshot of the catalog index as an offline fallback: same reason. Never.
- Publishing to the VS Code Marketplace, git tags, GitHub releases: the user publishes. Never in this backlog.
- Editing the vault decision note: the orchestrator does it from the LEARNINGS line.
- Rewriting schema comments already present in users' files to the new URLs: not requested. Never.
- Any change to src/lib/fluxCatalog.ts or to event wiring: delivered by VYSL-70kn and VYSL-aqw2. A defect found there is reported as a bug, not patched here.
- A committed test that contacts the real catalog: tests must stay offline; the real-endpoint check is the manual smoke in step 11.

DIFF BUDGET:
3 files deleted, 4 created, about 14 modified; roughly 450 lines removed (the JSON data alone is about 265) and under 400 added.

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
- VYSL-aqw2: src/lib/resolver.ts -> Resolution, ResolverDeps, DIRECT_APPLY_SOURCES
    spec: Resolution = override | fluxCatalog | bundled | sessionCache | unresolved; ResolverDeps { overrideEntries: MappingEntry[]; bundledEntries: MappingEntry[]; sessionCache: Map<string, string>; lookupFluxCatalog: (kind: string, apiVersion: string) => Promise<string | undefined> }
    source: story VYSL-aqw2 IMPLEMENTATION step 3
- VYSL-aqw2: src/autoInsert.ts -> autoInsertSchemas
    spec: autoInsertSchemas(document: vscode.TextDocument, sessionCache: Map<string, string>, fluxCatalog: FluxCatalog): Promise<void>
    source: story VYSL-aqw2 IMPLEMENTATION step 5
- VYSL-aqw2: src/insertSchemaCommand.ts -> createInsertSchemaCommandHandler
    spec: createInsertSchemaCommandHandler(sessionCache: Map<string, string>, diagnostics: DiagnosticsProvider, fluxCatalog: FluxCatalog, overrides?: { promptManualUrl?: () => Thenable<string | undefined> }): (uri: vscode.Uri, startLine: number) => Promise<void>
    source: story VYSL-aqw2 IMPLEMENTATION step 4
- VYSL-aqw2: package.json -> configuration without ylsSchemaLoader.enableWebDiscovery / ylsSchemaLoader.githubRepoHints
    source: story VYSL-aqw2 IMPLEMENTATION step 7

PRODUCES:
- src/lib/resolver.ts -> exported MappingEntry and resolveOverride; final Resolution union (override | fluxCatalog | sessionCache | unresolved); final ResolverDeps { overrideEntries, sessionCache, lookupFluxCatalog }; DIRECT_APPLY_SOURCES without 'bundled'.
- src/settings.ts -> getAdditionalMappings typed from './lib/resolver'.
- test/integration/resolutionChain.test.ts -> scripted end-to-end demo of the final chain.
- test/fixtures/resolution-chain.yaml -> five-document demo fixture.
- test/fixtures/resolution-chain-catalog-off.yaml -> same content for the catalog-disabled scenario.
- test/fixtures/resolution-chain-kustomize-override.yaml -> same content for the kustomize additionalMappings scenario.
- README.md, CHANGELOG.md -> 0.3.0 documentation.
- package.json, package-lock.json -> version 0.3.0, updated additionalMappings description.

TESTING:
Default coverage: unit + integration, test-first: retarget and add the tests, watch them fail while the bundled stage still exists, then delete it.
- Unit (src/lib/resolver.test.ts): resolveOverride returns the URL for a known pair and undefined for an unknown pair; override beats catalog; catalog beats session cache; session cache hit; 'unresolved' when nothing matches; 'unresolved' for Kustomization kustomize.config.k8s.io/v1beta1 with no override.
- Integration: resolutionChain.test.ts scenarios A, B and C; retargeted applySchema (comment mode and yamlSchemas mode), codeActions and autoInsert tests, including the bottom-to-top multi-document test.
- Negative paths that must be asserted: Widget stays untouched in all three demo scenarios; native Kustomization stays untouched in A and B; with the catalog off, Stage and ConfigMap stay untouched and fetch count is 0; the quick-fix handler on a Stage with the catalog off and no override reaches the manual-URL path rather than inserting anything on its own.
- No real network in any committed test; no skipped tests.
- Removal check, paste the output: rg -n -i "bundledMapping|bundled mapping|bundled schemas|resolveBundled|github heuristic|githubRepoHints|enableWebDiscovery|CRDs-catalog|datreeio|schemastore" src test package.json  -> no matches in src or package.json; in test only the scenario C override URL. And rg -n -i "bundled mapping|bundled schemas|github heuristic|githubRepoHints|enableWebDiscovery|CRDs-catalog|datreeio" README.md -> no matches. (CHANGELOG.md keeps its history and names the removals in 0.3.0; "esbuild bundle" wording is unrelated and stays.)
- Gates: npm run compile, npm run lint, npm run format:check, npm test, npm run vscode:prepublish all green; paste the output.

Acceptance Criteria:
1. [Ubiquitous] src/lib/bundledMapping.ts, its test and src/lib/bundledMappingData.json are deleted, no 'bundled' resolution source or bundledEntries dependency remains, and the extension ships no schema URL data (removal rg output attached).
2. [Ubiquitous] resolveSchema resolves through exactly: user additionalMappings, Flux catalog, session cache, then 'unresolved'; the override lookup lives in src/lib/resolver.ts and ylsSchemaLoader.additionalMappings behaves as before, checked first.
3. [Event] When auto-insert runs on the five-document demo file with the catalog enabled, the override and the two catalog URLs are inserted above the right documents (bottom-to-top, no line corruption), the native Kustomization and Widget documents are untouched, and the index is fetched exactly once.
4. [Optional] Where the catalog is disabled, the same file gets only the override insertion and zero fetches occur.
5. [Unwanted] The system shall not resolve kustomize.config.k8s.io/v1beta1 Kustomization (or any other kind) from shipped data; it is unresolved unless the user maps it.
6. [Event] When the user adds the README's additionalMappings entry for the native Kustomization, the schema https://json.schemastore.org/kustomization.json is inserted for that document.
7. [Event] When the registered quick-fix command runs on a document matched by a workspace additionalMappings entry with the catalog disabled, it inserts the override URL in both comment and yamlSchemas insertion modes.
8. README.md describes the final chain, states that no schemas are embedded, covers the 24-hour cached index, offline behavior and enableFluxCatalog, contains the native kustomize note with the additionalMappings example verbatim, and has no reference to a bundled mapping, GitHub discovery, githubRepoHints, enableWebDiscovery or the CRDs-catalog (rg output attached).
9. CHANGELOG.md has a 0.3.0 section listing the new source, the new setting and every removal (bundled mapping, GitHub heuristic, confirmation prompt, CRDs-catalog fallback, the two settings), is marked as breaking, and contains no upgrade or migration notes.
10. package.json version is 0.3.0, both root version fields in package-lock.json are 0.3.0, the additionalMappings description no longer mentions a bundled mapping, and no git tag is created.
11. Real-endpoint verification (manual smoke, cannot be checked by stubbed tests): the one-off script output shows 52 of the 53 formerly bundled pairs resolving from the live index and only kustomize.config.k8s.io/v1beta1 Kustomization unresolved, and three returned URLs answer HTTP 200.
12. npm run compile, npm run lint, npm run format:check, npm test and npm run vscode:prepublish pass, and the delivery LEARNINGS contain the vault-decision line from step 12 of IMPLEMENTATION.

PROCESS:
Work only in the git worktree path given in your prompt (worktrees live under .worktrees/, already gitignored); never create or switch branches in the repository root. Commit messages must not mention Claude or Claude Code.

MANDATORY SKILLS TO REVIEW:
superpowers:test-driven-development, superpowers:verification-before-completion

## Acceptance Criteria


## Design


## Notes


## nd_contract
status: delivered

### evidence
- Transitioned via pvg story deliver on 2026-11-24.

### proof
- [ ] Developer evidence block must remain authoritative above this contract.


## History
- 2026-11-24T16:30:01Z dep_added: blocked_by VYSL-70kn
- 2026-11-24T16:30:01Z dep_added: blocked_by VYSL-aqw2
- 2026-11-24T17:15:27Z dep_removed: was_blocked_by VYSL-70kn
- 2026-11-24T17:24:16Z dep_removed: was_blocked_by VYSL-aqw2
- 2026-11-24T17:25:04Z status: open -> in_progress
- 2026-11-24T17:25:04Z auto-follows: linked to predecessor VYSL-70kn
- 2026-11-24T17:25:04Z auto-follows: linked to predecessor VYSL-aqw2
- 2026-11-24T17:25:04Z claimed by dev-VYSL-bhp3
- 2026-11-24T17:32:24Z status: in_progress -> in_progress
- 2026-11-24T17:33:24Z status: in_progress -> closed

## Links
- Parent: [[VYSL-gvc0]]
- Was blocked by: [[VYSL-70kn]], [[VYSL-aqw2]]
- Follows: [[VYSL-70kn]], [[VYSL-aqw2]]

## Comments

### 2026-11-24T17:32:25Z ada
PROOF:
Branch story/VYSL-bhp3, commits 16baebd (implementation) + da52251 (test URL tweak), pushed to origin. Results below are from HEAD da522516b218a69a1764656a9e87b43729c8ab19. No git tag created (`git tag --points-at HEAD` returns nothing).

Commands (worktree, run synchronously):
- npm run compile -> exit 0
- npm run lint -> exit 0, no output
- npm run format:check -> "All matched files use Prettier code style!"
- npm test (pretest compile+bundle, unit, VS Code integration) -> exit 0; unit 68 passing, 0 failing; integration 29 passing, 0 failing, 0 pending
- npm run vscode:prepublish -> exit 0
- pvg verify <11 changed ts files> --include-tests -> VERIFY: PASSED (11 files scanned, 0 issues)
- pvg verify test/integration --check-mocks --include-tests -> MOCK CHECK: PASSED (9 files, 0 mock usages)
- pvg settings verify.command -> empty (the project declares none)
- Coverage: the project has no coverage tooling (no nyc/c8), so there is no percentage to report.

TDD: tests written first. Compile RED: resolver.test.ts failed on missing resolveOverride/MappingEntry exports and on bundledEntries in ResolverDeps. Behavioral RED against the still-bundled code: 4 integration tests failing (demo A and B, where the bundled Kustomization got a schemastore comment; catalog-off autoInsert, where the bundled Stage was inserted; manual-path handler, where the bundled Stage was inserted without a prompt). All green after the bundled stage was removed.

Removal check:
$ rg -n -i "bundledMapping|bundled mapping|bundled schemas|resolveBundled|github heuristic|githubRepoHints|enableWebDiscovery|CRDs-catalog|datreeio|schemastore" src test package.json
test/integration/resolutionChain.test.ts:24:const KUSTOMIZE_OVERRIDE_URL = 'https://json.schemastore.org/kustomization.json';
(only the scenario C override URL; nothing in src or package.json)
$ rg -n -i "bundled mapping|bundled schemas|github heuristic|githubRepoHints|enableWebDiscovery|CRDs-catalog|datreeio" README.md
(no matches, exit 1)
$ rg -c "schemastore|githubusercontent" dist/extension.js -> no matches. The only https URLs left in package.json are the repo's own repository/bugs/homepage metadata plus the catalog link in the enableFluxCatalog description.

Real-endpoint smoke (manual, not committed): a node script built createFluxCatalog from out/src/lib/fluxCatalog.js with the real global fetch and an in-memory store, then looked up the 53 pairs from `git show main:src/lib/bundledMappingData.json`:
TOTAL 53, resolved 52, unresolved: ["kustomize.config.k8s.io/v1beta1 Kustomization"]
(all 52 resolved URLs start with https://schemas.fluxoperator.dev/catalog/)
curl -s -o /dev/null -w "%{http_code}":
200 https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json
200 https://schemas.fluxoperator.dev/catalog/helm.toolkit.fluxcd.io/helmrelease_v2.json
200 https://schemas.fluxoperator.dev/catalog/external-secrets.io/externalsecret_v1.json
No other formerly bundled pair is missing.

Wiring: autoInsertSchemas and createInsertSchemaCommandHandler (registered in extension.ts) build ResolverDeps without bundledEntries. applySchema.test.ts and the insertSchemaForCurrentDocument test in codeActions.test.ts run the REGISTERED commands of the activated extension, with a workspace additionalMappings override and the catalog disabled.

AC verification:
| AC | Evidence |
| 1 | bundledMapping.ts, bundledMapping.test.ts and bundledMappingData.json deleted (git rm); Resolution has no 'bundled'; DIRECT_APPLY_SOURCES test asserts exactly fluxCatalog/override/sessionCache; removal rg above |
| 2 | resolver.ts: MappingEntry + resolveOverride, order override -> catalog -> sessionCache -> unresolved; unit tests: resolveOverride known/unknown pair, override beats catalog, catalog not called on override hit, catalog beats session cache, session cache hit, unresolved; settings.ts imports MappingEntry from ./lib/resolver |
| 3 | resolutionChain.test.ts A: full-file line equality (Warehouse override, Stage + ConfigMap catalog URLs, Kustomization and Widget untouched); requestedUrls deep-equals [index.json] |
| 4 | resolutionChain B: only the Warehouse override is inserted; requestedUrls.length === 0 |
| 5 | unit test: native Kustomization unresolved with no override; demo A/B leave it untouched; no schema data in src/package.json/dist |
| 6 | resolutionChain C: the Kustomization doc gets https://json.schemastore.org/kustomization.json; Widget untouched |
| 7 | applySchema.test.ts comment mode + yamlSchemas mode via the registered insertSchema command with a workspace override and the catalog disabled; codeActions insertSchemaForCurrentDocument likewise. Negative: insertSchemaCommandBranches "catalog disabled, no override" reaches the manual prompt, inserts nothing, and fetches nothing |
| 8 | README: final chain, "Schema sources" (no embedded schemas, 24h cached index in global state, reused offline, no lookups while typing, unresolved until mapped), "Kinds the catalog does not cover" with the example verbatim, settings table with enableFluxCatalog, reworded limitations; README rg shows no matches |
| 9 | CHANGELOG "## 0.3.0 (BREAKING)": new source + order, direct apply/autoInsert, 24h cache/offline/never per edit, enableFluxCatalog, REMOVED bundled mapping (53 entries), GitHub heuristic + confirmation prompt, CRDs-catalog fallback, both settings. No migration notes |
| 10 | package.json version 0.3.0; package-lock.json root "version" fields are both 0.3.0 (npm version --no-git-tag-version); additionalMappings description rewritten as specified; no tag |
| 11 | smoke above: 52/53 resolve, only native Kustomization is undefined; 3 URLs return 200 |
| 12 | all gates green above; LEARNINGS line below |

Notes: I added one extra fixture beyond the story's list, test/fixtures/catalog-disabled-manual-branch.yaml, so the manual-path test does not share an in-memory document with another test (see LEARNINGS). Test-only helpers setStageOverride, setAdditionalMappings and clearAdditionalMappings were added to test/integration/testUtils.ts. The VS Code test host prints DEP0169 url.parse deprecation warnings and "[AgentHostCustomizationMarketplace] Unable to load session-bound SDK installation receipts". Both come from the VS Code 1.147 host process, not from extension code; nothing in src calls url.parse.

LEARNINGS:
- Vault decision 'Prefer First-Party Sources for Schema Lookups' is superseded: the Flux schema catalog (built from upstream CRDs at tagged releases) is now the only shipped source and the extension embeds no schemas; aggregator-as-fallback ordering no longer applies. Update the vault decision note.
- Integration tests that open the same fixture share ONE in-memory TextDocument for the whole VS Code test-host session. An edit made by one test (even a failing one) makes the document "covered" for the next, which can produce a false GREEN. My first RED run showed this: the retargeted catalog-off autoInsert test passed only because another test had already inserted into the same fixture. Give every test that mutates a document its own fixture file.
- Keep the story's removal rg in mind when writing tests: a schemastore URL in a src/lib unit test would break the "no matches in src" proof, so unit tests use placeholder override URLs and only the scenario C demo uses the real README URL.
- The pvg guard blocks `cd` into the worktree, even inside a compound command. Absolute paths with `npm --prefix` and `git -C` work fine. The worktree also needs its own `npm ci`, since node_modules is not shared.
- `pvg verify` takes `--format text` (with a space); `--format=text` is rejected as an unknown flag.
