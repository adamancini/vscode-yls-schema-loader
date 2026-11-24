# Changelog

## 0.3.2

- Copyedited the README, changelog and setting descriptions for clarity. No
  code changes.

## 0.3.1

- Marketplace listing: updated the description, added keywords and the
  Linters category, and refreshed the README intro for the Flux schema
  catalog. No code changes.

## 0.3.0 (BREAKING)

- The [Flux schema catalog](https://schemas.fluxoperator.dev/catalog/) is now
  the schema source. Resolver order: your
  `ylsSchemaLoader.additionalMappings`, then the Flux schema catalog, then
  the session cache, then unresolved.
- Catalog matches apply directly and are eligible for `autoInsert`.
- The catalog index is cached in VS Code global state for 24 hours and never
  fetched per edit. Offline, the extension uses a stale copy.
- New setting `ylsSchemaLoader.enableFluxCatalog` (default `true`).
- REMOVED: the bundled mapping (all 53 embedded entries). The extension
  ships no schema data.
- REMOVED: GitHub heuristic discovery and its confirmation prompt.
- REMOVED: the datreeio/CRDs-catalog fallback.
- REMOVED: settings `ylsSchemaLoader.enableWebDiscovery` and
  `ylsSchemaLoader.githubRepoHints`.

## 0.2.7

- Added `ylsSchemaLoader.autoInsert` (off by default): when enabled, it
  inserts the schema for a document that resolves through a direct-apply
  source (bundled mapping, session cache, or the CRDs-catalog fallback) as
  soon as the document opens, with no diagnostic or quick-fix. It runs only
  on document open, not on every edit, so typing cannot trigger a stream of
  network lookups. GitHub-heuristic candidates are unaffected and still
  always require manual confirmation.

## 0.2.6

- Added a fourth resolution stage: when GitHub discovery finds no source-code
  repo (or none with a schema) and wasn't rate-limited, the extension
  automatically checks
  [datreeio/CRDs-catalog](https://github.com/datreeio/CRDs-catalog) for a
  conventionally named match. The match is a single deterministic URL,
  verified to exist before use, so it applies directly without a confirmation
  prompt, like a bundled-mapping hit.

## 0.2.5

- Added the External Secrets Operator `ExternalSecret` kind
  (`external-secrets.io/v1`).

## 0.2.4

- Added the native `kubectl kustomize` / `kustomize` CLI's `Kustomization`
  kind (`kustomize.config.k8s.io/v1beta1`), sourced from
  [SchemaStore](https://www.schemastore.org/kustomization.json) because
  `kubernetes-sigs/kustomize` publishes no JSON schema of its own. It is
  distinct from the existing Flux `kustomize.toolkit.fluxcd.io`
  `Kustomization` CRD entry.

## 0.2.3

- All Flux schemas now come from
  [fluxcd-community/flux2-schemas](https://github.com/fluxcd-community/flux2-schemas),
  a repo the Flux community maintains specifically for yaml-language-server,
  rather than from a general-purpose CRD catalog.
- Added the Flux notification-controller kinds: `Alert`, `Provider`, `Receiver`
  (`notification.toolkit.fluxcd.io`).

## 0.2.2

- Fix: the bundled mapping lacked `ImageRepository`, `ImagePolicy`, and
  `ImageUpdateAutomation` (Flux's `image.toolkit.fluxcd.io` group). The
  original Flux coverage omitted them by oversight, not by design.

## 0.2.1

- The shipped extension is now a single esbuild bundle instead of the raw
  compiled source plus `node_modules`. The packaged `.vsix` shrank from
  298 files / 339KB to 7 files / 55KB.
- Document edits now trigger a debounced (300ms) diagnostics re-check instead
  of re-parsing and re-checking coverage on every keystroke.
- Added ESLint and Prettier for code quality; no functional changes.

## 0.2.0

- Bundled mapping expanded from 4 to 45 entries: full Kargo CRD coverage
  (`ClusterConfig`, `ClusterPromotionTask`, `Freight`, `Project`,
  `ProjectConfig`, `PromotionRequest`, `PromotionTask`, `Target`, in addition
  to `Stage`/`Warehouse`/`Promotion`), the rest of the ArgoCD ecosystem
  (Argo CD `Application`/`AppProject`, Argo Rollouts, Argo Workflows, Argo
  Events), and common resources from CNCF-graduated Flux, Istio, and Cilium,
  plus cert-manager.
- GitHub API failures (rate limits, network errors) now surface as a
  dismissible, retryable warning instead of silently falling through to
  manual entry with no explanation.
- The GitHub auth-session probe is now lazy, silent, and narrower. It runs
  only when web discovery is about to run, never for a bundled-mapping or
  session-cached hit; it no longer adds an unwanted sign-in prompt to the
  Accounts menu; and it requests fewer permissions.
- Applying a resolved schema no longer throws when `yaml.schemas` can't be
  updated (for example, when no workspace folder is open). It reports what
  happened instead, and in `"both"` mode an already-inserted inline comment
  stays inserted.
- The GitHub-candidate confirmation prompt now shows the schema URL as well
  as its description.

## 0.1.1

- Fix: the 0.1.0 package included local dev-tooling scratch state
  (`.codebase-memory/`, `.superpowers/`) that should never have shipped. It
  held only non-sensitive local paths and tool config, no secrets or
  credentials, but `.vscodeignore` did not exclude it explicitly. Now it
  does.

## 0.1.0

Initial release.

- Detect `kind`/`apiVersion` in open YAML documents and resolve a matching
  yaml-language-server schema through a bundled mapping, an in-session cache,
  or GitHub-based heuristic discovery.
- Diagnostic and quick-fix flow, never a silent edit: insert a
  `# yaml-language-server: $schema=...` comment, a `yaml.schemas` workspace
  entry, or both, per `ylsSchemaLoader.insertionMode`.
- GitHub-discovered schemas require explicit confirmation before anything is
  written; bundled-mapping matches apply directly.
- Bundled schemas for ArgoCD `ApplicationSet` and Kargo `Stage`/`Warehouse`/
  `Promotion`.
