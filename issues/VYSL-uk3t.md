---
id: VYSL-uk3t
title: "Auto-restore the missing schema directive on document open (v0.4.0)"
status: open
priority: 1
type: task
labels: [capstone]
parent: VYSL-0jlx
created_at: 2026-11-24T19:14:53Z
created_by: ada
updated_at: 2026-11-24T19:14:53Z
content_hash: "sha256:75609aa57d0ac965551c0f2df96f0edbabdaa373d7d3241658d3d5fd641d6cad"
blocked_by: [VYSL-sqhc]
---

## Description
Description:
With `ylsSchemaLoader.autoInsert` on, restore the missing schema directive automatically when a document opens, above every restorable document in the file, and finish the epic: README, CHANGELOG, setting description and version 0.4.0. Capstone of the epic, with the end-to-end demo through the activated extension.

Context:
VYSL-sqhc added the three coverage states and the offer (diagnostic + quick-fix + command). src/autoInsert.ts still calls `isCovered(...)`, which treats a settings-associated document without a directive as covered, so auto-insert skips it. This story switches auto-insert to the three states.

Existing code (verified on main @ a451edf):
- src/autoInsert.ts: `autoInsertSchemas(document, sessionCache, fluxCatalog)` returns immediately unless the language is yaml and `getAutoInsert()` is true (read synchronously before the first await); it iterates `parseKindApiVersions(text)` in REVERSE (bottom-to-top, so an insert never shifts the start line of a document still to be processed), skips covered documents, resolves the rest through `resolveSchema` (additionalMappings -> Flux catalog -> session cache) and applies direct-apply sources with `applyResolution(document, doc.startLine, url, insertionMode)`, then writes the session cache.
- src/extension.ts: `handleDocumentOpen` runs `autoInsertSchemas` then `diagnostics.refresh` on `onDidOpenTextDocument` and for every already-open document at activation. `onDidChangeTextDocument` only triggers the debounced diagnostics refresh. This wiring must stay exactly as it is.
- src/applySchema.ts: `applyResolution(document, startLine, url, insertionMode, options?)`; with insertionMode `'comment'` it inserts only the comment line and never touches `yaml.schemas`. `insertionModeWritesComment(mode)` is true for `comment` and `both`.
- package.json `contributes.configuration.properties["ylsSchemaLoader.autoInsert"].description` is pinned verbatim by test/integration/settings.test.ts (test "the autoInsert description names the remaining sources and no removed one"); a description change without updating that test breaks the suite. package.json and package-lock.json both carry version 0.3.3 (the lockfile in two places: top level and `packages[""]`).
- README.md sections: Features, Schema sources, Extension Settings (table), Requirements, Known limitations (its last bullet says the extension acts only on documents with no existing schema association), Development, Release Notes. CHANGELOG.md newest entry is `## 0.3.3`.

Design rules that bind this story:
- Trust boundary: the settings URL is user-configured, so it applies directly with no confirmation.
- Auto-apply features must avoid per-edit triggers: auto-insert runs on document open only. Deleting the directive while the file is open shows the restore diagnostic (per-edit, local-only) but does not re-insert until the file is opened again.
- The restore needs no catalog and no network; it must not add any lookup.
- A test that replaces production wiring with injected wiring leaves the real wiring untested: this story adds one test that goes through the activated extension's own open handler.

USER INTENT:
The user wants the directive to come back by itself: with auto-insert on, opening a file they mapped in `yaml.schemas` must leave every recognized document in it carrying the directive with the settings URL, with no prompt and without their settings being rewritten. They also need the README to tell them plainly what a broad pattern will do to their repository, and how the URL is chosen when several entries match, so the behavior never surprises them.

IMPLEMENTATION:
1. src/autoInsert.ts: inside the existing bottom-to-top loop, replace the `isCovered` check with `coverageState(text, doc.startLine, relativePath, yamlSchemas, insertionModeWritesComment(insertionMode))`.
   - covered -> continue (includes every settings-associated document in `yamlSchemas` mode).
   - restorable -> `await applyResolution(document, doc.startLine, state.url, 'comment')` and continue. Passing the literal `'comment'` is what guarantees no `yaml.schemas` write in `both` mode. Do not call `resolveSchema`, do not look up the catalog, do not write the session cache (a settings URL is per file, not per kind/apiVersion, so caching it would poison later resolutions).
   - uncovered -> today's resolve-and-apply path, unchanged.
   Remove the `isCovered` import if it becomes unused; if `isCovered` then has no importer left in src/ (grep every importer, do not trust this list), delete it and its unit tests.
2. src/extension.ts: no functional change. Update the comment above `handleDocumentOpen` only if it becomes inaccurate.
3. package.json: set `ylsSchemaLoader.autoInsert` description to exactly:
   "When a document opens and its schema resolves, insert the schema immediately, with no confirmation prompt. Applies to every resolved source (your additionalMappings, the Flux schema catalog, the session cache) and to files already associated through yaml.schemas whose inline directive is missing. Off by default."
   Update the pinned string (and the test title) in test/integration/settings.test.ts in the same commit. Bump `version` to 0.4.0 in package.json and in both places in package-lock.json (`npm --prefix <abs-worktree> version 0.4.0 --no-git-tag-version` does all three).
4. README.md:
   - Features: add a bullet for the restore. In `comment` or `both` mode, a document with no inline directive in a file matched by a `yaml.schemas` pattern gets the info diagnostic "Schema is associated via yaml.schemas but the inline directive is missing." and the quick-fix "Restore yaml-language-server schema directive"; with auto-insert on it is restored on open, above every document in a multi-document file that lacks a directive. It writes only the comment and never changes `yaml.schemas`. In `yamlSchemas` mode nothing is offered or inserted.
   - State the URL selection rule: exact path beats any glob; among globs, more literal leading directory segments before the first glob character wins, with the example `apps/team-ada/kargo/*.yaml` (3) over `apps/**/*.yaml` (1) over `*.yaml` or `**/*.yaml` (0); then the lexically smallest pattern; then the lexically smallest URL.
   - Broad-glob warning, explicit: a catch-all mapping such as `"https://example.com/k8s.json": "**/*.yaml"` offers, and with auto-insert inserts, the directive in every matching file you open. Note that this extension matches patterns against the workspace-relative path, so `*.yaml` matches only files at the workspace root and `**/*.yaml` matches every YAML file.
   - Only keys that are `http://`, `https://` or `file:` URLs are restored. Aliases such as `kubernetes` and schema paths are skipped, because yaml-language-server would resolve such a directive value as a file relative to the document and validation would break.
   - Extension Settings table: update the `ylsSchemaLoader.autoInsert` row to mention the restore. Update the "Never edits silently" and "Opt-in auto-insert" bullets if they become inaccurate.
   - Known limitations: replace the last bullet. The extension still neither detects a stale directive nor replaces an existing one; the restore applies only to documents with `kind` and `apiVersion`.
5. CHANGELOG.md: add `## 0.4.0` above `## 0.3.3` describing: the restore diagnostic and quick-fix; auto-restore on open with `autoInsert`; mode gating (`comment`/`both` only); comment-only write; the URL selection rule in one sentence; the broad-glob consequence; URL-only keys. Mark the behavior change: files matched by `yaml.schemas` are no longer silently treated as done in `comment`/`both` mode.

KEY FILES:
- src/autoInsert.ts (modify); src/lib/coverageCheck.ts and src/lib/coverageCheck.test.ts (only if `isCovered` is removed)
- test/integration/autoInsert.test.ts, test/integration/settings.test.ts (modify)
- test/fixtures/restore-auto.yaml, test/fixtures/restore-auto-multidoc.yaml, test/fixtures/restore-auto-both-mode.yaml, test/fixtures/restore-auto-yamlschemas-mode.yaml, test/fixtures/restore-auto-disabled.yaml, test/fixtures/restore-auto-activated.yaml (create)
- package.json, package-lock.json, README.md, CHANGELOG.md (modify)

OUT OF SCOPE:
- Release, tagging, packaging and Marketplace publishing: done by the dispatcher after the epic gate. Do not run `vsce` and do not create a git tag.
- Re-inserting on edit, save or focus: never; open-only is a design rule.
- Restoring non-URL keys, documents without `kind`/`apiVersion`, or replacing an existing directive: never in this epic.
- Changing glob-matching semantics: not in this epic; the README documents the existing semantics.
- A committed test of the activated extension's own Flux catalog fetch and globalState adapter: separate follow-up, unrelated to the restore.
- New settings or commands: none.

DIFF BUDGET:
About 13 files. Production: src/autoInsert.ts under 40 changed LOC (plus an optional `isCovered` removal). Tests: under 300 LOC plus 6 small fixtures. Docs and manifest: README under 60 lines, CHANGELOG under 25 lines, package.json 2 lines, package-lock.json 2 lines.

CONSUMES:
- VYSL-sqhc: src/lib/coverageCheck.ts -> coverageState, CoverageState, settingsSchemaUrl
    spec: coverageState(text: string, startLine: number, relativePath: string, yamlSchemas: YamlSchemasSetting, writesComment: boolean): { state: 'covered' } | { state: 'restorable'; url: string } | { state: 'uncovered' }
    spec: settingsSchemaUrl(relativePath: string, yamlSchemas: YamlSchemasSetting): string | undefined
    source: VYSL-sqhc PRODUCES (src/lib/coverageCheck.ts)
- VYSL-sqhc: src/diagnosticsProvider.ts -> restore diagnostic constants
    fields: RESTORE_DIAGNOSTIC_CODE = 'restoreDirective', RESTORE_DIAGNOSTIC_MESSAGE = 'Schema is associated via yaml.schemas but the inline directive is missing.'
    source: VYSL-sqhc PRODUCES (src/diagnosticsProvider.ts)

PRODUCES:
- src/autoInsert.ts -> `autoInsertSchemas` restores restorable documents on open with the settings URL, comment only (signature unchanged).
- test/fixtures/restore-auto.yaml, test/fixtures/restore-auto-multidoc.yaml, test/fixtures/restore-auto-both-mode.yaml, test/fixtures/restore-auto-yamlschemas-mode.yaml, test/fixtures/restore-auto-disabled.yaml, test/fixtures/restore-auto-activated.yaml -> fixtures (Kargo Stage documents; the multidoc one holds three documents: first and third without a directive, second with one).
- package.json, package-lock.json -> version 0.4.0; new `ylsSchemaLoader.autoInsert` description.
- README.md, CHANGELOG.md -> 0.4.0 documentation.

TESTING:
Default coverage: unit + integration, test first (RED before GREEN; confirm each RED fails for the intended reason on a fresh fixture). No mocks in integration tests: real VS Code host, real documents, real workspace settings.
Isolation rules, all mandatory:
- Every mutating test uses its own dedicated fixture file (documents are shared per path for the whole host session).
- Suite setup calls `disableActivatedFluxCatalog`; injected catalogs come from `createFixtureFluxCatalog` (test/integration/testUtils.ts). No test may reach the real network; use schema URLs on the reserved host `schemas.example.invalid`.
- For tests that call `autoInsertSchemas` directly: open the document FIRST, then set `yaml.schemas` and enable `autoInsert`, so the activated extension's own open handler leaves the document alone.
- Teardown restores `ylsSchemaLoader.autoInsert`, `ylsSchemaLoader.insertionMode` and `yaml.schemas` (Workspace target) to `undefined`.
Scenarios (test/integration/autoInsert.test.ts, new suite):
- autoInsert on, comment mode, exact-path mapping: line 0 becomes `# yaml-language-server: $schema=<settings URL>`
- the fixture catalog knows the kind (Kargo Stage) but the settings URL is inserted; a counting catalog records zero lookups, the stub fetch records zero URLs, and the session cache stays empty
- three-document fixture: directive inserted above documents one and three, document two keeps its existing directive, every line of the result asserted (bottom-to-top correctness)
- both mode: comment inserted and `yaml.schemas` deep-equals its prior value
- yamlSchemas mode: document untouched
- autoInsert off: document untouched
- alias-only mapping (`kubernetes`): document untouched
- regression: an unmapped document still gets the catalog URL through today's path
- real wiring, through the activated extension (no direct call): with the catalog disabled, set `yaml.schemas` to map test/fixtures/restore-auto-activated.yaml and enable `autoInsert` BEFORE opening it, then open it and wait until line 0 is the directive; then delete that line with an edit and assert (staysFalseFor) that it is not re-inserted while the document stays open
- settings.test.ts: the pinned `autoInsert` description equals the new string exactly

PROCESS (applies to every step):
- Work only in the dispatcher-managed worktree named in your prompt's `Work in:` line. The pvg guard blocks `cd` into worktrees, even inside compound commands: use absolute paths, `git -C <abs-worktree>` and `npm --prefix <abs-worktree>`.
- Run `npm --prefix <abs-worktree> ci` first; node_modules is not shared between worktrees. The first `npm test` in a fresh worktree downloads VS Code and redhat.vscode-yaml into the worktree's .vscode-test directory (existing harness behavior).
- Never stage anything under `.vault/`. Commit messages must not mention Claude.
- No coverage tool is configured; report test counts, not a percentage.
- VS Code test-host stderr noise (DEP0169 url.parse, AgentHostCustomizationMarketplace) comes from the host, not from extension code.
- Gates, all green before delivery, run from a clean build because mocha globs compiled tests in out/ and stale files inflate counts: `npm run compile`, `npm run lint`, `npx prettier --check .`, `rm -rf out dist && npm test`. Report unit and integration test counts before and after and explain the delta against VYSL-sqhc's delivered counts.

Acceptance Criteria:
1. [Event] When a YAML document opens with `ylsSchemaLoader.autoInsert` on and `insertionMode` `comment` or `both`, every restorable document in the file gets `# yaml-language-server: $schema=<settings URL>` inserted above it, with no prompt, the URL chosen by the epic's selection rule.
2. [Ubiquitous] Multi-document files are processed bottom-to-top: in the three-document fixture the two documents lacking a directive each get exactly one, the document that had one is untouched, and every resulting line is asserted.
3. [State] While `insertionMode` is `yamlSchemas`, or `autoInsert` is off, a settings-associated document is left untouched.
4. [Unwanted] The automatic restore shall not write `yaml.schemas` (deep-equal before and after, also in `both` mode), shall not consult the Flux catalog or the network (zero lookups, zero fetched URLs) and shall not write the session cache, even when the catalog knows the kind.
5. [Unwanted] The restore shall not run on document edits: after the directive is deleted in an open document it is not re-inserted until the file is opened again, and src/extension.ts still wires auto-insert to document open and the activation scan only.
6. [Unwanted] A non-URL `yaml.schemas` key (for example `kubernetes`) shall not cause any insertion.
7. [Event] End to end through the activated extension's own open handler (no injected wiring): opening a mapped fixture with `autoInsert` on inserts the directive. Unmapped documents still auto-insert the catalog URL through today's path.
8. README documents the restore (offer and automatic), the mode gating, the comment-only write, the three-step URL selection rule with the directory-segment example, the URL-only key restriction, and, explicitly, that a catch-all mapping such as `"https://example.com/k8s.json": "**/*.yaml"` offers and with auto-insert inserts the directive in every matching file, including the `*.yaml` (workspace root only) versus `**/*.yaml` distinction. Known limitations no longer claims the extension acts only on documents with no schema association.
9. CHANGELOG has a `## 0.4.0` entry describing the feature and the behavior change; package.json and package-lock.json (both places) read 0.4.0; no git tag is created and nothing is published.
10. The `ylsSchemaLoader.autoInsert` description in package.json equals the string given in IMPLEMENTATION step 3 and test/integration/settings.test.ts pins it verbatim.
11. Every mutating integration test uses a dedicated fixture, no test reaches the real network (real catalog disabled, stub catalog injected, `.invalid` schema hosts), and every test that sets workspace settings restores them in teardown.
12. `npm run compile`, `npm run lint`, `npx prettier --check .` and `rm -rf out dist && npm test` are green from a clean build, with test counts reported and the delta explained.

MANDATORY SKILLS TO REVIEW:
superpowers:test-driven-development, superpowers:verification-before-completion

## Acceptance Criteria


## Design


## Notes


## History
- 2026-11-24T19:14:53Z dep_added: blocked_by VYSL-sqhc

## Links
- Parent: [[VYSL-0jlx]]
- Blocked by: [[VYSL-sqhc]]

## Comments
