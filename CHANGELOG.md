# Changelog

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
