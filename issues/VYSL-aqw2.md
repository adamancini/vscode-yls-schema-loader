---
id: VYSL-aqw2
title: "Remove GitHub heuristic discovery, CRDs-catalog fallback stages"
status: open
priority: 1
type: task
parent: VYSL-gvc0
created_at: 2026-11-24T16:28:45Z
created_by: ada
updated_at: 2026-11-24T16:34:02Z
content_hash: "sha256:a1b8e9cc0c7343b75e9448a8d9cf04aadfaeb4f5d9942164620002eb46bf2661"
blocked_by: [VYSL-70kn]
blocks: [VYSL-bhp3]
---

## Description
Description:
Delete the GitHub heuristic discovery stage and the datreeio/CRDs-catalog fallback stage from the resolver, together with every file, setting, type and test that only those two stages used. After this story the chain is: user overrides -> Flux catalog -> bundled mapping -> session cache -> unresolved.

Context:
The Flux schema catalog stage (VYSL-70kn) now resolves far more kinds than the two network discovery stages ever did. The user's decision: "the github heuristic isn't very reliable so let's just drop it", and remove the datreeio/CRDs-catalog fallback entirely. The dead-code list below was verified against the source at commit ae44f94 by tracing every import; remove exactly this, nothing more.

Verified findings (why each item is dead once the two stages go):
- src/lib/githubDiscovery.ts: discoverGithubSchema is called only from src/lib/resolver.ts. Its exported types GithubCandidate and DiscoveryResult are used only by the files deleted here. Its exported type FetchFn IS still needed by src/lib/fluxCatalog.ts, so the type must move, not vanish.
- src/lib/repoHeuristic.ts: deriveRepoFromApiVersion is called only from githubDiscovery.ts; RepoHint is used only by resolver.ts (githubHints) and src/settings.ts (getGithubRepoHints).
- src/lib/crdsCatalogDiscovery.ts: called only from resolver.ts.
- src/githubAuth.ts: getGithubAuthToken is passed only as ResolverDeps.getAuthToken (src/autoInsert.ts, src/insertSchemaCommand.ts) and exercised by one suite in test/integration/settings.test.ts.
- src/confirmCandidate.ts: confirmGithubCandidate is used only by the `github` branch of src/insertSchemaCommand.ts. No other source is confirm-required, so the whole confirm flow goes.
- Setting ylsSchemaLoader.enableWebDiscovery: read only by getEnableWebDiscovery, which only gates the GitHub + CRDs-catalog tail of resolveSchema.
- Setting ylsSchemaLoader.githubRepoHints: read only by getGithubRepoHints, which only feeds GitHub discovery.
- Resolution source 'error': produced only by the GitHub rate-limit path and by the try/catch around the GitHub/CRDs-catalog calls. The catalog lookup never rejects, so nothing produces 'error' any more, which makes the `while (resolution.source === 'error')` Retry loop in src/insertSchemaCommand.ts dead as well.
- Still used, MUST stay: the 'unresolved' source and the manual-URL prompt (promptManualUrl) in src/insertSchemaCommand.ts; the diagnostic + quick-fix flow (src/diagnosticsProvider.ts, src/codeActionsProvider.ts); the session cache; src/applySchema.ts.

USER INTENT:
The user wants the unreliable guessing gone completely, with no leftover settings, prompts or code paths that suggest it still exists, while the quick-fix and auto-insert keep working exactly as before for every remaining source.

IMPLEMENTATION:
1. Delete files: src/lib/githubDiscovery.ts, src/lib/githubDiscovery.test.ts, src/lib/repoHeuristic.ts, src/lib/repoHeuristic.test.ts, src/lib/crdsCatalogDiscovery.ts, src/lib/crdsCatalogDiscovery.test.ts, src/githubAuth.ts, src/confirmCandidate.ts, test/integration/confirmCandidate.test.ts, and the fixtures test/fixtures/auto-insert-crds-catalog.yaml, test/fixtures/auto-insert-github-only.yaml, test/fixtures/crds-catalog-branch.yaml, test/fixtures/github-branch-accept.yaml, test/fixtures/github-branch-reject.yaml.
2. Move the FetchFn type, unchanged, into src/lib/fluxCatalog.ts and export it from there:
   export type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
3. src/lib/resolver.ts: Resolution becomes
   | { source: 'override'; url: string } | { source: 'fluxCatalog'; url: string } | { source: 'bundled'; url: string } | { source: 'sessionCache'; url: string } | { source: 'unresolved' }
   ResolverDeps becomes exactly { overrideEntries, bundledEntries, sessionCache, lookupFluxCatalog }. Remove enableWebDiscovery, githubHints, fetchFn, getAuthToken, the try/catch tail and both discovery imports. DIRECT_APPLY_SOURCES drops 'crdsCatalog'.
4. src/insertSchemaCommand.ts: remove the Retry loop, the `github` branch, the confirmCandidate and fetchFn overrides and their imports. InsertSchemaCommandOverrides keeps only promptManualUrl. Flow: direct-apply source -> apply and record in the session cache; otherwise ('unresolved') -> manual URL prompt -> apply if a value is entered; then refresh diagnostics.
5. src/autoInsert.ts: remove the AutoInsertOverrides parameter (it only carried fetchFn), getGithubAuthToken, getEnableWebDiscovery, getGithubRepoHints. Signature becomes autoInsertSchemas(document, sessionCache, fluxCatalog). Keep the bottom-to-top loop untouched.
6. src/settings.ts: remove getEnableWebDiscovery, getGithubRepoHints and the RepoHint import.
7. package.json contributes.configuration: remove ylsSchemaLoader.enableWebDiscovery and ylsSchemaLoader.githubRepoHints. Rewrite the ylsSchemaLoader.autoInsert description so it no longer mentions the CRDs-catalog or GitHub: "Automatically insert a schema as soon as one is resolved when a document is opened, with no confirmation prompt. Applies to every resolved source (your additionalMappings, the Flux schema catalog, the session cache). Off by default."
8. src/extension.ts: fix the comment above handleDocumentOpen, which still names GitHub discovery and the CRDs-catalog. Do not change any event subscription.
9. Tests: src/lib/resolver.test.ts drop the GitHub, CRDs-catalog, rate-limit, network-error and getAuthToken tests and fix baseDeps; test/integration/settings.test.ts drop the getGithubAuthToken suite and the removed defaults; test/integration/autoInsert.test.ts drop the CRDs-catalog and GitHub-only tests and their fetch stubs; test/integration/insertSchemaCommandBranches.test.ts drop the `github branch` and `crdsCatalog branch` suites, keep the `unresolved branch` suite and give it a catalog that does not list the Widget kind.

KEY FILES:
Delete: the 14 files listed in step 1.
Modify: src/lib/fluxCatalog.ts, src/lib/resolver.ts, src/lib/resolver.test.ts, src/insertSchemaCommand.ts, src/autoInsert.ts, src/settings.ts, src/extension.ts, package.json, test/integration/settings.test.ts, test/integration/autoInsert.test.ts, test/integration/insertSchemaCommandBranches.test.ts.

OUT OF SCOPE:
- Removing the bundled mapping (src/lib/bundledMapping.ts and src/lib/bundledMappingData.json, whose entries still point at raw.githubusercontent.com/datreeio/CRDs-catalog URLs; that is data, not the discovery stage): the final story deletes it entirely. Leave it working here.
- README.md, CHANGELOG.md, version bump: final story.
- Honoring a leftover enableWebDiscovery=false as a catalog opt-out: the user chose a dedicated enableFluxCatalog setting; the removal is called out in the changelog by the final story. Never.
- Historical documents under docs/superpowers/: they record past plans and are not user documentation. Never.
- Any new behavior. This story only removes.

DIFF BUDGET:
14 files deleted, about 11 files modified; net negative, roughly 900 lines removed and under 80 lines added.

CONSUMES:
- VYSL-70kn: src/lib/fluxCatalog.ts -> FluxCatalog
    spec: interface FluxCatalog { lookup(kind: string, apiVersion: string): Promise<string | undefined> }  // never rejects; undefined when disabled, unlisted, or no index available
    source: story VYSL-70kn IMPLEMENTATION step 1
- VYSL-70kn: src/lib/resolver.ts -> ResolverDeps, DIRECT_APPLY_SOURCES
    spec: ResolverDeps.overrideEntries: MappingEntry[]; ResolverDeps.lookupFluxCatalog: (kind: string, apiVersion: string) => Promise<string | undefined>; export const DIRECT_APPLY_SOURCES: ReadonlySet<Resolution['source']>
    source: story VYSL-70kn IMPLEMENTATION step 2
- VYSL-70kn: src/insertSchemaCommand.ts -> createInsertSchemaCommandHandler
    spec: createInsertSchemaCommandHandler(sessionCache: Map<string, string>, diagnostics: DiagnosticsProvider, fluxCatalog: FluxCatalog, overrides?: InsertSchemaCommandOverrides): (uri: vscode.Uri, startLine: number) => Promise<void>
    source: story VYSL-70kn IMPLEMENTATION step 7
- VYSL-70kn: src/autoInsert.ts -> autoInsertSchemas
    spec: autoInsertSchemas(document: vscode.TextDocument, sessionCache: Map<string, string>, fluxCatalog: FluxCatalog, overrides?: AutoInsertOverrides): Promise<void>
    source: story VYSL-70kn IMPLEMENTATION step 7

PRODUCES:
- src/lib/fluxCatalog.ts -> exported type FetchFn (moved from the deleted githubDiscovery.ts, signature unchanged).
- src/lib/resolver.ts -> Resolution union (override | fluxCatalog | bundled | sessionCache | unresolved) and ResolverDeps { overrideEntries, bundledEntries, sessionCache, lookupFluxCatalog }; the bundled members are removed by the final story.
- src/insertSchemaCommand.ts -> createInsertSchemaCommandHandler(sessionCache, diagnostics, fluxCatalog, overrides?: { promptManualUrl? }).
- src/autoInsert.ts -> autoInsertSchemas(document, sessionCache, fluxCatalog).
- src/settings.ts -> settings surface without getEnableWebDiscovery / getGithubRepoHints.
- package.json -> configuration without enableWebDiscovery / githubRepoHints.

TESTING:
Default coverage: unit + integration. This is a removal, so the test-first step is: first change the tests to describe the final chain (they fail to compile or fail), then delete code until compile, lint and tests are green.
- Resolver unit tests for the final chain: override, fluxCatalog, bundled, sessionCache, and 'unresolved' when nothing matches; resolveSchema resolves to 'unresolved' (does not reject) when lookupFluxCatalog resolves undefined.
- Integration: unresolved branch applies a manually entered URL and records it in the session cache; applies nothing when the prompt is dismissed; auto-insert leaves an unresolved Widget document untouched; quick-fix and auto-insert catalog tests from VYSL-70kn still pass; the registered quick-fix code action still appears for an uncovered document.
- No real network in any test; no skipped tests.
- Proof of removal: paste the output of
  rg -n -i "github|crds|webdiscovery|confirmCandidate|getAuthToken|RepoHint" src test package.json
  The only permitted matches are schema URLs inside src/lib/bundledMappingData.json and tests asserting those URLs (both retired by the final story).
- Gates: npm run compile, npm run lint, npm test, npm run bundle all green.

Acceptance Criteria:
1. [Ubiquitous] resolveSchema resolves through exactly: user overrides, Flux catalog, bundled mapping, session cache, then 'unresolved'; no code path performs GitHub API, GitHub code search, or raw.githubusercontent.com datreeio/CRDs-catalog requests.
2. [Unwanted] The system shall not request a GitHub authentication session under any code path; no reference to vscode.authentication remains in src/.
3. [Unwanted] The system shall not show a "Use this schema?" confirmation modal, a candidate quick pick, or a rate-limit Retry warning under any code path.
4. [Event] When a kind/apiVersion resolves to 'unresolved', the quick-fix still displays the manual schema URL prompt so the user can enter one, applies it when one is entered, records it in the session cache, and applies nothing when the prompt is dismissed.
5. [Event] When auto-insert meets an unresolved document it leaves the document unchanged and shows no prompt.
6. [Ubiquitous] package.json no longer declares ylsSchemaLoader.enableWebDiscovery or ylsSchemaLoader.githubRepoHints, the autoInsert description names neither GitHub nor the CRDs-catalog, and src/settings.ts has no getter for the removed settings.
7. [Ubiquitous] The 14 files listed in IMPLEMENTATION step 1 are deleted and FetchFn is exported from src/lib/fluxCatalog.ts with its signature unchanged.
8. [State] While the diagnostic for an uncovered document is shown, the "Insert yaml-language-server schema" quick-fix is still offered and still applies direct-apply sources without a prompt.
9. The event subscriptions in src/extension.ts are unchanged apart from comments (onDidOpenTextDocument -> auto-insert then diagnostics; onDidChangeTextDocument -> debounced diagnostics only).
10. The rg proof-of-removal output is attached and shows only the permitted matches; npm run compile, npm run lint, npm test and npm run bundle pass.

PROCESS:
Work only in the git worktree path given in your prompt (worktrees live under .worktrees/, already gitignored); never create or switch branches in the repository root. Commit messages must not mention Claude or Claude Code. If you find a use of any deleted symbol that this story did not anticipate, stop and report it instead of keeping the symbol alive.

MANDATORY SKILLS TO REVIEW:
superpowers:test-driven-development, superpowers:verification-before-completion

## Acceptance Criteria


## Design


## Notes


## History
- 2026-11-24T16:28:46Z dep_added: blocked_by VYSL-70kn
- 2026-11-24T16:30:01Z dep_added: blocks VYSL-bhp3

## Links
- Parent: [[VYSL-gvc0]]
- Blocks: [[VYSL-bhp3]]
- Blocked by: [[VYSL-70kn]]

## Comments
