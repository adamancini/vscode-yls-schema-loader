import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { autoInsertSchemas } from '../../src/autoInsert';
import { ResolverDeps } from '../../src/lib/resolver';

const STAGE_SCHEMA_URL =
  'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';
const WAREHOUSE_SCHEMA_URL =
  'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/warehouses.kargo.akuity.io_v1alpha1.json';

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', name));
}

// GitHub discovery 404s everywhere, but the CRDs-catalog URL hits.
const crdsCatalogHitFetchFn: ResolverDeps['fetchFn'] = async (url: string) => {
  if (url === 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/widgets.example.com/widget_v1.json') {
    return { ok: true, status: 200, json: async () => ({}) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

// A conventional GitHub Contents API path hits, so resolution lands on `github` --
// a source auto-insert must never apply on its own.
const githubOnlyFetchFn: ResolverDeps['fetchFn'] = async (url: string) => {
  if (url === 'https://api.github.com/repos/example/widgets/contents/schemas.json') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ download_url: 'https://raw.githubusercontent.com/example/widgets/HEAD/schemas.json' }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

suite('autoInsertSchemas', () => {
  teardown(async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('does nothing when the setting is left at its default (off)', async () => {
    const uri = fixtureUri('auto-insert-disabled.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalFirstLine = doc.lineAt(0).text;
    await autoInsertSchemas(doc, new Map());
    assert.strictEqual(doc.lineAt(0).text, originalFirstLine);
  });

  test('applies a bundled-mapping match automatically when enabled', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', true, vscode.ConfigurationTarget.Workspace);
    const uri = fixtureUri('auto-insert-bundled.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    await autoInsertSchemas(doc, new Map());
    assert.strictEqual(doc.lineAt(0).text, `# yaml-language-server: $schema=${STAGE_SCHEMA_URL}`);
  });

  test('populates the session cache for a bundled-mapping match', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', true, vscode.ConfigurationTarget.Workspace);
    const uri = fixtureUri('auto-insert-bundled-session-cache.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const sessionCache = new Map<string, string>();
    await autoInsertSchemas(doc, sessionCache);
    assert.strictEqual(sessionCache.get('kargo.akuity.io/v1alpha1::Stage'), STAGE_SCHEMA_URL);
  });

  test('applies a CRDs-catalog match automatically when enabled', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', true, vscode.ConfigurationTarget.Workspace);
    const uri = fixtureUri('auto-insert-crds-catalog.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    await autoInsertSchemas(doc, new Map(), { fetchFn: crdsCatalogHitFetchFn });
    assert.strictEqual(
      doc.lineAt(0).text,
      '# yaml-language-server: $schema=https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/widgets.example.com/widget_v1.json'
    );
  });

  test('does not apply a GitHub-only match -- leaves the document for manual confirmation', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', true, vscode.ConfigurationTarget.Workspace);
    const uri = fixtureUri('auto-insert-github-only.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalFirstLine = doc.lineAt(0).text;
    await autoInsertSchemas(doc, new Map(), { fetchFn: githubOnlyFetchFn });
    assert.strictEqual(doc.lineAt(0).text, originalFirstLine);
  });

  test('does not apply anything when nothing resolves -- leaves the document unresolved', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', true, vscode.ConfigurationTarget.Workspace);
    const uri = fixtureUri('auto-insert-unresolved.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalFirstLine = doc.lineAt(0).text;
    const sessionCache = new Map<string, string>();
    const nothingFoundFetchFn: ResolverDeps['fetchFn'] = async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    await autoInsertSchemas(doc, sessionCache, { fetchFn: nothingFoundFetchFn });
    assert.strictEqual(doc.lineAt(0).text, originalFirstLine);
    assert.strictEqual(sessionCache.size, 0);
  });

  test('resolves multiple documents bottom-to-top, so line shifts never corrupt an earlier insertion point', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', true, vscode.ConfigurationTarget.Workspace);
    const uri = fixtureUri('auto-insert-multidoc.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    await autoInsertSchemas(doc, new Map());

    const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
    assert.deepStrictEqual(lines, [
      `# yaml-language-server: $schema=${STAGE_SCHEMA_URL}`,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: auto-insert-multidoc-stage',
      '---',
      `# yaml-language-server: $schema=${WAREHOUSE_SCHEMA_URL}`,
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Warehouse',
      'metadata:',
      '  name: auto-insert-multidoc-warehouse',
      '',
    ]);
  });
});
