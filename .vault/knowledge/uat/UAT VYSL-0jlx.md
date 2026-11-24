---
type: uat
project: vscode-yls-schema-loader
epic: VYSL-0jlx
created: 2026-11-24
---
## UAT: Restore missing schema directive for settings-associated files (v0.4.0)

### Prerequisites
- Build and install: `npm ci && npm run vscode:prepublish`, package the vsix, install it, or press F5 for an Extension Development Host. redhat.vscode-yaml installed.
- If installing locally, check ~/.vscode/extensions/.obsolete that the Marketplace updater did not replace it.
- Workspace settings (.vscode/settings.json): `{"yaml.schemas": {"https://example.com/my-schema.json": "deploy/app.yaml"}, "ylsSchemaLoader.insertionMode": "comment", "ylsSchemaLoader.autoInsert": false}`
- Create deploy/app.yaml containing: `apiVersion: v1`, `kind: ConfigMap`, `metadata: {name: x}` (no directive line).

### Test: Offer to restore
Do:
1. Open deploy/app.yaml.
2. Hover the underlined kind/apiVersion and open Quick Fix (or Ctrl+. on the line).
Expected:
- Information diagnostic: Schema is associated via yaml.schemas but the inline directive is missing.
- Quick fix "Restore yaml-language-server schema directive". Applying it inserts line 1: `# yaml-language-server: $schema=https://example.com/my-schema.json`. yaml.schemas is unchanged. (Known: the hover menu may close itself after ~1s; use Ctrl+. if so.)

### Test: Auto-restore on open
Do:
1. Delete line 1, save, close the file.
2. Set ylsSchemaLoader.autoInsert to true. Reopen deploy/app.yaml.
Expected:
- The directive is restored automatically on open with the settings URL, no prompt, no network.
3. Delete the line again without closing.
Expected:
- It is NOT re-inserted while the file stays open.

### Test: Multi-document file
Do:
1. Make the file three documents separated by --- , with a directive only in the middle one. Close and reopen.
Expected:
- Directives are inserted above the first and third documents only.

### Test: Gating
Do:
1. Set ylsSchemaLoader.insertionMode to yamlSchemas and reopen with the line removed.
2. Set autoInsert false and reopen.
Expected:
- yamlSchemas mode: no diagnostic and no insertion. autoInsert false: diagnostic and quick-fix still offered, nothing inserted automatically.

### Test: Alias key is not restored
Do:
1. Change settings to `{"yaml.schemas": {"kubernetes": "deploy/app.yaml"}}`; reopen with no directive.
Expected:
- No restore diagnostic and no insertion (no broken `$schema=kubernetes` line).

### Test: Pattern specificity
Do:
1. Map two URLs: `"https://a.example/x.json": "**/*.yaml"` and `"https://b.example/y.json": "deploy/app.yaml"`; open the file without a directive.
Expected:
- The restored URL is https://b.example/y.json (exact path beats glob).
