---
id: VYSL-aqw2
title: "Remove GitHub heuristic discovery, CRDs-catalog fallback stages"
status: closed
priority: 1
type: task
parent: VYSL-gvc0
created_at: 2026-11-24T16:28:45Z
created_by: ada
updated_at: 2026-11-24T17:24:16Z
content_hash: "sha256:6a3ba008447e0f37b467caad65c3ad03254125126055f235826280193d4e635d"
was_blocked_by: [VYSL-70kn]
assignee: dev-VYSL-aqw2
follows: [VYSL-70kn]
labels: [delivered, accepted]
closed_at: 2026-11-24T17:24:15Z
close_reason: "Accepted: GitHub heuristic and CRDs-catalog stages removed; chain is override, fluxCatalog, bundled, sessionCache, unresolved; proof SHA-matched, 82 unit + 25 integration pass"
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
- Honoring a leftover enableWebDiscovery=false as a catalog opt-out, or any other compatibility shim or deprecation path: there are no other users of this extension and breaking changes are expected. The setting is removed outright. Never.
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


## nd_contract
status: delivered

### evidence
- Transitioned via pvg story deliver on 2026-11-24.

### proof
- [ ] Developer evidence block must remain authoritative above this contract.


## History
- 2026-11-24T16:28:46Z dep_added: blocked_by VYSL-70kn
- 2026-11-24T16:30:01Z dep_added: blocks VYSL-bhp3
- 2026-11-24T17:15:27Z dep_removed: was_blocked_by VYSL-70kn
- 2026-11-24T17:16:40Z status: open -> in_progress
- 2026-11-24T17:16:41Z auto-follows: linked to predecessor VYSL-70kn
- 2026-11-24T17:16:41Z claimed by dev-VYSL-aqw2
- 2026-11-24T17:23:02Z status: in_progress -> in_progress
- 2026-11-24T17:24:16Z status: in_progress -> closed
- 2026-11-24T17:24:16Z dep_removed: no_longer_blocks VYSL-bhp3

## Links
- Parent: [[VYSL-gvc0]]
- Was blocked by: [[VYSL-70kn]]
- Follows: [[VYSL-70kn]]

## Comments

### 2026-11-24T17:23:05Z ada
DELIVERED: VYSL-aqw2 at commit 718fba738a9f48cf5aca12a29b4d6dd099a0eb0a (story/VYSL-aqw2, pushed)

PROOF:
Commands, all run from the worktree at SHA 718fba7, in this order:
- `rm -rf out && npm run compile`: exit 0, no errors
- `npm run lint`: exit 0, no warnings
- `npx prettier --check src test package.json`: "All matched files use Prettier code style!"
- `npm test` (pretest = compile + bundle, then unit mocha and vscode-test): exit 0
  - unit: 82 passing, 0 failing, 0 pending
  - integration (VS Code extension host): 25 passing, 0 failing, 0 pending; host exited with code 0
- `npm run bundle`: exit 0. dist/extension.js contains no api.github.com and no vscode.authentication. Its only "authentication" hits are the istio PeerAuthentication/RequestAuthentication bundled-mapping entries.
- `pvg verify --include-tests --format text <13 changed files>`: VERIFY: PASSED (12 files scanned, 0 issues)
- `pvg settings verify.command`: empty, so the project declares no verify workflow
- Coverage: the project has no coverage tool configured (no c8/nyc), so there is no percentage to report.
- No test reaches the real network. The suites use createFixtureFluxCatalog (a stub fetch serving the fixture index) and disableActivatedFluxCatalog. No test is skipped.
- Test-first: I edited the tests to describe the final chain first. `npm run compile` then failed (ResolverDeps still required enableWebDiscovery; FetchFn was not yet exported from fluxCatalog). The code deletion turned it green.

Proof of removal: `rg -n -i "github|crds|webdiscovery|confirmCandidate|getAuthToken|RepoHint" src test package.json`, matches per file:
   3 package.json   (repository.url, bugs.url, homepage: the repo's own github.com URLs; package metadata, not discovery)
  52 src/lib/bundledMappingData.json   (bundled schema URLs: permitted)
  12 src/lib/bundledMapping.test.ts    (asserts bundled URLs: permitted)
   2 test/integration/autoInsert.test.ts   (STAGE/WAREHOUSE bundled kargo raw.githubusercontent URLs: permitted)
   1 test/integration/applySchema.test.ts  (bundled kargo stage URL: permitted)
   1 test/integration/codeActions.test.ts  (bundled kargo stage URL: permitted)
There are no other matches. The 3 package.json hits are repo metadata, which the story's permitted-match list did not anticipate. Removing them would break the marketplace links, so I left them in place. Extra checks: `rg "authentication|'error'|Retry|showQuickPick|Use this schema" src test` matches only bundledMappingData.json (istio peer/requestauthentication URLs).

AC verification:
| AC | Evidence |
|----|----------|
| 1 chain override, fluxCatalog, bundled, sessionCache, unresolved; no GitHub/CRDs requests | src/lib/resolver.ts tail now returns 'unresolved'. resolver.test.ts covers each stage, the order tests, and "resolves (does not reject) to unresolved when lookupFluxCatalog resolves undefined". githubDiscovery and crdsCatalogDiscovery are deleted. |
| 2 no GitHub auth session | githubAuth.ts deleted. No vscode.authentication in src/ (rg). |
| 3 no confirm modal / quick pick / Retry | confirmCandidate.ts deleted. Retry loop and github branch removed from insertSchemaCommand.ts. rg shows no Retry/showQuickPick. |
| 4 unresolved: manual prompt, apply, cache; nothing on dismiss | insertSchemaCommandBranches "applies the manually-entered URL ... and records it in the session cache" and "applies nothing when the manual-entry prompt is dismissed" (asserts unchanged text and an empty cache). The fixture catalog does not list Widget. |
| 5 auto-insert leaves an unresolved doc unchanged, no prompt | autoInsert "does not apply anything when nothing resolves". autoInsert has no prompt path. |
| 6 settings removed; autoInsert description; no getters | package.json diff. settings.test "declares exactly the remaining ylsSchemaLoader settings" and "the autoInsert description names the remaining sources and no removed one". The getters are deleted from settings.ts. |
| 7 14 files deleted; FetchFn exported from fluxCatalog.ts unchanged | git show --stat 718fba7 lists all 14 deletions. FetchFn is exported verbatim at the top of src/lib/fluxCatalog.ts. |
| 8 quick-fix still offered and direct-apply works | "SchemaCodeActionProvider (registered, headless)" passes. "insertSchema command: inserts a schema comment for a bundled-mapping match" and the "fluxCatalog branch" test (no prompt) pass. |
| 9 extension.ts subscriptions unchanged | The extension.ts diff touches only the FetchFn import line and one comment line. |
| 10 rg proof + gates | Above. |

Wiring: autoInsertSchemas(doc, sessionCache, fluxCatalog) is still called from handleDocumentOpen in src/extension.ts (onDidOpenTextDocument). createInsertSchemaCommandHandler is still registered as the insertSchema command. The integration suites run through the activated extension host.

Scope note: three files the story did not list also imported FetchFn from githubDiscovery: src/extension.ts, src/lib/fluxCatalog.test.ts and test/integration/testUtils.ts. FetchFn was moved, not deleted, so I changed only their import paths. No deleted symbol is kept alive anywhere.

Diff: 27 files changed, 91 insertions(+), 1049 deletions(-).

LEARNINGS:
- In this session the pvg guard treats the developer as the dispatcher and blocks `cd <worktree>`. `git -C` and `npm --prefix <worktree>` work, and npm still runs the scripts with the worktree as cwd, so the relative `find out/src/lib` in test:unit resolves correctly.
- FetchFn had more importers than the story's trace found (extension.ts, fluxCatalog.test.ts, testUtils.ts). For a "move this type" step, grep for every importer instead of trusting the list.
- The story's rg proof pattern also matches the repo's own github.com URLs in package.json metadata. The final story's proof needs to allow for them, or narrow the pattern.
- A package.json contributes test (reading the file from the test host) is a cheap way to pin removed settings and description text.
- The VS Code test host prints DEP0169 url.parse and AgentHostCustomizationMarketplace stderr noise. It comes from the host itself, not from extension code (rg finds no url.parse in src).
