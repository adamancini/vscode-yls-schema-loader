import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { autoInsertSchemas } from '../../src/autoInsert';
import { createFixtureFluxCatalog, disableActivatedFluxCatalog, restoreFluxCatalogSetting } from './testUtils';

const CATALOG_STAGE_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json';
const CATALOG_WAREHOUSE_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/warehouse_v1alpha1.json';

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', name));
}

const disabledCatalog = () => createFixtureFluxCatalog(false).catalog;
const fixtureCatalog = () => createFixtureFluxCatalog().catalog;

async function enableAutoInsert(): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('autoInsert', true, vscode.ConfigurationTarget.Workspace);
}

// Every test opens its document BEFORE switching autoInsert on: the activated extension's own
// open handler checks that setting synchronously, so it leaves the document alone and only the
// call under test (with its injected catalog) resolves it -- no real network.
suite('autoInsertSchemas', () => {
  setup(disableActivatedFluxCatalog);
  teardown(async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', undefined, vscode.ConfigurationTarget.Workspace);
    await restoreFluxCatalogSetting();
  });

  test('does nothing when the setting is left at its default (off)', async () => {
    const uri = fixtureUri('auto-insert-disabled.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalFirstLine = doc.lineAt(0).text;
    await autoInsertSchemas(doc, new Map(), disabledCatalog());
    assert.strictEqual(doc.lineAt(0).text, originalFirstLine);
  });

  test('applies a catalog match automatically when enabled', async () => {
    const uri = fixtureUri('auto-insert-bundled.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    await enableAutoInsert();
    await autoInsertSchemas(doc, new Map(), fixtureCatalog());
    assert.strictEqual(doc.lineAt(0).text, `# yaml-language-server: $schema=${CATALOG_STAGE_URL}`);
  });

  test('populates the session cache for a catalog match', async () => {
    const uri = fixtureUri('auto-insert-bundled-session-cache.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    await enableAutoInsert();
    const sessionCache = new Map<string, string>();
    await autoInsertSchemas(doc, sessionCache, fixtureCatalog());
    assert.strictEqual(sessionCache.get('kargo.akuity.io/v1alpha1::Stage'), CATALOG_STAGE_URL);
  });

  test('does not apply anything when nothing resolves -- leaves the document unresolved', async () => {
    const uri = fixtureUri('auto-insert-unresolved.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    await enableAutoInsert();
    const originalFirstLine = doc.lineAt(0).text;
    const originalText = doc.getText();
    const sessionCache = new Map<string, string>();
    // The fixture catalog index does not list widgets.example.com/v1 Widget.
    const { catalog, requestedUrls } = createFixtureFluxCatalog();
    await autoInsertSchemas(doc, sessionCache, catalog);
    assert.strictEqual(doc.lineAt(0).text, originalFirstLine);
    assert.strictEqual(doc.getText(), originalText);
    assert.deepStrictEqual(requestedUrls, ['https://schemas.fluxoperator.dev/index.json']);
    assert.strictEqual(sessionCache.size, 0);
  });

  test('resolves multiple documents bottom-to-top, so line shifts never corrupt an earlier insertion point', async () => {
    const uri = fixtureUri('auto-insert-multidoc.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    await enableAutoInsert();
    await autoInsertSchemas(doc, new Map(), fixtureCatalog());

    const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
    assert.deepStrictEqual(lines, [
      `# yaml-language-server: $schema=${CATALOG_STAGE_URL}`,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: auto-insert-multidoc-stage',
      '---',
      `# yaml-language-server: $schema=${CATALOG_WAREHOUSE_URL}`,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Warehouse',
      'metadata:',
      '  name: auto-insert-multidoc-warehouse',
      '',
    ]);
  });
});

suite('autoInsertSchemas: Flux schema catalog', () => {
  setup(disableActivatedFluxCatalog);
  teardown(async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', undefined, vscode.ConfigurationTarget.Workspace);
    await restoreFluxCatalogSetting();
  });

  // Documents are opened before autoInsert is switched on (see the suite above for why).

  test('applies a catalog match automatically, with no prompt, and records it in the session cache', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('auto-insert-flux-catalog.yaml'));
    await enableAutoInsert();
    const { catalog, requestedUrls } = createFixtureFluxCatalog();
    const sessionCache = new Map<string, string>();
    await autoInsertSchemas(doc, sessionCache, catalog);
    assert.strictEqual(doc.lineAt(0).text, `# yaml-language-server: $schema=${CATALOG_STAGE_URL}`);
    assert.strictEqual(sessionCache.get('kargo.akuity.io/v1alpha1::Stage'), CATALOG_STAGE_URL);
    assert.deepStrictEqual(requestedUrls, ['https://schemas.fluxoperator.dev/index.json']);
  });

  test('applies catalog matches in a two-document file bottom-to-top with both lines correct', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('auto-insert-flux-catalog-multidoc.yaml'));
    await enableAutoInsert();
    const { catalog, requestedUrls } = createFixtureFluxCatalog();
    await autoInsertSchemas(doc, new Map(), catalog);
    const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
    assert.deepStrictEqual(lines, [
      `# yaml-language-server: $schema=${CATALOG_STAGE_URL}`,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: auto-insert-flux-catalog-multidoc-stage',
      '---',
      `# yaml-language-server: $schema=${CATALOG_WAREHOUSE_URL}`,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Warehouse',
      'metadata:',
      '  name: auto-insert-flux-catalog-multidoc-warehouse',
      '',
    ]);
    // Two lookups, one shared index fetch.
    assert.strictEqual(requestedUrls.length, 1);
  });

  test('catalog disabled and no override -> Stage is unresolved and auto-insert leaves the document untouched', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('auto-insert-flux-catalog-disabled.yaml'));
    const originalText = doc.getText();
    await enableAutoInsert();
    const { catalog, requestedUrls } = createFixtureFluxCatalog(false);
    const sessionCache = new Map<string, string>();
    await autoInsertSchemas(doc, sessionCache, catalog);
    assert.strictEqual(doc.getText(), originalText);
    assert.strictEqual(sessionCache.size, 0);
    assert.deepStrictEqual(requestedUrls, []);
  });
});
