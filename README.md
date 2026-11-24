# YLS Schema Loader

Finds the [yaml-language-server](https://github.com/redhat-developer/yaml-language-server)
schema for Kubernetes-style YAML documents in the
[Flux schema catalog](https://schemas.fluxoperator.dev/catalog/) and wires it
up.

`redhat.vscode-yaml` (which bundles yaml-language-server) validates a document
only after it is associated with a schema, through a `yaml.schemas` setting or
an inline `# yaml-language-server: $schema=...` comment. For a custom resource,
such as an ArgoCD `ApplicationSet`, a Kargo `Stage`, or any other
`kind`/`apiVersion`, you must find that schema URL by hand. This extension
automates the lookup.

## Features

- **Detects** `kind`/`apiVersion` in open YAML documents, including
  multi-document files, and checks for an existing schema association.
- **Resolves** a schema through this chain; the first match wins:
  1. Your own `ylsSchemaLoader.additionalMappings`.
  2. The [Flux schema catalog](https://schemas.fluxoperator.dev/catalog/)
     (see [Schema sources](#schema-sources)).
  3. An in-session cache of resolutions already made this window.

  Every resolved source applies directly. When nothing resolves a document,
  the quick-fix asks you for a URL.

- **Never edits silently.** An uncovered document gets an info diagnostic and
  a quick-fix. The extension writes nothing until you act, unless you turn
  on auto-insert.
- **Two ways to apply a fix:** the quick-fix on the diagnostic, or the
  command palette's _YLS Schema Loader: Insert Schema for Current Document_,
  which resolves the document your cursor is in.
- **Opt-in auto-insert** (`ylsSchemaLoader.autoInsert`, off by default): when
  you open a document that resolves through any source above, the extension
  inserts the schema immediately, with no diagnostic, quick-fix, or click. It
  runs only on document open, never on keystrokes.

## Schema sources

The extension ships no embedded schemas; it looks up every schema:

- The [Flux schema catalog](https://schemas.fluxoperator.dev/catalog/), built
  from upstream projects' CRDs at tagged releases, covers core Kubernetes and
  120+ projects. The extension downloads its index,
  `https://schemas.fluxoperator.dev/index.json`, at most once every 24 hours,
  caches it in VS Code global state, and reuses it when you are offline. It
  never looks up schemas while you type.
- Kinds the catalog lacks stay unresolved (the quick-fix asks for a URL) until
  you map them with `ylsSchemaLoader.additionalMappings`.

### Kinds the catalog does not cover

The catalog omits the `Kustomization` kind
(`kustomize.config.k8s.io/v1beta1`) that the native `kubectl kustomize` /
`kustomize` CLI reads from `kustomization.yaml`. The catalog does cover Flux's
distinct `kustomize.toolkit.fluxcd.io` `Kustomization`. To map the native
kind, add this to your settings:

```json
"ylsSchemaLoader.additionalMappings": [
  { "kind": "Kustomization", "apiVersion": "kustomize.config.k8s.io/v1beta1", "url": "https://json.schemastore.org/kustomization.json" }
]
```

## Extension Settings

| Setting                              | Type                                   | Default     | Description                                                                                                                                  |
| ------------------------------------ | -------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ylsSchemaLoader.insertionMode`      | `"comment" \| "yamlSchemas" \| "both"` | `"comment"` | What a resolved schema writes: an inline comment, a `yaml.schemas` entry, or both.                                                           |
| `ylsSchemaLoader.enableFluxCatalog`  | `boolean`                              | `true`      | Resolve schemas from the Flux schema catalog. Turn off in air-gapped environments to block all requests to schemas.fluxoperator.dev.         |
| `ylsSchemaLoader.autoInsert`         | `boolean`                              | `false`     | Insert any resolved schema (from your additionalMappings, the Flux schema catalog, or the session cache) on document open, without a prompt. |
| `ylsSchemaLoader.additionalMappings` | `{ kind, apiVersion, url }[]`          | `[]`        | Your own kind/apiVersion to schema URL mappings, checked before the Flux schema catalog.                                                     |

## Requirements

- VS Code `^1.90.0`.
- [`redhat.vscode-yaml`](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)
  validates documents against the associated schema; this extension only
  finds the schema and wires it up. It is not a hard dependency (the
  inline-comment `insertionMode` works without it), but you need it for the
  `yamlSchemas` insertion mode and for validation itself.

## Known limitations

- No live-cluster CRD introspection: schemas come from your
  additionalMappings or the Flux schema catalog, not `kubectl get crd`.
- With `ylsSchemaLoader.enableFluxCatalog` off, only your additionalMappings
  resolve (plus URLs you already entered this session).
- Acts only on documents with **no** existing schema association; it neither
  detects a stale one nor offers to replace it.

## Development

```bash
npm install
npm run compile # type-check + compile src/ and test/ to out/
npm run bundle   # bundle src/extension.ts -> dist/extension.js (dev build)
npm test         # unit tests, then integration tests in a real VS Code instance
npm run lint     # eslint
npm run format   # prettier --write
```

The shipped extension is a single esbuild bundle (`dist/extension.js`), which
`vsce package`/`vsce publish` build automatically through the `vscode:prepublish`
script. The `out/` output of `npm run compile` serves only the tests; packaging
never uses it.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
