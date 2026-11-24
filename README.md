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

- **Never edits silently.** An uncovered document, or one whose `yaml.schemas`
  directive is missing (see below), gets an info diagnostic and a quick-fix.
  The extension writes nothing until you act, unless you turn on auto-insert.
- **Two ways to apply a fix:** the quick-fix on the diagnostic, or the
  command palette's _YLS Schema Loader: Insert Schema for Current Document_,
  which resolves the document your cursor is in.
- **Opt-in auto-insert** (`ylsSchemaLoader.autoInsert`, off by default): when
  you open a document that resolves through any source above, the extension
  inserts the schema immediately, with no diagnostic, quick-fix, or click. It
  also restores missing `yaml.schemas` directives (see below). It runs only on
  document open, never on keystrokes.
- **Restores a missing directive** for files you mapped in `yaml.schemas`
  (`comment` or `both` insertion mode only). A document with no inline
  directive in a file matched by a `yaml.schemas` pattern gets the info
  diagnostic "Schema is associated via yaml.schemas but the inline directive
  is missing." and the quick-fix "Restore yaml-language-server schema
  directive". With auto-insert on, the directive is restored when the file
  opens, above every document in a multi-document file that lacks one. The
  restore writes only the comment and never changes `yaml.schemas`. In
  `yamlSchemas` mode nothing is offered or inserted. Deleting the directive
  while the file is open shows the diagnostic again, but auto-insert does not
  re-insert it until you open the file again.

### Which `yaml.schemas` URL is restored

Only keys that are `http://`, `https://` or `file:` URLs are restored. Aliases
such as `kubernetes` and schema paths are skipped, because yaml-language-server
would resolve such a directive value as a file relative to the document and
validation would break. When several entries match a file, the URL is chosen
in this order:

1. An exact path beats any glob.
2. Among globs, the pattern with more literal leading directory segments
   before the first glob character wins: `apps/team-ada/kargo/*.yaml` (3)
   beats `apps/**/*.yaml` (1), which beats `*.yaml` or `**/*.yaml` (0).
3. Then the lexically smallest pattern, then the lexically smallest URL.

> **Broad patterns apply everywhere.** A catch-all mapping such as
> `"https://example.com/k8s.json": "**/*.yaml"` offers the directive, and with
> auto-insert inserts it, in every matching file you open. This extension
> matches patterns against the workspace-relative path, so `*.yaml` matches
> only files at the workspace root, while `**/*.yaml` matches every YAML file.

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

| Setting                              | Type                                   | Default     | Description                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ylsSchemaLoader.insertionMode`      | `"comment" \| "yamlSchemas" \| "both"` | `"comment"` | What a resolved schema writes: an inline comment, a `yaml.schemas` entry, or both.                                                                                                          |
| `ylsSchemaLoader.enableFluxCatalog`  | `boolean`                              | `true`      | Resolve schemas from the Flux schema catalog. Turn off in air-gapped environments to block all requests to schemas.fluxoperator.dev.                                                        |
| `ylsSchemaLoader.autoInsert`         | `boolean`                              | `false`     | Insert any resolved schema (from your additionalMappings, the Flux schema catalog, or the session cache) on document open, without a prompt, and restore missing `yaml.schemas` directives. |
| `ylsSchemaLoader.additionalMappings` | `{ kind, apiVersion, url }[]`          | `[]`        | Your own kind/apiVersion to schema URL mappings, checked before the Flux schema catalog.                                                                                                    |

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
- Never detects a stale inline directive or replaces an existing one. The
  `yaml.schemas` restore applies only to documents with `kind` and
  `apiVersion`.

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
