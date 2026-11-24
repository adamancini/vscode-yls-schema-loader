import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { createDiagnosticsProvider } from '../../src/diagnosticsProvider';
import { createInsertSchemaCommandHandler } from '../../src/insertSchemaCommand';
import { createFixtureFluxCatalog, disableActivatedFluxCatalog, restoreFluxCatalogSetting } from './testUtils';

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', name));
}

suite('insertSchema command: unresolved branch', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  // The fixture catalog index does not list widgets.example.com/v1 Widget, so it resolves
  // to 'unresolved' and the handler falls through to the manual URL prompt.
  test('applies the manually-entered URL when the user provides one and records it in the session cache', async () => {
    const uri = fixtureUri('unresolved-branch-accept.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    let prompted = false;
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, createFixtureFluxCatalog().catalog, {
        promptManualUrl: async () => {
          prompted = true;
          return 'https://manual.example.com/schema.json';
        },
      });
      await handler(uri, 0);
      assert.strictEqual(prompted, true);
      assert.strictEqual(doc.lineAt(0).text, '# yaml-language-server: $schema=https://manual.example.com/schema.json');
      assert.strictEqual(sessionCache.get('widgets.example.com/v1::Widget'), 'https://manual.example.com/schema.json');
    } finally {
      diagnostics.dispose();
    }
  });

  test('applies nothing when the manual-entry prompt is dismissed', async () => {
    const uri = fixtureUri('unresolved-branch-reject.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalText = doc.getText();
    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, createFixtureFluxCatalog().catalog, {
        promptManualUrl: async () => undefined,
      });
      await handler(uri, 0);
      assert.strictEqual(doc.getText(), originalText);
      assert.strictEqual(sessionCache.size, 0);
    } finally {
      diagnostics.dispose();
    }
  });
});

suite('insertSchema command: catalog disabled, no override', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('a Stage reaches the manual-URL prompt and nothing is inserted on its own', async () => {
    const uri = fixtureUri('catalog-disabled-manual-branch.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalText = doc.getText();
    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    const { catalog, requestedUrls } = createFixtureFluxCatalog(false);
    let prompted = false;
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, catalog, {
        promptManualUrl: async () => {
          prompted = true;
          return undefined;
        },
      });
      await handler(uri, 0);
      assert.strictEqual(prompted, true);
      assert.strictEqual(doc.getText(), originalText);
      assert.strictEqual(sessionCache.size, 0);
      assert.deepStrictEqual(requestedUrls, []);
    } finally {
      diagnostics.dispose();
    }
  });
});

suite('insertSchema command: fluxCatalog branch', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('applies the catalog URL directly, without a confirmation prompt, and records it in the session cache', async () => {
    const uri = fixtureUri('flux-catalog-branch.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    const { catalog, requestedUrls } = createFixtureFluxCatalog();
    let manualPromptCalled = false;
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, catalog, {
        promptManualUrl: async () => {
          manualPromptCalled = true;
          return undefined;
        },
      });
      await handler(uri, 0);
      assert.strictEqual(
        doc.lineAt(0).text,
        '# yaml-language-server: $schema=https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json'
      );
      assert.strictEqual(manualPromptCalled, false);
      assert.strictEqual(
        sessionCache.get('kargo.akuity.io/v1alpha1::Stage'),
        'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json'
      );
      assert.deepStrictEqual(requestedUrls, ['https://schemas.fluxoperator.dev/index.json']);
    } finally {
      diagnostics.dispose();
    }
  });
});
