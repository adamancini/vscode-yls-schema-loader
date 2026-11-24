import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { autoInsertSchemas } from '../../src/autoInsert';
import { FluxCatalog } from '../../src/lib/fluxCatalog';
import {
  createFixtureFluxCatalog,
  disableActivatedFluxCatalog,
  restoreFluxCatalogSetting,
  staysFalseFor,
  waitFor,
} from './testUtils';

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

// Restore on open: a document with no inline directive in a file mapped under a URL key in
// yaml.schemas gets that settings URL back as a comment, with no catalog lookup, no network,
// no session-cache write and no yaml.schemas write. Schema URLs live on the reserved .invalid
// host so nothing can be fetched.
const SETTINGS_URL = 'https://schemas.example.invalid/restore-auto-stage.json';
const SETTINGS_DIRECTIVE = `# yaml-language-server: $schema=${SETTINGS_URL}`;

function relPath(name: string): string {
  return `test/fixtures/${name}`;
}

function linesOf(doc: vscode.TextDocument): string[] {
  return Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
}

async function setYamlSchemas(value: Record<string, string | string[]> | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('yaml').update('schemas', value, vscode.ConfigurationTarget.Workspace);
}

async function setInsertionMode(mode: string | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('insertionMode', mode, vscode.ConfigurationTarget.Workspace);
}

// Wraps a catalog to record every lookup() call, so a test proves no lookup happened at all.
function countingCatalog(inner: FluxCatalog): { catalog: FluxCatalog; lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    catalog: {
      lookup: (kind, apiVersion) => {
        lookups.push(`${apiVersion}::${kind}`);
        return inner.lookup(kind, apiVersion);
      },
    },
  };
}

suite('autoInsertSchemas: restore the yaml.schemas directive on open', () => {
  setup(disableActivatedFluxCatalog);
  teardown(async () => {
    const config = vscode.workspace.getConfiguration('ylsSchemaLoader');
    await config.update('autoInsert', undefined, vscode.ConfigurationTarget.Workspace);
    await setInsertionMode(undefined);
    await setYamlSchemas(undefined);
    await restoreFluxCatalogSetting();
  });

  // Direct-call tests open the document BEFORE configuring yaml.schemas and autoInsert, so the
  // activated extension's own open handler leaves it alone (see the first suite).

  test('comment mode, exact path: inserts the settings URL without consulting the catalog, the network or the session cache', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('restore-auto.yaml'));
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-auto.yaml') });
    await enableAutoInsert();
    // The fixture catalog knows kargo.akuity.io/v1alpha1 Stage, yet the settings URL wins.
    const { catalog: inner, requestedUrls } = createFixtureFluxCatalog();
    const { catalog, lookups } = countingCatalog(inner);
    const sessionCache = new Map<string, string>();
    await autoInsertSchemas(doc, sessionCache, catalog);
    assert.deepStrictEqual(linesOf(doc), [
      SETTINGS_DIRECTIVE,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: restore-auto',
      '',
    ]);
    assert.deepStrictEqual(lookups, []);
    assert.deepStrictEqual(requestedUrls, []);
    assert.strictEqual(sessionCache.size, 0);
  });

  test('three documents: restores above the first and third bottom-to-top and leaves the second directive alone', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('restore-auto-multidoc.yaml'));
    await setYamlSchemas({ [SETTINGS_URL]: [relPath('restore-auto-multidoc.yaml')] });
    await enableAutoInsert();
    await autoInsertSchemas(doc, new Map(), fixtureCatalog());
    assert.deepStrictEqual(linesOf(doc), [
      SETTINGS_DIRECTIVE,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: first',
      '---',
      '# yaml-language-server: $schema=https://schemas.example.invalid/existing.json',
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Warehouse',
      'metadata:',
      '  name: second',
      '---',
      SETTINGS_DIRECTIVE,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: third',
      '',
    ]);
  });

  test('both mode: inserts the comment and leaves yaml.schemas exactly as it was', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('restore-auto-both-mode.yaml'));
    const mapping = { [SETTINGS_URL]: [relPath('restore-auto-both-mode.yaml')] };
    await setYamlSchemas(mapping);
    await setInsertionMode('both');
    await enableAutoInsert();
    const before: unknown = JSON.parse(JSON.stringify(vscode.workspace.getConfiguration('yaml').get('schemas')));
    assert.deepStrictEqual(before, mapping);
    await autoInsertSchemas(doc, new Map(), fixtureCatalog());
    assert.strictEqual(doc.lineAt(0).text, SETTINGS_DIRECTIVE);
    assert.strictEqual(doc.lineAt(1).text, 'apiVersion: kargo.akuity.io/v1alpha1');
    assert.deepStrictEqual(vscode.workspace.getConfiguration('yaml').get('schemas'), before);
  });

  test('yamlSchemas mode: a settings-associated document is left untouched', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('restore-auto-yamlschemas-mode.yaml'));
    const originalText = doc.getText();
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-auto-yamlschemas-mode.yaml') });
    await setInsertionMode('yamlSchemas');
    await enableAutoInsert();
    const { catalog: inner, requestedUrls } = createFixtureFluxCatalog();
    const { catalog, lookups } = countingCatalog(inner);
    await autoInsertSchemas(doc, new Map(), catalog);
    assert.strictEqual(doc.getText(), originalText);
    assert.deepStrictEqual(lookups, []);
    assert.deepStrictEqual(requestedUrls, []);
  });

  test('autoInsert off: a settings-associated document is left untouched', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('restore-auto-disabled.yaml'));
    const originalText = doc.getText();
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-auto-disabled.yaml') });
    await autoInsertSchemas(doc, new Map(), fixtureCatalog());
    assert.strictEqual(doc.getText(), originalText);
  });

  test('an alias-only mapping (kubernetes) causes no insertion', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('restore-auto-disabled.yaml'));
    const originalText = doc.getText();
    await setYamlSchemas({ kubernetes: relPath('restore-auto-disabled.yaml') });
    await enableAutoInsert();
    await autoInsertSchemas(doc, new Map(), fixtureCatalog());
    assert.strictEqual(doc.getText(), originalText);
  });

  test('regression: an unmapped document still gets the catalog URL through the resolver', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('restore-auto-unmapped.yaml'));
    // yaml.schemas maps a different file, so this one is uncovered.
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-auto.yaml') });
    await enableAutoInsert();
    const sessionCache = new Map<string, string>();
    await autoInsertSchemas(doc, sessionCache, fixtureCatalog());
    assert.strictEqual(doc.lineAt(0).text, `# yaml-language-server: $schema=${CATALOG_STAGE_URL}`);
    assert.strictEqual(sessionCache.get('kargo.akuity.io/v1alpha1::Stage'), CATALOG_STAGE_URL);
  });

  // No direct call: the activated extension's own onDidOpenTextDocument handler does the work.
  test('real wiring: opening a mapped file restores the directive, and deleting it is not undone while open', async function () {
    // waitFor (up to 4s) plus the 1s no-reinsert window exceed mocha's 2s default.
    this.timeout(8000);
    const name = 'restore-auto-activated.yaml';
    await setYamlSchemas({ [SETTINGS_URL]: relPath(name) });
    await enableAutoInsert();
    const doc = await vscode.workspace.openTextDocument(fixtureUri(name));
    await waitFor(() => doc.lineAt(0).text === SETTINGS_DIRECTIVE, 4000);
    assert.strictEqual(doc.lineAt(1).text, 'apiVersion: kargo.akuity.io/v1alpha1');

    const edit = new vscode.WorkspaceEdit();
    edit.delete(doc.uri, new vscode.Range(0, 0, 1, 0));
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
    assert.strictEqual(doc.lineAt(0).text, 'apiVersion: kargo.akuity.io/v1alpha1');
    await staysFalseFor(() => doc.lineAt(0).text === SETTINGS_DIRECTIVE, 1000);
  });
});
