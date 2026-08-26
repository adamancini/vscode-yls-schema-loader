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
- **Resolves** a schema through four stages, first match wins:
  1. A bundled, curated mapping of common kinds (see below).
  2. An in-session cache of resolutions already made this window.
  3. A GitHub heuristic: guesses the source repo from the `apiVersion` group,
     probes common schema file paths, and falls back to a GitHub code search.
  4. A [datreeio/CRDs-catalog](https://github.com/datreeio/CRDs-catalog) lookup,
     tried only when step 3 finds no source-code repo (or none with a schema)
     and wasn't rate-limited — a single conventional URL, verified to exist
     before it's used.
- **Never edits silently.** An uncovered document gets an info diagnostic and
  a quick-fix — nothing is written until you act on it. A schema found via
  GitHub always shows you the candidate (or a picker, if there's more than
  one) and requires explicit confirmation before anything is inserted.
  Bundled-mapping and CRDs-catalog matches apply directly — both are already
  verified before being offered, so there's nothing ambiguous to confirm.
- **Two ways to apply a fix:** the quick-fix on the diagnostic, or the
  command palette — _YLS Schema Loader: Insert Schema for Current Document_
  — which resolves whichever document your cursor is in.
- **Opt-in auto-insert** (`ylsSchemaLoader.autoInsert`, off by default): when
  a document is opened and resolves through one of the three direct-apply
  sources above (bundled mapping, session cache, or CRDs-catalog), insert it
  immediately — no diagnostic, no quick-fix, nothing to click. Runs on
  document open only, not on every keystroke, so it can't turn typing into
  a stream of network lookups. GitHub candidates still always require
  manual confirmation, even with this on.

## Bundled schemas

53 kind/apiVersion pairs across the following ecosystems, grouped by
project:

- **Kargo** (`kargo.akuity.io/v1alpha1`) — all resource kinds: `Stage`,
  `Warehouse`, `Promotion`, `ClusterConfig`, `ClusterPromotionTask`,
  `Freight`, `Project`, `ProjectConfig`, `PromotionRequest`,
  `PromotionTask`, `Target`.
- **ArgoCD ecosystem** (`argoproj.io/v1alpha1`) — Argo CD (`Application`,
  `AppProject`, `ApplicationSet`), Argo Rollouts (`Rollout`,
  `AnalysisTemplate`, `ClusterAnalysisTemplate`, `AnalysisRun`,
  `Experiment`), Argo Workflows (`Workflow`, `WorkflowTemplate`,
  `ClusterWorkflowTemplate`, `CronWorkflow`), and Argo Events (`EventBus`,
  `EventSource`, `Sensor`).
- **Flux** — `GitRepository`, `HelmRepository`, `OCIRepository`, `Bucket`
  (`source.toolkit.fluxcd.io/v1`), `Kustomization`
  (`kustomize.toolkit.fluxcd.io/v1`), `HelmRelease`
  (`helm.toolkit.fluxcd.io/v2`), `ImageRepository`, `ImagePolicy`,
  `ImageUpdateAutomation` (`image.toolkit.fluxcd.io/v1`), `Alert`, `Provider`
  (`notification.toolkit.fluxcd.io/v1beta3`), `Receiver`
  (`notification.toolkit.fluxcd.io/v1`) — schemas sourced from the
  Flux-community-maintained [flux2-schemas](https://github.com/fluxcd-community/flux2-schemas).
- **Istio** — `VirtualService`, `Gateway`, `DestinationRule`,
  `ServiceEntry`, `Sidecar` (`networking.istio.io/v1`), plus
  `PeerAuthentication`, `AuthorizationPolicy`, `RequestAuthentication`
  (`security.istio.io/v1`).
- **Cilium** (`cilium.io/v2`) — `CiliumNetworkPolicy`,
  `CiliumClusterwideNetworkPolicy`.
- **cert-manager** (`cert-manager.io/v1`) — `Certificate`,
  `ClusterIssuer`, `Issuer`.
- **Kustomize** (`kustomize.config.k8s.io/v1beta1`) — the native
  `kubectl kustomize` / `kustomize` CLI's own `kustomization.yaml`
  `Kustomization` kind, distinct from Flux's `kustomize.toolkit.fluxcd.io`
  `Kustomization` CRD above. Kustomize doesn't publish its own JSON schema,
  so this uses the community-maintained
  [SchemaStore](https://www.schemastore.org/kustomization.json) entry.
- **External Secrets Operator** (`external-secrets.io/v1`) — `ExternalSecret`.

Anything else falls through to GitHub discovery, or you can extend the
mapping yourself with `ylsSchemaLoader.additionalMappings`.

## Extension Settings

| Setting                              | Type                                   | Default     | Description                                                                                      |
| ------------------------------------ | -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `ylsSchemaLoader.insertionMode`      | `"comment" \| "yamlSchemas" \| "both"` | `"comment"` | What a resolved schema writes: an inline comment, a `yaml.schemas` entry, or both.               |
| `ylsSchemaLoader.enableWebDiscovery` | `boolean`                              | `true`      | Whether to search GitHub when no bundled mapping or cached resolution exists.                    |
| `ylsSchemaLoader.autoInsert`         | `boolean`                              | `false`     | Auto-insert direct-apply resolutions (bundled/session-cache/CRDs-catalog) with no prompt.        |
| `ylsSchemaLoader.additionalMappings` | `{ kind, apiVersion, url }[]`          | `[]`        | Your own overrides, merged on top of the bundled mapping.                                        |
| `ylsSchemaLoader.githubRepoHints`    | `{ group, repo }[]`                    | `[]`        | Explicit `apiVersion` group → `org/repo` overrides, for when the GitHub heuristic guesses wrong. |

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
