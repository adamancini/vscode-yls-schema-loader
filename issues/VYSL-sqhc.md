---
id: VYSL-sqhc
title: "Offer to restore a missing schema directive for yaml.schemas-associated files"
status: closed
priority: 1
type: task
labels: [walking-skeleton, delivered, accepted]
parent: VYSL-0jlx
created_at: 2026-11-24T19:13:54Z
created_by: ada
updated_at: 2026-11-24T19:25:08Z
content_hash: "sha256:e042f2bd02ba262ccdd7b4c933475d7a2e902a260757c2074be8600bb99ee07d"
assignee: dev-VYSL-sqhc
closed_at: 2026-11-24T19:25:08Z
close_reason: "Accepted via pvg story accept"
---

## Description
Description:
Offer to restore a missing `# yaml-language-server: $schema=` directive: a document with no inline directive whose file matches a URL-keyed `yaml.schemas` pattern gets a distinct info diagnostic and a quick-fix that inserts the comment with the settings URL. Walking skeleton of the epic: pure state logic -> diagnostic -> quick-fix edit -> command, end to end in a real VS Code host.

Context:
The extension (TypeScript, VS Code engine ^1.90.0, esbuild bundle) detects `kind`/`apiVersion` in YAML documents and wires a yaml-language-server schema. Today `isCovered(text, startLine, relativePath, yamlSchemas)` in src/lib/coverageCheck.ts returns true when the document has an inline comment OR the file matches any `yaml.schemas` glob, so src/diagnosticsProvider.ts skips a settings-associated document whose directive was deleted. This story splits that into three states. `ylsSchemaLoader.autoInsert` behavior is NOT changed here.

Existing code this story builds on (verified on main @ a451edf):
- src/lib/coverageCheck.ts: `export type YamlSchemasSetting = Record<string, string | string[]>` (key = schema URL, value = one pattern or a list); `isCovered(...)`.
- src/lib/schemaCommentDetector.ts: `hasSchemaComment(text: string, startLine: number): boolean` scans forward from startLine over blank and comment lines.
- src/lib/globMatch.ts: `matchesAnyGlob(relativePath: string, globs: string[]): boolean` normalizes backslashes to `/`, matches with minimatch `{ dot: true }`, and also tries the pattern with leading `/` stripped. `*.yaml` matches only root-level files; `**/*.yaml` matches every file.
- src/lib/yamlDocParser.ts: `parseKindApiVersions(text): { docIndex, kind, apiVersion, startLine }[]` returns only documents with string `kind` and `apiVersion`.
- src/diagnosticsProvider.ts: `DIAGNOSTIC_SOURCE = 'ylsSchemaLoader'`; `createDiagnosticsProvider()` returns `{ collection, refresh(document), dispose }`; refresh publishes "No yaml-language-server schema associated with this <kind>." (Information) on the document's startLine for each uncovered document.
- src/codeActionsProvider.ts: `SchemaCodeActionProvider.provideCodeActions` builds one action per `DIAGNOSTIC_SOURCE` diagnostic; on an Invoke trigger it resolves (may reach the catalog) and attaches `buildSchemaCommentEdit`; Automatic triggers never resolve.
- src/applySchema.ts: `buildSchemaCommentEdit(uri, startLine, url): vscode.WorkspaceEdit` (inserts `# yaml-language-server: $schema=<url>\n` at line startLine, column 0); `insertionModeWritesComment(mode): boolean` (true for `comment` and `both`); `applyResolution(document, startLine, url, insertionMode, options?)`, which with insertionMode `'comment'` inserts only the comment and never touches `yaml.schemas`.
- src/insertSchemaCommand.ts: `createInsertSchemaCommandHandler(sessionCache, diagnostics, fluxCatalog, overrides?)` returns `(uri, startLine, resolvedUrl?, commentAlreadyInserted?) => Promise<void>`; it does not check coverage before resolving through additionalMappings -> Flux catalog -> session cache.
- src/settings.ts: `getInsertionMode(): 'comment' | 'yamlSchemas' | 'both'`, `getYamlSchemas(): YamlSchemasSetting`.
- src/extension.ts: diagnostics refresh on open and, debounced 300 ms, on every edit. No change needed there.

Why the quick-fix is an edit: VS Code's diagnostic-hover "Quick Fix..." menu applies `CodeAction.edit` but never runs `CodeAction.command` (fixed for the existing quick-fix in v0.3.3). The restore URL comes from settings, so building the edit is local and cheap; attach it on every trigger kind and attach no command. Known and accepted: in the user's VS Code the hover's Quick Fix menu closes itself within about a second. Do not try to fix that.

Why non-URL keys are excluded: yaml-language-server resolves a directive value that does not start with `http` or `file:` as a file path relative to the document's directory. A key such as the alias `kubernetes` or a workspace-relative schema path would produce a broken directive that overrides the working settings association.

USER INTENT:
When the user deletes (or never had) the inline directive in a file they already mapped in `yaml.schemas`, the extension must notice and offer a one-click fix that puts back exactly the URL their settings point at. They must be able to trust that the URL is chosen predictably when several settings entries match, that nothing is offered in `yamlSchemas` mode (where settings-only is intentional), and that the fix never rewrites their settings or produces a directive that breaks validation.

IMPLEMENTATION:
1. src/lib/coverageCheck.ts (pure, no `vscode` import). Keep `isCovered` and `YamlSchemasSetting`. Add:
   - `settingsSchemaUrl(relativePath: string, yamlSchemas: YamlSchemasSetting): string | undefined` implementing the URL SELECTION RULE below.
   - `type CoverageState = { state: 'covered' } | { state: 'restorable'; url: string } | { state: 'uncovered' }`
   - `coverageState(text: string, startLine: number, relativePath: string, yamlSchemas: YamlSchemasSetting, writesComment: boolean): CoverageState`:
     inline comment present (`hasSchemaComment`) -> covered; no pattern of any key matches -> uncovered; a pattern matches and `writesComment` is true and `settingsSchemaUrl` returns a URL -> restorable with that URL; otherwise -> covered.
   URL SELECTION RULE (user decision). Candidates: every (key, pattern) pair where the key matches `/^(https?:\/\/|file:)/i` and the pattern matches relativePath (use `matchesAnyGlob(relativePath, [pattern])`). Normalize path and pattern for comparison: backslashes -> `/`, strip leading `/`.
     (1) An exact path beats any glob: a pattern whose normalized form equals the normalized relativePath wins.
     (2) Among globs, the more specific folder path wins: specificity = number of literal leading directory segments of the normalized pattern before the first glob metacharacter (`*`, `?`, `[`, `{`); the file-name segment is never counted. `apps/team-ada/kargo/*.yaml` = 3, `apps/**/*.yaml` = 1, `*.yaml` = 0, `**/*.yaml` = 0. Higher wins.
     (3) Still tied: the lexically smallest pattern string as written in settings wins (ascending, plain code-unit compare, i.e. `<`). Same pattern under two URLs: the lexically smallest URL wins.
2. src/diagnosticsProvider.ts: export `RESTORE_DIAGNOSTIC_CODE = 'restoreDirective'` and `RESTORE_DIAGNOSTIC_MESSAGE = 'Schema is associated via yaml.schemas but the inline directive is missing.'`. In `refresh`, use `coverageState(text, doc.startLine, relativePath, yamlSchemas, insertionModeWritesComment(getInsertionMode()))`: covered -> nothing; uncovered -> today's diagnostic, unchanged, with no `code`; restorable -> Information diagnostic on the same line range, source `DIAGNOSTIC_SOURCE`, `code = RESTORE_DIAGNOSTIC_CODE`, message `RESTORE_DIAGNOSTIC_MESSAGE`.
3. src/codeActionsProvider.ts: for a diagnostic whose `code === RESTORE_DIAGNOSTIC_CODE`, return a QuickFix titled `Restore yaml-language-server schema directive` with `diagnostics = [diagnostic]`, `edit = buildSchemaCommentEdit(document.uri, startLine, url)` where `url = settingsSchemaUrl(asRelativePath(document.uri, false), getYamlSchemas())`, and NO command, on every trigger kind. If the URL is now undefined (settings changed since the diagnostic was published) return no action for that diagnostic. This path must not call `resolveSchema` or the catalog. All other diagnostics keep today's behavior byte for byte.
4. src/insertSchemaCommand.ts: when not on the `commentAlreadyInserted` path, compute `coverageState` for the target document before resolving. If restorable, call `applyResolution(document, targetStartLine, state.url, 'comment')`, refresh diagnostics and return: no `resolveSchema`, no catalog lookup, no manual prompt, no session-cache write, no `yaml.schemas` write (also in `both` mode). This keeps the command palette's "Insert Schema for Current Document" and the lightbulb consistent with the quick-fix. Every other state keeps today's behavior.
5. After the edit lands, the existing debounced refresh in src/extension.ts clears the diagnostic. Do not add wiring.

KEY FILES:
- src/lib/coverageCheck.ts, src/lib/coverageCheck.test.ts (modify)
- src/diagnosticsProvider.ts, src/codeActionsProvider.ts, src/insertSchemaCommand.ts (modify)
- test/integration/restoreDirective.test.ts (create)
- test/fixtures/restore-diagnostic.yaml, test/fixtures/restore-diagnostic-multidoc.yaml, test/fixtures/restore-quickfix.yaml, test/fixtures/restore-command.yaml, test/fixtures/restore-command-both-mode.yaml (create)

OUT OF SCOPE:
- Auto-insert of the restore on document open (src/autoInsert.ts): lands in the capstone story of this epic. After this story auto-insert still skips settings-associated documents.
- README, CHANGELOG, package.json description and version changes: capstone story. Do not touch package.json here (test/integration/settings.test.ts pins setting descriptions verbatim).
- Restoring non-URL keys (aliases such as `kubernetes`, relative or absolute paths): never, they yield a broken directive.
- Documents without `kind`/`apiVersion`: never in this epic; the whole detection pipeline keys on `parseKindApiVersions`.
- Replacing or de-duplicating an existing inline directive, including the command's existing behavior on a document that already has one: unchanged.
- Changing `matchesAnyGlob` semantics, or making them match yaml-language-server's own matching: not in this epic.
- A "restore all documents in this file" quick-fix: each diagnostic's quick-fix restores its own document.
- The hover Quick Fix menu closing itself after about a second: VS Code issue, accepted.

DIFF BUDGET:
About 11 files. Production: 4 files, under 150 changed LOC. Tests: under 500 LOC (unit + integration) plus 5 small fixtures. A production overrun signals scope creep; test volume alone does not.

PRODUCES:
- src/lib/coverageCheck.ts -> `settingsSchemaUrl(relativePath: string, yamlSchemas: YamlSchemasSetting): string | undefined`; `type CoverageState = { state: 'covered' } | { state: 'restorable'; url: string } | { state: 'uncovered' }`; `coverageState(text: string, startLine: number, relativePath: string, yamlSchemas: YamlSchemasSetting, writesComment: boolean): CoverageState`. `isCovered` and `YamlSchemasSetting` unchanged.
- src/diagnosticsProvider.ts -> `RESTORE_DIAGNOSTIC_CODE = 'restoreDirective'`, `RESTORE_DIAGNOSTIC_MESSAGE = 'Schema is associated via yaml.schemas but the inline directive is missing.'`; restorable documents get that diagnostic.
- src/codeActionsProvider.ts -> edit-only QuickFix `Restore yaml-language-server schema directive` for restore diagnostics.
- src/insertSchemaCommand.ts -> the insert command restores a restorable document with the settings URL, comment only.
- test/integration/restoreDirective.test.ts -> integration suite for the offer path.
- test/fixtures/restore-diagnostic.yaml -> fixture, one Kargo Stage document without a directive (read-only tests)
- test/fixtures/restore-diagnostic-multidoc.yaml -> fixture, two documents, the first with an inline directive and the second without (read-only tests)
- test/fixtures/restore-quickfix.yaml -> fixture, one Kargo Stage document, mutated by the hover-path test only
- test/fixtures/restore-command.yaml -> fixture, one Kargo Stage document, mutated by the comment-mode command test only
- test/fixtures/restore-command-both-mode.yaml -> fixture, one Kargo Stage document, mutated by the both-mode command test only

TESTING:
Default coverage: unit + integration, test first (RED before GREEN; confirm each RED fails for the intended reason on a fresh fixture, not merely that it fails). No mocks in integration tests: real VS Code host, real documents, real workspace settings.
Unit (src/lib/coverageCheck.test.ts), one test per line:
- exact path beats a glob, regardless of key order in the object
- glob specificity: `apps/team-ada/kargo/*.yaml` beats `apps/**/*.yaml`, which beats `**/*.yaml`, for `apps/team-ada/kargo/stage.yaml`
- equal specificity: lexically smaller pattern wins (for example `apps/*.yaml` vs `apps/*.{yaml,yml}`)
- same pattern under two URLs: lexically smaller URL wins
- a pattern written with a leading slash counts as exact for the same relative path without it; backslash-separated paths normalize
- value given as a single string and as an array both work
- non-URL keys (the alias `kubernetes`, a relative schema file path) are never returned; with a URL key and an alias both matching, the URL key is returned
- nothing matches -> undefined
- `coverageState`: inline comment -> covered (even when settings match); settings match + writesComment true -> restorable with the URL; settings match + writesComment false -> covered; only a non-URL key matches -> covered; no match -> uncovered
- existing `isCovered` tests still pass unchanged
Integration (test/integration/restoreDirective.test.ts). Isolation rules, all mandatory:
- Every test that mutates a document uses its own dedicated fixture file: all tests that open the same path share ONE in-memory document for the whole host session, so a shared fixture gives a false GREEN.
- Suite setup calls `disableActivatedFluxCatalog` (test/integration/testUtils.ts); any injected catalog comes from `createFixtureFluxCatalog`. No test may reach the real network. Use schema URLs on the reserved host `schemas.example.invalid` so nothing can be fetched.
- Tests that set `yaml.schemas` or `ylsSchemaLoader.insertionMode` (Workspace target) restore them to `undefined` in teardown. The workspace root is the repo root, so a fixture's relative path is `test/fixtures/<name>.yaml`.
- Assert diagnostics through a provider the test creates (`createDiagnosticsProvider()`, `refresh(doc)`, `collection.get(uri)`), and dispose it; the activated extension publishes to its own collection.
Scenarios:
- comment mode, exact-path mapping: restore diagnostic with the exact message, Information severity, source, code, on the document's start line
- both mode: same diagnostic
- yamlSchemas mode: no diagnostic for the same file
- glob mapping (`test/fixtures/restore-*.yaml`): diagnostic published
- alias-only mapping (`kubernetes`): no diagnostic
- multi-document fixture: only the document lacking a directive gets the restore diagnostic
- unmapped file: today's "No yaml-language-server schema associated..." diagnostic, with no code (regression)
- provider, Invoke and Automatic trigger: one action, title as specified, edit inserts exactly `# yaml-language-server: $schema=<settings URL>\n` at (startLine, 0), no command; a counting catalog records zero lookups and zero fetches
- two matching entries (exact + glob): the edit carries the exact-path URL
- applying only the action's edit (hover path) to the dedicated fixture leaves exactly one directive, above the right document, and a refreshed provider reports no diagnostic
- settings entry removed after the diagnostic was built: no action returned
- command on a restorable document, comment mode: settings URL inserted, catalog not consulted (counting catalog: zero lookups) even though the fixture catalog knows the kind, manual prompt not called, session cache still empty
- command on a restorable document, both mode: comment inserted and `yaml.schemas` deep-equals its value from before the command

PROCESS (applies to every step):
- Work only in the dispatcher-managed worktree named in your prompt's `Work in:` line. The pvg guard blocks `cd` into worktrees, even inside compound commands: use absolute paths, `git -C <abs-worktree>` and `npm --prefix <abs-worktree>`.
- Run `npm --prefix <abs-worktree> ci` first; node_modules is not shared between worktrees. The first `npm test` in a fresh worktree downloads VS Code and redhat.vscode-yaml into the worktree's .vscode-test directory (existing harness behavior).
- Never stage anything under `.vault/`. Commit messages must not mention Claude.
- No coverage tool is configured; report test counts, not a percentage.
- VS Code test-host stderr noise (DEP0169 url.parse, AgentHostCustomizationMarketplace) comes from the host, not from extension code.
- Gates, all green before delivery, run from a clean build because mocha globs compiled tests in out/ and stale files inflate counts: `npm run compile`, `npm run lint`, `npx prettier --check .`, `rm -rf out dist && npm test`. Report the unit and integration test counts before and after (baseline on main @ a451edf: record it from your own clean run) and explain the delta.

Acceptance Criteria:
1. [State] While `ylsSchemaLoader.insertionMode` is `comment` or `both`, a recognized document with no inline directive whose file matches a `yaml.schemas` pattern (exact relative path or glob) under an `http://`, `https://` or `file:` key has an Information diagnostic with source `ylsSchemaLoader`, code `restoreDirective` and the exact message "Schema is associated via yaml.schemas but the inline directive is missing."
2. [State] While `ylsSchemaLoader.insertionMode` is `yamlSchemas`, the same document has no diagnostic (today's behavior).
3. [Ubiquitous] The settings URL is chosen by the three-step rule: exact path beats any glob; among globs the higher count of literal leading directory segments wins; then the lexically smallest pattern, then the lexically smallest URL. Each step has its own unit test.
4. [Event] When code actions are requested for a restore diagnostic (Invoke or Automatic), the provider returns a QuickFix titled "Restore yaml-language-server schema directive" whose edit inserts exactly `# yaml-language-server: $schema=<settings URL>` plus a newline at the document's start line, with no command. Error handling: if no settings entry matches any more when actions are requested, no action is returned and nothing throws.
5. [Event] When only that edit is applied (the hover path), the file holds exactly one directive above the right document and a diagnostics refresh publishes nothing for it.
6. [Event] When the insert command runs on a restorable document, it inserts the settings URL as a comment and does not consult the catalog, prompt, or write the session cache.
7. [Unwanted] The restore shall not write `yaml.schemas`, even in `both` mode: the setting deep-equals its prior value after the quick-fix edit and after the command.
8. [Unwanted] The restore path shall not call `resolveSchema`, the Flux catalog or the network on any trigger kind or on the per-edit diagnostics refresh; a counting catalog proves zero lookups.
9. [Unwanted] A `yaml.schemas` key that is not an `http://`, `https://` or `file:` URL (for example the alias `kubernetes`) shall not produce a restore diagnostic or quick-fix; the document stays covered.
10. [Ubiquitous] Unmapped documents keep today's diagnostic, quick-fix and command behavior; in a multi-document file only documents lacking a directive are flagged. The broad-glob consequence holds: a catch-all URL-keyed mapping such as `**/*.yaml` flags every matching recognized document that lacks a directive.
11. Every mutating integration test uses a dedicated fixture, no test reaches the real network (real catalog disabled, stub catalog injected, `.invalid` schema hosts), and tests that set `yaml.schemas` restore it in teardown.
12. `npm run compile`, `npm run lint`, `npx prettier --check .` and `rm -rf out dist && npm test` are green from a clean build, with test counts reported and the delta explained.

MANDATORY SKILLS TO REVIEW:
superpowers:test-driven-development, superpowers:verification-before-completion

## Acceptance Criteria


## Design


## Notes
COMPLETED: implemented and delivered at 97bb604 (unit 81, integration 56 passing). NEXT: PM review.

## nd_contract
status: delivered

### evidence
- Transitioned via pvg story deliver on 2026-11-24.

### proof
- [ ] Developer evidence block must remain authoritative above this contract.


## History
- 2026-11-24T19:14:53Z dep_added: blocks VYSL-uk3t
- 2026-11-24T19:17:19Z status: open -> in_progress
- 2026-11-24T19:17:19Z claimed by dev-VYSL-sqhc
- 2026-11-24T19:24:13Z status: in_progress -> in_progress
- 2026-11-24T19:25:08Z status: in_progress -> closed
- 2026-11-24T19:25:08Z dep_removed: no_longer_blocks VYSL-uk3t

## Links
- Parent: [[VYSL-0jlx]]

## Comments

### 2026-11-24T19:24:13Z ada
PROOF:
Commit: 97bb604 on story/VYSL-sqhc (pushed to origin). Worktree: .claude/worktrees/dev-VYSL-sqhc.

Commands (run from the worktree via npm --prefix, clean build):
- npm run compile -> exit 0
- npm run lint (eslint src test *.js) -> exit 0, no output
- npx prettier --check (repo .gitignore + .prettierignore) -> All matched files use Prettier code style!
- rm -rf out dist && npm test -> exit 0. Unit: 81 passing, 0 failing. Integration: 56 passing, 0 failing, 0 pending.
- Baseline on main @ 6653720 (same clean procedure): unit 68 passing, integration 40 passing.
- Delta: +13 unit (8 settingsSchemaUrl + 5 coverageState in src/lib/coverageCheck.test.ts; the 3 existing isCovered tests are unchanged), +16 integration (test/integration/restoreDirective.test.ts: 9 diagnostics, 5 quick-fix, 2 command).
- pvg verify (6 changed source/test files, --include-tests) -> VERIFY: PASSED (0 issues); pvg verify --check-mocks -> PASSED (0 mock usages).
- pvg gates <changed files> -> GATES: PASS (0 warn). (An unscoped pvg gates from the project root FAILS on duplication/file_loc because it scans the main checkout, the worktree copy and .vscode-test VS Code binaries together; none of the blocks are in this diff.)
- pvg settings verify.command -> empty (no project verify workflow).
- Coverage: no coverage tool is configured; counts reported instead.

RED evidence: with behavior-preserving stubs (settingsSchemaUrl returns undefined, coverageState mirrors isCovered, constants exported), unit run gave 73 passing / 8 failing (all AssertionError on the expected URL/restorable state), integration gave 44 passing / 12 failing (all AssertionError: missing restore diagnostic, wrong action title/edit, command inserted the catalog URL). The 4 integration tests that passed on the stub are the negative/regression ones (constants, yamlSchemas mode, alias-only, unmapped).

Wiring: diagnostics come from createDiagnosticsProvider().refresh (already called on open and debounced edit in src/extension.ts); the quick-fix comes from SchemaCodeActionProvider (already registered in extension.ts); the command path is createInsertSchemaCommandHandler (already registered). Integration tests drive those exact entry points in a real VS Code host with real workspace settings.

AC table:
1 restore diagnostic in comment/both, exact or glob, URL key -> 'comment mode, exact-path mapping', 'both mode', 'glob mapping', 'catch-all URL mapping' (asserts message, Information, source, code, start line) - PASS
2 yamlSchemas mode no diagnostic -> 'yamlSchemas mode: no diagnostic' + unit 'settings match with writesComment false is covered' - PASS
3 three-step URL rule, one unit test per step -> 'an exact path beats a glob regardless of key order', 'more literal leading directory segments win', 'equal specificity: lexically smaller pattern wins', 'same pattern under two URLs: lexically smaller URL wins' (+ leading slash/backslash, string/array, non-URL keys, no match); integration 'exact path and glob both match' - PASS
4 QuickFix title, exact edit at (startLine,0), no command, Invoke + Automatic; no action when settings no longer match -> 'Invoke trigger...', 'Automatic trigger...', 'settings entry removed after the diagnostic was built' - PASS
5 hover path: one directive, refreshed provider publishes nothing -> 'hover path: applying only the edit...' (restore-quickfix.yaml) - PASS
6 command inserts settings URL, no catalog/prompt/session cache -> 'comment mode: inserts the settings URL without catalog, prompt or session cache' (fixture catalog knows Stage; zero lookups, zero fetches, prompt not called, cache size 0) - PASS
7 yaml.schemas not written -> hover-path test deep-equals yaml.schemas before/after; 'both mode: inserts the comment and leaves yaml.schemas exactly as it was' - PASS
8 no resolveSchema/catalog/network -> counting catalog zero lookups and zero requestedUrls on Invoke, Automatic and command; diagnostics refresh has no catalog dependency - PASS
9 non-URL keys not restored -> 'alias-only mapping (kubernetes)' + unit non-URL key tests + coverageState 'only a non-URL key matching is covered' - PASS
10 unmapped unchanged; multi-doc flags only the bare doc; catch-all flags -> 'unmapped file keeps the existing diagnostic with no code', 'multi-document file' (line 6 only), 'catch-all URL mapping', all 40 pre-existing integration tests pass - PASS
11 isolation -> each mutating test has its own fixture (restore-quickfix, restore-command, restore-command-both-mode); every suite setup calls disableActivatedFluxCatalog; catalogs from createFixtureFluxCatalog; URLs on schemas.example.invalid; teardown resets yaml.schemas, insertionMode, enableFluxCatalog to undefined (.vscode/settings.json is {} after the run) - PASS
12 gates green from clean build with counts -> see above - PASS

Diff: 11 files. Production 4 files, ~137 changed lines (codeActionsProvider 32, diagnosticsProvider 17, insertSchemaCommand 20, coverageCheck 68). Tests 455 lines + 5 fixtures. package.json, README, CHANGELOG, autoInsert untouched.

Host noise in test output (not extension code): DEP0169 url.parse and AgentHostCustomizationMarketplace receipts, as the story notes.

LEARNINGS:
- Behavior-preserving stubs (exports present, old logic) give a clean RED in TypeScript: the suite compiles and every new test fails on an assertion, while the negative/regression tests correctly pass on the stub, which shows they pin current behavior rather than the new feature.
- coverageState must check the any-pattern match before the URL selection: a file matched only by an alias key has to stay covered, not fall to uncovered, or the alias user would suddenly get the old 'No schema' diagnostic.
- provideCodeActions now filters undefined actions so a stale restore diagnostic yields nothing; the existing insert action path is untouched.
- pvg gates must be scoped to changed paths (or run inside the worktree); from the project root it scans the main checkout, worktree copies and the downloaded VS Code under .vscode-test and fails on duplication that has nothing to do with the story.
- npx prettier --check run with an explicit --ignore-path must also pass .gitignore, otherwise the gitignored test-written .vscode/settings.json gets flagged.
