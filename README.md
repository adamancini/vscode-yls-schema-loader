# YLS Schema Loader

Finds the right [yaml-language-server](https://github.com/redhat-developer/yaml-language-server)
schema for Kubernetes-style YAML documents and helps you wire it up — without
guessing repo layouts or digging through source by hand.

`redhat.vscode-yaml` (which bundles yaml-language-server) only validates a
document once it's associated with a schema, either via a `yaml.schemas`
setting or an inline `# yaml-language-server: $schema=...` comment. For a
custom resource — an ArgoCD `ApplicationSet`, a Kargo `Stage`, or any other
`kind`/`apiVersion` — finding that schema URL is manual, tedious work. This
extension automates the lookup.

## Features

- **Detects** `kind`/`apiVersion` in open YAML documents (including
  multi-document files) and checks whether a schema is already associated.
- **Resolves** a schema through three stages, first match wins:
  1. A bundled, curated mapping of common kinds (see below).
  2. An in-session cache of resolutions already made this window.
  3. A GitHub heuristic: guesses the source repo from the `apiVersion` group,
     probes common schema file paths, and falls back to a GitHub code search.
- **Never edits silently.** An uncovered document gets an info diagnostic and
  a quick-fix — nothing is written until you act on it. A schema found via
  GitHub always shows you the candidate (or a picker, if there's more than
  one) and requires explicit confirmation before anything is inserted.
  Bundled-mapping matches apply directly, since they're a curated, trusted
  source.
- **Two ways to apply a fix:** the quick-fix on the diagnostic, or the
  command palette — *YLS Schema Loader: Insert Schema for Current Document*
  — which resolves whichever document your cursor is in.

## Bundled schemas

- ArgoCD `ApplicationSet` (`argoproj.io/v1alpha1`)
- Kargo `Stage`, `Warehouse`, `Promotion` (`kargo.akuity.io/v1alpha1`)

Anything else falls through to GitHub discovery, or you can extend the
mapping yourself with `ylsSchemaLoader.additionalMappings`.

## Extension Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `ylsSchemaLoader.insertionMode` | `"comment" \| "yamlSchemas" \| "both"` | `"comment"` | What a resolved schema writes: an inline comment, a `yaml.schemas` entry, or both. |
| `ylsSchemaLoader.enableWebDiscovery` | `boolean` | `true` | Whether to search GitHub when no bundled mapping or cached resolution exists. |
| `ylsSchemaLoader.additionalMappings` | `{ kind, apiVersion, url }[]` | `[]` | Your own overrides, merged on top of the bundled mapping. |
| `ylsSchemaLoader.githubRepoHints` | `{ group, repo }[]` | `[]` | Explicit `apiVersion` group → `org/repo` overrides, for when the GitHub heuristic guesses wrong. |

## Requirements

- VS Code `^1.90.0`.
- [`redhat.vscode-yaml`](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)
  is what actually validates against the schema once it's associated — this
  extension just does the lookup and wiring. It's not a hard dependency (the
  inline-comment `insertionMode` works without it), but you'll want it
  installed for the `yamlSchemas` insertion mode and for validation itself.

## Known limitations

- No live-cluster CRD introspection — schemas come from the bundled mapping,
  your own overrides, or GitHub, not `kubectl get crd`.
- Only acts on documents with **no** existing schema association; it doesn't
  detect or offer to replace a stale one.
- GitHub discovery is a best-effort heuristic (a handful of conventional file
  paths, then a code search) — it won't find every schema in every repo
  layout. `ylsSchemaLoader.githubRepoHints` and `additionalMappings` are the
  escape hatches.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
