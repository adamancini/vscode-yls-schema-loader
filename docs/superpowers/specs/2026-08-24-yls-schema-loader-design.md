# vscode-yls-schema-loader — Design

## Problem

`redhat.vscode-yaml` (which bundles yaml-language-server) only validates a
YAML document against a schema if the document is either matched by a
`yaml.schemas` glob mapping or carries an inline
`# yaml-language-server: $schema=<url-or-path>` comment on its first line.
For Kubernetes-style manifests (`kind` + `apiVersion`), finding the right
schema URL for a given custom resource is manual, tedious work: guessing
repo layout, digging through source, or remembering it from a previous
project.

This extension automates that lookup: given an open YAML file with a
recognizable `kind`/`apiVersion`, it finds (or helps find) the matching
schema and offers to wire it up — via inline comment and/or a `yaml.schemas`
entry — without silently rewriting files.

## Non-goals (v1)

- No live-cluster CRD introspection (`kubectl get crd -o json` →
  `openAPIV3Schema`). Deferred; revisit once file-based sources are solid.
- No automatic, silent edits to open files. All schema insertion happens
  through an explicit command or code-action quick-fix.
- No detection/replacement of existing (possibly stale or wrong) schema
  associations — the extension only acts on files with *no* schema
  association at all.
- Not a custom language server. This is a plain extension that feeds
  `redhat.vscode-yaml`/yaml-language-server, not a replacement for it.

## Architecture

### Components

1. **Detector** — on YAML document open/active-editor-change, parses the
   document with the `yaml` npm package and extracts top-level `kind` +
   `apiVersion` per YAML sub-document (`---`-separated documents are
   handled independently). Documents missing either field, or that fail to
   parse, are skipped silently — nothing to key a lookup on.

2. **Coverage check** — runs before resolution. A document is "covered" if
   it already has a `# yaml-language-server: $schema=` comment, or is
   matched by an existing glob in the workspace's `yaml.schemas` setting.
   Covered documents get no diagnostic.

3. **Resolver pipeline** — runs only for uncovered documents, first hit
   wins:
   1. **Bundled mapping**: a curated, versioned JSON file shipped in the
      extension (`kind`+`apiVersion` → schema URL), covering common cases
      (e.g. ArgoCD `ApplicationSet`, Kargo `Stage`/`Warehouse`/`Promotion`).
   2. **Cross-file `yaml.schemas` reuse**: check whether another entry
      already in the workspace's `yaml.schemas` happens to key off the same
      `kind`/`apiVersion` group (e.g. discovered earlier in the session for
      a sibling file).
   3. **GitHub heuristic discovery**: derive a candidate `org/repo` from the
      apiVersion group (e.g. `kargo.akuity.io` → `akuity/kargo`, overridable
      via `ylsSchemaLoader.githubRepoHints`), probe a fixed list of
      conventional schema paths/filenames in that repo via the GitHub
      Contents API, and if none hit, fall back to a GitHub code search
      scoped to that repo for the `kind` name near schema-ish filenames.
      Uses `vscode.authentication.getSession('github', ['repo'], ...)` when
      available to raise API rate limits; falls back to unauthenticated
      requests (10 req/min) otherwise.

4. **Diagnostics** — an uncovered document (resolved or not) gets an
   info-level diagnostic anchored at its `kind`/`apiVersion` lines: "No
   yaml-language-server schema associated with this `<kind>`."

5. **Code actions (quick-fix)** — offered on that diagnostic, and also
   exposed as a standalone command (`YLS Schema Loader: Insert Schema for
   this Document`) for the cursor's current document:
   - **Bundled-mapping resolution**: applied immediately, per
     `ylsSchemaLoader.insertionMode` — no confirmation, it's a curated,
     trusted source.
   - **GitHub heuristic resolution**: shows the candidate URL (or, if
     multiple candidates, a `QuickPick` list) and requires explicit
     accept before anything is written. On accept: applies per
     `insertionMode` AND writes the mapping into the workspace's
     `yaml.schemas` for future reuse (component 3.2 above; independent of
     `insertionMode`, since it's the discovery cache, not the per-file
     insertion).
   - **Unresolved**: quick-fix offers "Enter schema URL manually," which
     also respects `insertionMode`.

### Data flow

```
open/edit YAML doc
  -> Detector: extract kind/apiVersion per sub-document
  -> Coverage check: already has comment or yaml.schemas match?
       yes -> stop, no diagnostic
       no  -> Resolver pipeline (bundled -> yaml.schemas reuse -> GitHub heuristic)
              -> Diagnostics: publish info diagnostic
              -> Code action available:
                   bundled hit      -> apply per insertionMode (no confirm)
                   GitHub hit       -> confirm (QuickPick if ambiguous) -> apply + cache to yaml.schemas
                   no hit           -> manual URL entry -> apply per insertionMode
```

## Error handling & edge cases

- **GitHub API failure** (rate limit, network error, auth session denied):
  resolver pipeline treats this as "no candidate found," not a thrown
  error. The diagnostic remains; the quick-fix degrades to "enter schema
  URL manually," plus a non-blocking status message with a "retry" action.
- **Ambiguous heuristic matches** (multiple plausible schema files or
  repos): presented as a `QuickPick` — user picks, extension never guesses
  silently among multiple candidates.
- **Malformed/incomplete YAML**: skipped silently by the Detector — no
  diagnostic without a `kind`/`apiVersion` to key off of.
- **Stale/incorrect existing schema association**: out of scope for v1 (see
  Non-goals).
- **Bundled mapping updates**: ship as part of extension releases; no
  runtime fetching of the mapping file itself, keeping it auditable and
  usable offline.

## Settings

| Setting | Type | Default | Purpose |
|---|---|---|---|
| `ylsSchemaLoader.insertionMode` | `"comment" \| "yamlSchemas" \| "both"` | `"comment"` | What a quick-fix/command writes when applying a resolved schema. |
| `ylsSchemaLoader.enableWebDiscovery` | `boolean` | `true` | Toggles the GitHub heuristic step of the resolver pipeline. |
| `ylsSchemaLoader.additionalMappings` | `{ kind, apiVersion, url }[]` | `[]` | User/workspace overrides merged on top of the bundled mapping. |
| `ylsSchemaLoader.githubRepoHints` | `{ group, repo }[]` | `[]` | Explicit apiVersion-group → `org/repo` overrides for cases the heuristic guesses wrong. |

## Testing approach

- **Unit tests** (no VS Code API), pure-function style, run under a
  standard test runner against YAML fixtures:
  - `kind`/`apiVersion` extraction across single- and multi-document files.
  - Coverage-check logic (existing comment detection; `yaml.schemas` glob
    matching).
  - Resolver pipeline ordering (bundled wins over reuse wins over GitHub).
  - Org/repo heuristic derivation from apiVersion groups, including
    `githubRepoHints` overrides.
- **Integration tests** via `@vscode/test-electron`:
  - Diagnostic appears on an uncovered fixture file; disappears once
    covered by a comment or a `yaml.schemas` entry.
  - Quick-fix inserts the expected comment text and/or `yaml.schemas` edit
    per `insertionMode`.
  - Ambiguous-match `QuickPick` flow and manual-entry fallback.
- **No live network calls in tests.** All GitHub API interaction is mocked
  behind a fixture set covering: direct path hit, code-search hit, and
  no-candidates-found.

## Open items for implementation planning

- Exact bundled mapping content (list of kind/apiVersion → URL entries to
  seed v1 with — ArgoCD `ApplicationSet` and Kargo `Stage` are the two
  named in discussion; others TBD during implementation).
- Extension scaffolding choice (esbuild vs. plain `tsc` for bundling) —
  implementation detail, not a design constraint.
