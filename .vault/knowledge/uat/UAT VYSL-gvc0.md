---
type: uat
project: vscode-yls-schema-loader
epic: VYSL-gvc0
created: 2026-11-24
---
## UAT: Flux schema catalog as first-class schema source (v0.3.0)

### Prerequisites
- Install the extension build (`npm ci && npm run vscode:prepublish`, then package/install the vsix or press F5 for an Extension Development Host) with redhat.vscode-yaml installed.
- Network access to https://schemas.fluxoperator.dev. Settings: ylsSchemaLoader.enableFluxCatalog true (default), ylsSchemaLoader.autoInsert false.

### Test: Quick-fix applies a catalog schema without confirmation
Do:
1. Open a new YAML file containing: apiVersion: kargo.akuity.io/v1alpha1, kind: Stage, metadata: {name: x}.
2. Click the diagnostic on kind and choose the schema quick-fix (or run Insert Schema for Current Document).
Expected:
- Line 1 becomes `# yaml-language-server: $schema=https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json` with no modal or quick pick.

### Test: Auto-insert on open
Do:
1. Set ylsSchemaLoader.autoInsert to true.
2. Open a YAML file with apiVersion: v1, kind: ConfigMap.
Expected:
- The first line is `# yaml-language-server: $schema=https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json`.

### Test: Multi-document file
Do:
1. With autoInsert true, open a file with a Stage document, then --- , then a Warehouse document.
Expected:
- Each document gets its own correct catalog schema comment; no lines overwritten.

### Test: Catalog disabled
Do:
1. Set ylsSchemaLoader.enableFluxCatalog to false; reload the window.
2. Open a ConfigMap YAML and run the quick-fix.
Expected:
- No schema is inserted automatically; you get a manual URL prompt. No requests to schemas.fluxoperator.dev (check a proxy or Developer: Show Running Extensions network log).

### Test: Native kustomize is unresolved by default, resolvable by override
Do:
1. Re-enable the catalog. Open a file with apiVersion: kustomize.config.k8s.io/v1beta1, kind: Kustomization.
2. Run the quick-fix: expect the manual prompt, dismiss it, file unchanged.
3. Add to settings: `"ylsSchemaLoader.additionalMappings": [{"kind":"Kustomization","apiVersion":"kustomize.config.k8s.io/v1beta1","schemaUrl":"https://json.schemastore.org/kustomization.json"}]` (use the exact shape from the README example).
4. Run the quick-fix again.
Expected:
- Step 2 changes nothing. Step 4 inserts the schemastore kustomization URL.

### Test: Offline reuse of cached index
Do:
1. With the catalog enabled, resolve any kind once while online.
2. Go offline, reload the window, resolve another catalog kind.
Expected:
- It still resolves from the cached index; no error notification.

### Test: Removed features are gone
Do:
1. Open Settings and search ylsSchemaLoader.
2. Open an unknown kind (e.g. kind: Widget) and run the quick-fix.
Expected:
- Only autoInsert, enableFluxCatalog, additionalMappings (and other retained settings) are listed; no web discovery or GitHub settings. Widget goes straight to the manual URL prompt, with no GitHub sign-in or repo confirmation dialog.

### Test: Version
Do: `grep '"version"' package.json; head -20 CHANGELOG.md`
Expected: version 0.3.0; CHANGELOG has a 0.3.0 (BREAKING) section.