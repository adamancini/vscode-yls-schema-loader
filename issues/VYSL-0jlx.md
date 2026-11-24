---
id: VYSL-0jlx
title: "Restore missing schema directive for settings-associated files"
status: open
priority: 1
type: epic
created_at: 2026-11-24T19:12:43Z
created_by: ada
updated_at: 2026-11-24T19:12:43Z
content_hash: "sha256:ee47e85943d9c59fe17eaec2191a1fe65f369302ad264d8045dc7738cfcfdeb8"
---

## Description
Description:
Restore a missing inline `# yaml-language-server: $schema=` directive in files that are already associated with a schema through the `yaml.schemas` setting. The extension offers the restore (info diagnostic + quick-fix) and, with `ylsSchemaLoader.autoInsert` on, performs it on document open. Ships as v0.4.0.

BUSINESS CONTEXT:
User feedback (the user is the only user of the extension adamancini.yls-schema-loader): "The plugin should also offer to and automatically re-insert a missing yaml-language-server directive if a file has already been associated to a schema through settings but the line has been removed." The user wants the inline directive to be the durable association in `comment` and `both` insertion modes; a settings entry alone is not enough for them. Breaking changes are fine and no migration work is wanted. The extension ships no embedded schemas: a schema URL only ever comes from a lookup or from the user's own settings. Scope must stay minimal.

PROBLEM BEING SOLVED:
Today (v0.3.3, main @ a451edf) `isCovered(text, startLine, relativePath, yamlSchemas)` in src/lib/coverageCheck.ts returns true when the document has an inline schema comment OR the file's workspace-relative path matches any `yaml.schemas` pattern. src/diagnosticsProvider.ts and src/autoInsert.ts both skip "covered" documents, so a settings-associated document whose directive line was deleted is silently treated as done: no diagnostic, no quick-fix, no auto-insert.

TARGET STATE:
A recognized document (one that parses with string `kind` and `apiVersion`) has one of three states:
- covered: it has an inline schema comment; OR its file matches `yaml.schemas` and the restore does not apply (insertion mode `yamlSchemas`, or no matching key is a URL usable in a directive).
- restorable: no inline comment, the file matches at least one `yaml.schemas` pattern under a key that is an `http://`, `https://` or `file:` URL, and `ylsSchemaLoader.insertionMode` is `comment` or `both`.
- uncovered: no inline comment and no `yaml.schemas` pattern matches (today's "No yaml-language-server schema associated with this <kind>." flow, unchanged).
A restorable document gets an info diagnostic with the message "Schema is associated via yaml.schemas but the inline directive is missing." and a quick-fix "Restore yaml-language-server schema directive" that inserts the comment with the settings URL. With `ylsSchemaLoader.autoInsert` on, the comment is inserted on document open above every restorable document in the file, bottom-to-top. The restore writes only the comment: it never writes `yaml.schemas`, never consults the Flux schema catalog and never uses the network.

URL SELECTION RULE (user decision, applies wherever the settings URL is chosen):
Candidates are every (URL key, pattern) pair in `yaml.schemas` whose key is an `http://`, `https://` or `file:` URL and whose pattern matches the file's workspace-relative path. Patterns are normalized for comparison by replacing backslashes with `/` and stripping leading `/`.
1. An exact path beats any glob: a pattern whose normalized form equals the normalized relative path wins over every glob match.
2. Among globs, the more specific folder path wins. Specificity = the number of literal leading directory segments before the first glob metacharacter (`*`, `?`, `[`, `{`). Example: `apps/team-ada/kargo/*.yaml` (3) beats `apps/**/*.yaml` (1), which beats `*.yaml` or `**/*.yaml` (0).
3. If still tied, the lexically smallest pattern string wins (ascending, plain code-unit compare). If two URLs map the same pattern, the lexically smallest URL wins.

ARCHITECTURE INTEGRATION:
- TypeScript VS Code extension, single esbuild bundle, VS Code engine ^1.90.0. Pure logic lives in src/lib/*.ts (no `vscode` import) with colocated mocha unit tests (src/lib/*.test.ts, tdd ui: suite/test). VS Code-facing code lives in src/*.ts with integration tests under test/integration/ run by @vscode/test-cli in a real VS Code host; fixtures in test/fixtures/.
- Trust boundary: a settings-derived URL is user-configured, so it is applied directly with no confirmation (same as `ylsSchemaLoader.additionalMappings`).
- Network discipline: auto-insert runs on document open and the activation scan only, never on onDidChangeTextDocument. The per-edit diagnostics refresh is local-only. The restore needs no network at all and must not add any.
- Multi-document inserts are applied bottom-to-top so earlier insertion points never shift.
- yaml-language-server resolves a directive value that does not start with `http` or `file:` as a file path relative to the document's directory (verified in the redhat.vscode-yaml 2.0.0 bundle, resolveSchemaRef). A `yaml.schemas` key such as the built-in alias `kubernetes`, or a workspace-relative path, would therefore produce a broken directive that overrides the working settings association. Such keys are never restored.
- Path matching uses the extension's existing matcher (minimatch against the workspace-relative path, `dot: true`): `*.yaml` matches only files at the workspace root; `**/*.yaml` matches every YAML file.

DESIGN REQUIREMENTS:
No UI design work. No new commands, settings or prompts. One new diagnostic message and one new quick-fix title (both quoted above). VS Code's diagnostic-hover "Quick Fix..." menu applies `CodeAction.edit` but never runs `CodeAction.command`, so the restore quick-fix is an edit. Known and accepted: in the user's VS Code the hover's Quick Fix menu closes itself within about a second; that is a VS Code issue and out of scope.

EXPLICITLY OUT OF SCOPE FOR THE WHOLE EPIC:
Migration of existing files or settings; embedded schemas; restoring in `yamlSchemas` mode; restoring non-URL `yaml.schemas` keys (aliases, relative paths); documents without `kind`/`apiVersion`; detecting or replacing a stale or different inline directive; changing glob-matching semantics; a "restore all documents" quick-fix; release and Marketplace publishing (done by the dispatcher).

Acceptance Criteria:
1. In `comment` or `both` mode, a recognized document with no inline directive whose file matches a URL-keyed `yaml.schemas` pattern gets the info diagnostic "Schema is associated via yaml.schemas but the inline directive is missing." and a quick-fix that inserts the directive with the URL chosen by the URL SELECTION RULE.
2. With `ylsSchemaLoader.autoInsert` on, opening such a file inserts the directive above every restorable document, bottom-to-top, with no prompt; nothing is inserted on edits.
3. In `yamlSchemas` mode nothing changes: no diagnostic and no insert for a settings-associated document.
4. The restore inserts only the comment: `yaml.schemas` is not written, the Flux schema catalog is not consulted, and no network request is made.
5. A broad mapping (for example `"https://example.com/k8s.json": "**/*.yaml"`) offers, and with autoInsert inserts, the directive in every matching file; the README says so explicitly.
6. README, CHANGELOG and package version (0.4.0) describe the shipped behavior; `npm run compile`, `npm run lint`, `npx prettier --check .` and `rm -rf out dist && npm test` are green.

MANDATORY SKILLS TO REVIEW:
superpowers:test-driven-development, superpowers:verification-before-completion

## Acceptance Criteria


## Design


## Notes


## History


## Links


## Comments
