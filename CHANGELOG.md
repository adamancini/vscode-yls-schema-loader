# Changelog

## 0.2.1

- The shipped extension is now a single esbuild bundle instead of the raw
  compiled source plus `node_modules` — the packaged `.vsix` dropped from
  298 files / 339KB to 7 files / 55KB.
- Diagnostics re-checking on document edits is now debounced (300ms) instead
  of re-parsing and re-checking coverage on every keystroke.
- Added ESLint and Prettier for ongoing code quality; no functional changes.

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
- The GitHub auth-session probe is now lazy (only touches it when web
  discovery is actually about to run, never for a bundled-mapping or
  session-cached hit) and silent (no more unwanted sign-in prompt on the
  Accounts menu), with a narrower permission request.
- Applying a resolved schema no longer throws when `yaml.schemas` can't be
  updated (e.g. no workspace folder is open) — it reports what happened
  instead, and an inline comment already inserted in `"both"` mode stays
  inserted.
- The GitHub-candidate confirmation prompt now shows the actual schema URL,
  not just its description.

## 0.1.1

- Fix: the packaged extension included local dev-tooling scratch state
  (`.codebase-memory/`, `.superpowers/`) that should never have shipped. No
  secrets or credentials were included — just non-sensitive local paths and
  tool config — but the `.vscodeignore` didn't explicitly exclude them and
  they leaked in via the 0.1.0 package. Excluded explicitly now.

## 0.1.0

Initial release.

- Detect `kind`/`apiVersion` in open YAML documents and resolve a matching
  yaml-language-server schema via a bundled mapping, an in-session cache, or
  GitHub-based heuristic discovery.
- Diagnostic + quick-fix flow, never a silent edit — insert a
  `# yaml-language-server: $schema=...` comment and/or a `yaml.schemas`
  workspace entry, per `ylsSchemaLoader.insertionMode`.
- GitHub-discovered schemas require explicit confirmation before anything is
  written; bundled-mapping matches apply directly.
- Bundled schemas for ArgoCD `ApplicationSet` and Kargo `Stage`/`Warehouse`/
  `Promotion`.
