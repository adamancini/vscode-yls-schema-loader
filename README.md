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
- **Resolves** a schema through this chain, first match wins:
  1. Your own `ylsSchemaLoader.additionalMappings`.
  2. The [Flux schema catalog](https://schemas.fluxoperator.dev/catalog/)
     (see [Schema sources](#schema-sources)).
  3. An in-session cache of resolutions already made this window.

  Every resolved source applies directly. A document nothing resolves stays
  unresolved: the quick-fix asks you for a URL.

- **Never edits silently.** An uncovered document gets an info diagnostic and
  a quick-fix — nothing is written until you act on it, unless you turn on
  auto-insert.
- **Two ways to apply a fix:** the quick-fix on the diagnostic, or the
  command palette — _YLS Schema Loader: Insert Schema for Current Document_
  — which resolves whichever document your cursor is in.
- **Opt-in auto-insert** (`ylsSchemaLoader.autoInsert`, off by default): when
  a document is opened and resolves through any source above, insert the
  schema immediately — no diagnostic, no quick-fix, nothing to click. Runs on
  document open only, not on every keystroke.

## Schema sources

The extension ships no embedded schemas. Every schema is a lookup:

- The [Flux schema catalog](https://schemas.fluxoperator.dev/catalog/) is
  built from upstream projects' CRDs at tagged releases and covers core
  Kubernetes and 120+ projects. Its index,
  `https://schemas.fluxoperator.dev/index.json`, is downloaded at most once
  every 24 hours, cached in VS Code global state, and reused when you are
  offline. Lookups never happen while you type.
- Kinds the catalog lacks are unresolved (the quick-fix asks for a URL) until
  you map them with `ylsSchemaLoader.additionalMappings`.

### Kinds the catalog does not cover

The native `kubectl kustomize` / `kustomize` CLI `kustomization.yaml` kind
(`Kustomization` at `kustomize.config.k8s.io/v1beta1`) is not in the
catalog. It is distinct from Flux's `kustomize.toolkit.fluxcd.io`
`Kustomization`, which the catalog does cover. To map it, add this to your
settings:

```json
"ylsSchemaLoader.additionalMappings": [
  { "kind": "Kustomization", "apiVersion": "kustomize.config.k8s.io/v1beta1", "url": "https://json.schemastore.org/kustomization.json" }
]
```

## Extension Settings

| Setting                              | Type                                   | Default     | Description                                                                                                                             |
| ------------------------------------ | -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ylsSchemaLoader.insertionMode`      | `"comment" \| "yamlSchemas" \| "both"` | `"comment"` | What a resolved schema writes: an inline comment, a `yaml.schemas` entry, or both.                                                      |
| `ylsSchemaLoader.enableFluxCatalog`  | `boolean`                              | `true`      | Resolve schemas from the Flux schema catalog. Turn off in air-gapped environments to prevent any request to schemas.fluxoperator.dev.   |
| `ylsSchemaLoader.autoInsert`         | `boolean`                              | `false`     | Auto-insert any resolved schema (your additionalMappings, the Flux schema catalog, the session cache) on document open, with no prompt. |
| `ylsSchemaLoader.additionalMappings` | `{ kind, apiVersion, url }[]`          | `[]`        | Your own kind/apiVersion to schema URL mappings, checked first, before the Flux schema catalog.                                         |

## Requirements

- VS Code `^1.90.0`.
- [`redhat.vscode-yaml`](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)
  is what actually validates against the schema once it's associated — this
  extension just does the lookup and wiring. It's not a hard dependency (the
  inline-comment `insertionMode` works without it), but you'll want it
  installed for the `yamlSchemas` insertion mode and for validation itself.

## Known limitations

- No live-cluster CRD introspection — schemas come from your
  additionalMappings or the Flux schema catalog, not `kubectl get crd`.
- With `ylsSchemaLoader.enableFluxCatalog` off, only your additionalMappings
  resolve (plus URLs you already entered this session).
- Only acts on documents with **no** existing schema association; it doesn't
  detect or offer to replace a stale one.

## Development

```bash
npm install
npm run compile # type-check + compile src/ and test/ to out/
npm run bundle   # bundle src/extension.ts -> dist/extension.js (dev build)
npm test         # unit tests, then integration tests in a real VS Code instance
npm run lint     # eslint
npm run format   # prettier --write
```

The shipped extension is a single esbuild bundle (`dist/extension.js`, built automatically
by `vsce package`/`vsce publish` via the `vscode:prepublish` script) — `npm run compile`'s
`out/` output is only used for running tests, never for packaging.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
