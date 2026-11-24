---
id: VYSL-70kn
title: "Resolve schemas from the Flux schema catalog index"
status: closed
priority: 1
type: task
labels: [walking-skeleton, accepted]
parent: VYSL-gvc0
created_at: 2026-11-24T16:27:51Z
created_by: ada
updated_at: 2026-11-24T17:15:29Z
content_hash: "sha256:5bab240551f73494e89c7c7a5f2d311c3e14d88d16059dce2a385a2acff70b9a"
assignee: dev-VYSL-70kn
closed_at: 2026-11-24T17:15:27Z
close_reason: "Accepted via pvg story accept"
---

## Description
Description:
Walking skeleton. Add the Flux schema catalog as a resolver stage that sits after user overrides and before the bundled mapping, backed by a TTL-cached copy of the catalog index, gated by a new setting, and wired end-to-end into the quick-fix command and auto-insert as a direct-apply source.

Context:
The extension adamancini.yls-schema-loader (TypeScript, esbuild bundle, mocha) resolves a schema URL for each kind/apiVersion found in a YAML document. Today src/lib/resolver.ts runs: bundled mapping (user additionalMappings merged on top via mergeMappings) -> session cache -> GitHub heuristic -> datreeio/CRDs-catalog. This story inserts the Flux schema catalog and splits user overrides out in front of it. The GitHub and CRDs-catalog stages stay untouched here and are deleted by the next story, and the bundled mapping stays in place here and is deleted entirely by the final story (the user wants no embedded schemas), so do not invest in it; after this story the chain is:
user overrides -> Flux catalog -> bundled -> session cache -> (existing GitHub -> CRDs-catalog tail, unchanged).

Two project patterns apply and are the reason for most of the acceptance criteria:
- Resolver trust boundaries: trust is encoded per source in the resolver result's `source` field. Direct-apply sources apply without confirmation and are eligible for auto-insert.
- Auto-apply must avoid per-edit network triggers: network-touching resolution is never wired to the debounced onDidChangeTextDocument handler. A past bug of exactly this kind was not caught by tests that call functions directly, so the event subscriptions in src/extension.ts must be inspected, not just tested.

USER INTENT:
"Get schemas from the Flux schema catalog as a first-class source of truth." The user wants any kind the catalog knows to resolve instantly and without a prompt, wants this to work offline once the index has been fetched, wants typing in a YAML file to never cause network traffic, and wants air-gapped users to be able to switch the catalog off completely.

Catalog facts (verified 2026-11-24; do not re-derive, do confirm against the fixture you build):
- Index: GET https://schemas.fluxoperator.dev/index.json -> application/json, about 607 KB. Top-level keys: v (4), generatedAt, categories (string[]), projects (array). Regenerated daily.
- Each project has `groups`: [{ "g": "<api group>", "kinds": [ <kind tuple>, ... ] }]. A kind tuple is [lowercaseKind, [versions...], <int>, DisplayKind] with an optional 5th element object (e.g. {"n":["ks"]}); tuples have length 4 or 5. Element 0 is always DisplayKind lowercased. Some projects also carry a `sources` array of sub-members (metadata only; kinds are still under the project's `groups`). Other project keys (alias, cat, repo, version, sha, builtAt, logo, pin, cncf) are irrelevant here.
- Real entries to copy into the fixture verbatim:
  {"name":"kargo","alias":"Kargo","cat":4,"repo":"akuity/kargo","version":"v1.12.6","sha":"b13204661ebc","builtAt":"2026-11-20","groups":[{"g":"kargo.akuity.io","kinds":[["stage",["v1alpha1"],1,"Stage"],["warehouse",["v1alpha1"],1,"Warehouse"]]}]}
  {"name":"flux","alias":"Flux","cat":4,"repo":"fluxcd/flux2","version":"v2.10.1","sha":"23dcfe98fe67","builtAt":"2026-11-20","groups":[{"g":"kustomize.toolkit.fluxcd.io","kinds":[["kustomization",["v1"],1,"Kustomization",{"n":["ks"]}]]},{"g":"notification.toolkit.fluxcd.io","kinds":[["alert",["v1","v1beta3"],3,"Alert"],["provider",["v1","v1beta3"],3,"Provider"],["receiver",["v1"],1,"Receiver"]]}]}
  {"name":"kubernetes","alias":"Kubernetes","cat":0,"repo":"kubernetes/kubernetes","version":"v1.37.2","groups":[{"g":"core","kinds":[["configmap",["v1"],1,"ConfigMap"]]},{"g":"apps","kinds":[["deployment",["v1"],1,"Deployment"]]}]}
  {"name":"argo","alias":"Argo","cat":4,"sources":[{"name":"argo-cd","alias":"Argo CD","repo":"argoproj/argo-cd","version":"v3.6.2","sha":"8e8268ef2f3d","builtAt":"2026-11-20"}],"groups":[{"g":"argoproj.io","kinds":[["applicationset",["v1alpha1"],1,"ApplicationSet",{"n":["appset","appsets"]}],["rollout",["v1alpha1"],1,"Rollout",{"n":["ro"]}]]}]}
- Schema URL: https://schemas.fluxoperator.dev/catalog/<group>/<lowercaseKind>_<version>.json. Verified 200: https://schemas.fluxoperator.dev/catalog/apps/deployment_v1.json, https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json, https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json, https://schemas.fluxoperator.dev/catalog/kustomize.toolkit.fluxcd.io/kustomization_v1.json. Original-case kind (Kustomization_v1.json) returns 404.
- Groupless apiVersion: "v1" -> group "core", version "v1" (so v1 ConfigMap -> https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json). The index has no entries under a literal group "v1".
- kustomize.config.k8s.io/v1beta1 Kustomization is NOT in the catalog (404); it must fall through to the bundled mapping.

IMPLEMENTATION:
1. New pure module src/lib/fluxCatalog.ts (no `vscode` import; src/lib is unit-tested by plain mocha outside VS Code). Exact public contract:

   export const FLUX_CATALOG_INDEX_URL = 'https://schemas.fluxoperator.dev/index.json';
   export const FLUX_CATALOG_SCHEMA_BASE_URL = 'https://schemas.fluxoperator.dev/catalog';
   export const FLUX_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;      // index is regenerated daily
   export const FLUX_CATALOG_RETRY_MS = 5 * 60 * 1000;          // minimum gap between attempts after a failed fetch
   export type CatalogIndex = Record<string, Record<string, string[]>>;   // group -> lowercaseKind -> versions
   export interface CachedCatalog { fetchedAt: number; index: CatalogIndex }
   export interface CatalogStore { get(): CachedCatalog | undefined; set(value: CachedCatalog): Thenable<void> | Promise<void> }
   export function parseCatalogIndex(raw: unknown): CatalogIndex | undefined;
   export function fluxCatalogUrl(index: CatalogIndex, kind: string, apiVersion: string): string | undefined;
   export interface FluxCatalog { lookup(kind: string, apiVersion: string): Promise<string | undefined> }
   export function createFluxCatalog(options: {
     fetchFn: FetchFn;                 // existing type, import from './githubDiscovery' in this story
     store: CatalogStore;
     isEnabled: () => boolean;
     now?: () => number;               // defaults to Date.now
   }): FluxCatalog;

   Behavior:
   - parseCatalogIndex projects the raw index to the compact CatalogIndex (merging groups that appear in more than one project). It returns undefined when raw is not an object, has no `projects` array, or yields zero groups. Malformed projects/groups/tuples are skipped, never thrown on. Store only this compact projection, never the raw 607 KB document: the projection of today's full index is about 306 KB as JSON, and VS Code discourages large globalState values.
   - fluxCatalogUrl splits apiVersion on the first "/": "<group>/<version>" or, with no "/", group "core" and version = the whole string. It returns `${FLUX_CATALOG_SCHEMA_BASE_URL}/${group}/${kind.toLowerCase()}_${version}.json` only when index[group][kind.toLowerCase()] includes version; otherwise undefined. It never returns a URL for a pair the index does not list.
   - lookup(): if isEnabled() is false, return undefined immediately without reading the store or fetching. Otherwise make sure an index is loaded, then return fluxCatalogUrl(...). Loading order: in-memory copy -> store.get() -> fetch. A fetch is attempted only when there is no cached copy or the cached copy is older than FLUX_CATALOG_TTL_MS, and never sooner than FLUX_CATALOG_RETRY_MS after a failed attempt. Concurrent lookups share one in-flight fetch promise. On success: parse, keep in memory, store.set({ fetchedAt: now(), index }). Error handling: on any failure (fetchFn rejects, response.ok false, json() throws, parse returns undefined): keep using the stale cached copy if one exists, otherwise resolve as "no index" (undefined). lookup() never rejects.

2. src/lib/resolver.ts
   - Resolution gains `{ source: 'override'; url: string }` and `{ source: 'fluxCatalog'; url: string }`.
   - ResolverDeps gains `overrideEntries: MappingEntry[]` and `lookupFluxCatalog: (kind: string, apiVersion: string) => Promise<string | undefined>`. `bundledEntries` now means the bundled data only.
   - resolveSchema order: overrideEntries (source 'override') -> lookupFluxCatalog (source 'fluxCatalog') -> bundledEntries (source 'bundled') -> sessionCache -> existing GitHub/CRDs-catalog tail unchanged.
   - Export `DIRECT_APPLY_SOURCES: ReadonlySet<Resolution['source']>` = override, fluxCatalog, bundled, sessionCache, crdsCatalog. This becomes the single definition of the direct-apply bucket.
3. src/lib/bundledMapping.ts: mergeMappings has no caller once overrides are a separate stage; delete it and its tests.
4. src/settings.ts: add `getEnableFluxCatalog(): boolean` reading ylsSchemaLoader.enableFluxCatalog, default true.
5. package.json contributes.configuration: add
   "ylsSchemaLoader.enableFluxCatalog": { "type": "boolean", "default": true, "description": "Resolve schemas from the Flux schema catalog (https://schemas.fluxoperator.dev/catalog/). Its index is downloaded at most once a day and cached. Turn this off in air-gapped environments to prevent any request to schemas.fluxoperator.dev." }
6. src/extension.ts: in activate(), build ONE FluxCatalog with the global `fetch`, isEnabled = getEnableFluxCatalog, and a CatalogStore over context.globalState under the key 'fluxCatalog.index'. Pass it to createInsertSchemaCommandHandler and to autoInsertSchemas. Do not add a fetch at activation: loading is lazy on first lookup. Do not touch the onDidChangeTextDocument subscription (diagnostics refresh only). Update the comment block above handleDocumentOpen so it names the catalog index fetch as the network access being kept off the per-edit path.
7. src/insertSchemaCommand.ts and src/autoInsert.ts: accept the FluxCatalog as a required parameter (signature: createInsertSchemaCommandHandler(sessionCache, diagnostics, fluxCatalog, overrides?) and autoInsertSchemas(document, sessionCache, fluxCatalog, overrides?)), build deps with overrideEntries = getAdditionalMappings(), bundledEntries = bundledMappingData, lookupFluxCatalog = fluxCatalog.lookup. Both use DIRECT_APPLY_SOURCES from resolver.ts instead of their own lists (autoInsert.ts has a local set; insertSchemaCommand.ts has an inline `||` chain). The bottom-to-top loop in autoInsert.ts stays as is.
8. Tests must never reach the real network. Unit tests inject fetchFn and an in-memory CatalogStore. Integration tests build their own FluxCatalog (isEnabled: () => true, stub fetchFn serving the fixture, in-memory store) and pass it in. The activated extension in the test host also has a real catalog on real fetch, and it reacts to documents the tests open, so add a helper to test/integration/testUtils.ts that sets ylsSchemaLoader.enableFluxCatalog=false at ConfigurationTarget.Workspace, and call it in the setup of every integration suite that opens a YAML document or runs a registered command (restore in teardown). Existing tests that expect a bundled Kargo Stage URL keep passing this way; they are retargeted in the final story.

KEY FILES:
Create: src/lib/fluxCatalog.ts, src/lib/fluxCatalog.test.ts, test/fixtures/flux-catalog-index.json (trimmed real-shape index built from the entries above, plus top-level v/generatedAt/categories), test/fixtures/flux-catalog-branch.yaml and any further fixtures the new integration tests need.
Modify: src/lib/resolver.ts, src/lib/resolver.test.ts, src/lib/bundledMapping.ts, src/lib/bundledMapping.test.ts, src/settings.ts, src/extension.ts, src/insertSchemaCommand.ts, src/autoInsert.ts, package.json, test/integration/testUtils.ts, test/integration/autoInsert.test.ts, test/integration/insertSchemaCommandBranches.test.ts, test/integration/settings.test.ts, test/integration/applySchema.test.ts, test/integration/codeActions.test.ts.

OUT OF SCOPE:
- Deleting the GitHub heuristic, CRDs-catalog stage, githubAuth, confirm flow, enableWebDiscovery, githubRepoHints: next story. Leave them compiling and passing.
- Removing the bundled mapping (src/lib/bundledMapping.ts, src/lib/bundledMappingData.json), README, CHANGELOG, version bump: final story.
- ETag / If-None-Match revalidation: the FetchFn type exposes no headers; the user asked for it only if trivial. Never.
- Fetching the index eagerly at activation, a bundled snapshot of the index, a catalog browsing UI, telemetry, version pinning: excluded by the user's "keep the scope simple".
- Verifying that an individual schema URL exists before applying it: the index is the source of truth for coverage; no per-lookup request.

DIFF BUDGET:
About 17 files, under 650 changed LOC including tests and the JSON fixture.

PRODUCES:
- src/lib/fluxCatalog.ts -> createFluxCatalog, FluxCatalog.lookup, parseCatalogIndex, fluxCatalogUrl, CatalogStore, CachedCatalog, CatalogIndex and the four FLUX_CATALOG_* constants, exactly as specified above.
- src/lib/resolver.ts -> Resolution sources 'override' and 'fluxCatalog'; ResolverDeps.overrideEntries and ResolverDeps.lookupFluxCatalog; exported DIRECT_APPLY_SOURCES.
- src/settings.ts -> getEnableFluxCatalog(): boolean.
- package.json -> setting ylsSchemaLoader.enableFluxCatalog (boolean, default true).
- src/insertSchemaCommand.ts -> createInsertSchemaCommandHandler(sessionCache, diagnostics, fluxCatalog, overrides?).
- src/autoInsert.ts -> autoInsertSchemas(document, sessionCache, fluxCatalog, overrides?).
- src/extension.ts -> single FluxCatalog instance backed by context.globalState key 'fluxCatalog.index'.
- test/fixtures/flux-catalog-index.json -> trimmed real-shape catalog index fixture.
- src/lib/fluxCatalog.test.ts -> unit tests for the catalog module.
- test/fixtures/flux-catalog-branch.yaml -> Stage fixture for the quick-fix catalog test.
- test/integration/testUtils.ts -> helper that disables the activated extension's real catalog for a suite.

TESTING:
Default coverage: unit + integration, test-first (write each failing test before the code). No real network in any test; no test may be skipped or gated on connectivity.
Unit, src/lib/fluxCatalog.test.ts (injected fetchFn counting calls, in-memory store, injected now):
- parseCatalogIndex: 4-tuple and 5-tuple kinds, multiple versions per kind, a project with `sources`, the same group in two projects merged; undefined for null, a string, {} and { projects: [] }; malformed tuples skipped.
- fluxCatalogUrl: Stage kargo.akuity.io/v1alpha1; mixed-case kind lowercased (ApplicationSet -> applicationset); v1 ConfigMap -> https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json; Deployment at apiVersion apps/v1; Alert at v1beta3 and at v1; unknown group, unknown kind and unlisted version each undefined; kustomize.config.k8s.io/v1beta1 Kustomization undefined.
- lookup: first call fetches FLUX_CATALOG_INDEX_URL once and writes the store; 10 concurrent lookups -> exactly 1 fetch; a fresh stored copy -> 0 fetches; a stored copy older than the TTL -> 1 fetch and the store is rewritten; stale copy + fetch rejects -> resolves from the stale copy; stale copy + HTTP 500 -> stale copy; no copy + fetch rejects -> undefined and no rejection; after a failure a second lookup inside FLUX_CATALOG_RETRY_MS does not fetch, and one after it does; unparseable body treated as a failure; isEnabled false -> 0 fetches and 0 store reads.
Unit, src/lib/resolver.test.ts: an override beats a catalog hit for the same pair; a catalog hit beats a bundled entry for the same pair; bundled is used when the catalog returns undefined; session cache after bundled; lookupFluxCatalog is not called for an override hit; existing GitHub/CRDs-catalog tests still pass.
Integration (real VS Code host, injected catalog over the fixture): quick-fix handler inserts `# yaml-language-server: $schema=https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json` for a Stage with no confirmation callback invoked and records it in the session cache; auto-insert with autoInsert=true applies the catalog URL on a Stage and applies a two-document file bottom-to-top with both lines correct; with a catalog whose isEnabled is false the same Stage resolves through the bundled entry instead; settings test asserts getEnableFluxCatalog() defaults to true.
Gates: npm run compile, npm run lint, npm test all green; paste the output in the delivery proof.

Acceptance Criteria:
1. [Event] When the quick-fix (or the Insert Schema for Current Document command) runs on a document whose kind/apiVersion is listed in the catalog index, the system inserts the catalog URL https://schemas.fluxoperator.dev/catalog/<group>/<lowercaseKind>_<version>.json with no confirmation prompt and records it in the session cache.
2. [Ubiquitous] Resolution order is user additionalMappings overrides, then Flux catalog, then bundled mapping, then session cache; each of the three orderings is proven by a resolver unit test using the same kind/apiVersion in two sources.
3. [Ubiquitous] Groupless apiVersion v1 resolves under group core, and the kind segment of every generated URL is lowercase.
4. [Event] When no cached index exists or the cached copy is older than 24 hours, the first lookup fetches https://schemas.fluxoperator.dev/index.json once, stores the compact projection with its fetch time in globalState under 'fluxCatalog.index', and concurrent lookups share that single request.
5. [State] While a cached copy younger than 24 hours exists, lookups perform zero network requests, including after a VS Code restart.
6. [State] While the network is unavailable, lookups resolve from the stale cached copy; with no cached copy the catalog stage yields nothing, resolution continues to the bundled mapping, and no error is shown to the user.
7. [Unwanted] The system shall not attempt the index fetch more than once per 5 minutes after a failed attempt, even when many documents are opened.
8. [Unwanted] The system shall not call the catalog lookup or fetch from the onDidChangeTextDocument path under any circumstances; the delivery proof quotes the event subscriptions in src/extension.ts showing the per-edit handler refreshes diagnostics only.
9. [Optional] Where ylsSchemaLoader.enableFluxCatalog is false, the system makes no request to schemas.fluxoperator.dev, does not read the cached index, and resolves through overrides, bundled mapping and session cache; the setting defaults to true and is declared in package.json.
10. [Event] When a document is opened with ylsSchemaLoader.autoInsert true and it resolves through the catalog, the schema is inserted without a prompt; multi-document files are still applied bottom-to-top.
11. [Unwanted] The system shall not return a catalog URL for a kind/apiVersion the index does not list (unknown group, unknown kind, unlisted version), and no test shall contact the real network.
12. npm run compile, npm run lint and npm test pass, with every scenario listed under TESTING implemented.

PROCESS:
Work only in the git worktree path given in your prompt (worktrees live under .worktrees/, already gitignored); never create or switch branches in the repository root. Commit messages must not mention Claude or Claude Code. Record a LEARNINGS note in the delivery if the real index shape differs from what is described here.

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
- 2026-11-24T16:28:46Z dep_added: blocks VYSL-aqw2
- 2026-11-24T16:30:01Z dep_added: blocks VYSL-bhp3
- 2026-11-24T17:05:05Z status: open -> in_progress
- 2026-11-24T17:05:05Z claimed by dev-VYSL-70kn
- 2026-11-24T17:14:09Z status: in_progress -> in_progress
- 2026-11-24T17:15:27Z status: in_progress -> closed
- 2026-11-24T17:15:27Z dep_removed: no_longer_blocks VYSL-aqw2
- 2026-11-24T17:15:27Z dep_removed: no_longer_blocks VYSL-bhp3

## Links
- Parent: [[VYSL-gvc0]]

## Comments

### 2026-11-24T17:14:12Z ada
PROOF:
Commit: 399f591 on story/VYSL-70kn (pushed to origin). All results below are from that SHA, in the story worktree.

Commands and results:
- `npm run compile` (tsc -p ./): exit 0, no errors.
- `npm run lint` (eslint src test *.js): exit 0, 0 errors, 0 warnings.
- `npx prettier --check <all files changed vs ae44f94>`: "All matched files use Prettier code style!"
- `npm test` (pretest compile + esbuild bundle, then unit, then integration): EXIT=0
  - Unit (mocha out/src/lib/**/*.test.js): 110 passing, 0 failing, 0 pending (was 75 before; +29 fluxCatalog, +8 resolver, -2 mergeMappings).
  - Integration (@vscode/test-cli, real VS Code 1.147.0 host with redhat.vscode-yaml): 37 passing, 0 failing, 0 pending. New: "insertSchema command: fluxCatalog branch" (1), "autoInsertSchemas: Flux schema catalog" (3), settings enableFluxCatalog (2).
- Mutation check (TDD red proof for behavior, reverted afterwards): disabling the catalog stage in resolveSchema and removing the retry back-off in fluxCatalog -> unit run 105 passing / 5 failing; restored -> 110 passing.
- `pvg verify <18 changed files>`: 1 issue: src/lib/bundledMapping.ts thin_file (8 LOC). Expected: the story mandates deleting mergeMappings from it, leaving only MappingEntry + resolveBundled; the final epic story deletes this file entirely. Not padded.
- Coverage %: not measured. The project has no coverage tool; installing c8 on the fly was blocked by the session permission policy. Every public function in src/lib/fluxCatalog.ts and every branch named in TESTING has a dedicated unit test (list below).
- No test touches the real network: unit tests inject fetchFn + in-memory store; integration tests use createFixtureFluxCatalog (stub fetch serving test/fixtures/flux-catalog-index.json) and switch the activated extension's real catalog off via ylsSchemaLoader.enableFluxCatalog=false (Workspace) in setup of every suite that opens YAML or runs a command, restoring it in teardown. Auto-insert integration tests now open their document BEFORE turning autoInsert on, so the activated extension's open handler never resolves (and never hits GitHub/CRDs-catalog over the network) on its own.

AC8 evidence: event subscriptions in src/extension.ts (activate):
```
  const debouncedDiagnosticsRefresh = debouncePerKey(
    (doc: vscode.TextDocument) => diagnostics.refresh(doc),
    DIAGNOSTICS_DEBOUNCE_MS,
    (doc: vscode.TextDocument) => doc.uri.toString()
  );

  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => void handleDocumentOpen(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => debouncedDiagnosticsRefresh(e.document)));
  vscode.workspace.textDocuments.forEach((doc) => void handleDocumentOpen(doc));
```
The per-edit handler calls diagnostics.refresh only; diagnosticsProvider.ts imports only yamlDocParser, coverageCheck and settings.getYamlSchemas (no resolver, no catalog, no fetch). The catalog is reached only via handleDocumentOpen -> autoInsertSchemas(doc, sessionCache, fluxCatalog) and the registered INSERT_SCHEMA_COMMAND handler. The comment above handleDocumentOpen now names the Flux schema catalog index fetch as network access kept off the per-edit path.

Wiring: src/extension.ts activate() builds ONE createFluxCatalog({ fetchFn: global fetch, isEnabled: getEnableFluxCatalog, store over context.globalState key 'fluxCatalog.index' }) and passes it to autoInsertSchemas (document open + activation scan) and createInsertSchemaCommandHandler (registered INSERT_SCHEMA_COMMAND, used by the quick-fix and by Insert Schema for Current Document). No fetch at activation; loading is lazy on first lookup.

AC verification:
| AC | Evidence |
|---|---|
| 1 quick-fix inserts catalog URL, no prompt, session cache | integration "insertSchema command: fluxCatalog branch": line 0 == `# yaml-language-server: $schema=https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json`, confirmCandidate and promptManualUrl never called, sessionCache['kargo.akuity.io/v1alpha1::Stage'] set; DIRECT_APPLY_SOURCES includes fluxCatalog |
| 2 order override > catalog > bundled > session cache | resolver.test.ts suite "resolveSchema source order": override beats catalog; catalog beats bundled; bundled used when catalog undefined; bundled beats session cache; catalog beats session cache; lookupFluxCatalog not called on override hit |
| 3 v1 -> core, lowercase kind | fluxCatalogUrl tests: ConfigMap v1 -> .../core/configmap_v1.json; ApplicationSet -> applicationset |
| 4 fetch once when missing/older than 24h, store projection + fetchedAt under 'fluxCatalog.index', concurrent share | lookup tests: first call fetches FLUX_CATALOG_INDEX_URL once and stores {fetchedAt, index}; 10 concurrent -> 1 fetch; stored copy older than TTL -> 1 fetch + store rewritten; extension.ts store key 'fluxCatalog.index' |
| 5 fresh copy -> zero requests incl. restart | "a fresh stored copy (e.g. after a restart) is used with zero fetches" (new catalog instance reading store) |
| 6 offline -> stale copy; no copy -> nothing, falls to bundled, no error | stale+reject and stale+500 resolve from stale; no copy + reject -> undefined, no rejection; resolver test bundled-when-catalog-undefined; lookup() wraps everything in try/catch |
| 7 <=1 attempt per 5 min after failure | "after a failure, no refetch inside FLUX_CATALOG_RETRY_MS (5 lookups), and one refetch after it"; unparseable body counted as failure |
| 8 no catalog/fetch on onDidChangeTextDocument | quoted subscriptions above |
| 9 setting false -> no request, no store read; default true; declared | "isEnabled false -> zero fetches and zero store reads"; integration "with the catalog disabled, the same Stage resolves through the bundled entry and nothing is fetched"; settings tests default true + override; package.json ylsSchemaLoader.enableFluxCatalog (boolean, default true, story text) |
| 10 auto-insert applies catalog URL, multi-doc bottom-to-top | integration "applies a catalog match automatically..." and "applies catalog matches in a two-document file bottom-to-top with both lines correct" (Stage + Warehouse catalog URLs, one shared index fetch) |
| 11 no URL for unlisted pairs; no real network | fluxCatalogUrl: unknown group / unknown kind / unlisted version / kustomize.config.k8s.io/v1beta1 Kustomization -> undefined; lookup returns undefined for unlisted pairs; network isolation described above |
| 12 compile, lint, test green | outputs above |

Diff: 23 files, +1040/-93 vs ae44f94 (over the ~650 LOC budget; most of the excess is tests: fluxCatalog.test.ts ~390 lines, resolver tests +116, prettier-expanded fixture JSON 83 lines).

LEARNINGS:
- The real index shape matched the story; the fixture is the four verbatim entries plus v/generatedAt/categories (prettier reformats the JSON across lines, content is identical).
- The activated extension in the test host races with tests: with autoInsert=true set BEFORE openTextDocument, the extension's own open handler resolves the document first (previously via real GitHub/CRDs-catalog network calls for the widgets fixtures). Opening the document first and then enabling autoInsert avoids it, because autoInsertSchemas checks the setting synchronously before its first await.
- Object.hasOwn in fluxCatalogUrl guards against kinds/groups like "constructor" resolving through the prototype chain of the parsed index.
- pvg verify flags bundledMapping.ts as thin after mergeMappings removal; expected until the final story deletes the file.
- pvg verify no longer accepts --format=text (the developer prompt still documents it).
