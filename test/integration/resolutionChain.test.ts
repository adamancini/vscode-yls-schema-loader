import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { autoInsertSchemas } from '../../src/autoInsert';
import {
  clearAdditionalMappings,
  createFixtureFluxCatalog,
  disableActivatedFluxCatalog,
  restoreFluxCatalogSetting,
  setAdditionalMappings,
} from './testUtils';

// Scripted demo of the final resolver chain:
//   ylsSchemaLoader.additionalMappings -> Flux schema catalog -> session cache -> unresolved
// over a five-document file (Warehouse, Stage, ConfigMap, native kustomize Kustomization,
// Widget). Each scenario opens its own copy of the content, so in-memory edits never leak
// between scenarios. The catalog is the fixture-backed one from testUtils: a counting stub
// fetch and an in-memory store, never the real network.

const INDEX_URL = 'https://schemas.fluxoperator.dev/index.json';
const WAREHOUSE_OVERRIDE_URL = 'https://override.example.com/warehouse.json';
const CATALOG_STAGE_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json';
const CATALOG_CONFIGMAP_URL = 'https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json';
const KUSTOMIZE_OVERRIDE_URL = 'https://json.schemastore.org/kustomization.json';

const WAREHOUSE_OVERRIDE = { kind: 'Warehouse', apiVersion: 'kargo.akuity.io/v1alpha1', url: WAREHOUSE_OVERRIDE_URL };

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', name));
}

function schemaLine(url: string): string {
  return `# yaml-language-server: $schema=${url}`;
}

// The expected file after auto-insert: `schemas` holds the comment (or none) to sit directly
// above each of the five documents, in file order.
function expectedLines(name: string, schemas: (string | undefined)[]): string[] {
  const docs = [
    ['apiVersion: kargo.akuity.io/v1alpha1', 'kind: Warehouse', 'metadata:', `  name: ${name}-warehouse`],
    ['apiVersion: kargo.akuity.io/v1alpha1', 'kind: Stage', 'metadata:', `  name: ${name}-stage`],
    ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', `  name: ${name}-configmap`],
    ['apiVersion: kustomize.config.k8s.io/v1beta1', 'kind: Kustomization', 'resources:', '  - deployment.yaml'],
    ['apiVersion: widgets.example.com/v1', 'kind: Widget', 'metadata:', `  name: ${name}-widget`],
  ];
  const lines: string[] = [];
  docs.forEach((doc, i) => {
    if (i > 0) {
      lines.push('---');
    }
    const url = schemas[i];
    if (url) {
      lines.push(schemaLine(url));
    }
    lines.push(...doc);
  });
  lines.push('');
  return lines;
}

function linesOf(doc: vscode.TextDocument): string[] {
  return Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
}

async function setAutoInsert(value: boolean | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('autoInsert', value, vscode.ConfigurationTarget.Workspace);
}

// Documents are opened BEFORE autoInsert is switched on: the activated extension's own open
// handler checks that setting synchronously, so only the call under test (with its injected
// catalog) touches the document.
suite('resolution chain demo (override -> Flux catalog -> session cache -> unresolved)', () => {
  setup(disableActivatedFluxCatalog);
  teardown(async () => {
    await setAutoInsert(undefined);
    await clearAdditionalMappings();
    await restoreFluxCatalogSetting();
  });

  test('A: catalog enabled -- override beats catalog, catalog resolves Stage and ConfigMap, Kustomization and Widget stay untouched, index fetched once', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('resolution-chain.yaml'));
    await setAdditionalMappings([WAREHOUSE_OVERRIDE]);
    await setAutoInsert(true);
    const { catalog, requestedUrls } = createFixtureFluxCatalog();

    await autoInsertSchemas(doc, new Map(), catalog);

    assert.deepStrictEqual(
      linesOf(doc),
      expectedLines('resolution-chain', [
        WAREHOUSE_OVERRIDE_URL,
        CATALOG_STAGE_URL,
        CATALOG_CONFIGMAP_URL,
        undefined,
        undefined,
      ])
    );
    assert.deepStrictEqual(requestedUrls, [INDEX_URL]);
  });

  test('B: catalog disabled -- only the override is inserted and nothing is fetched', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('resolution-chain-catalog-off.yaml'));
    await setAdditionalMappings([WAREHOUSE_OVERRIDE]);
    await setAutoInsert(true);
    const { catalog, requestedUrls } = createFixtureFluxCatalog(false);

    await autoInsertSchemas(doc, new Map(), catalog);

    assert.deepStrictEqual(
      linesOf(doc),
      expectedLines('resolution-chain-catalog-off', [
        WAREHOUSE_OVERRIDE_URL,
        undefined,
        undefined,
        undefined,
        undefined,
      ])
    );
    assert.strictEqual(requestedUrls.length, 0);
  });

  test('C: the README additionalMappings entry maps the native kustomize Kustomization; Widget stays untouched', async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri('resolution-chain-kustomize-override.yaml'));
    await setAdditionalMappings([
      { kind: 'Kustomization', apiVersion: 'kustomize.config.k8s.io/v1beta1', url: KUSTOMIZE_OVERRIDE_URL },
    ]);
    await setAutoInsert(true);
    const { catalog, requestedUrls } = createFixtureFluxCatalog();

    await autoInsertSchemas(doc, new Map(), catalog);

    assert.deepStrictEqual(
      linesOf(doc),
      expectedLines('resolution-chain-kustomize-override', [
        'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/warehouse_v1alpha1.json',
        CATALOG_STAGE_URL,
        CATALOG_CONFIGMAP_URL,
        KUSTOMIZE_OVERRIDE_URL,
        undefined,
      ])
    );
    assert.deepStrictEqual(requestedUrls, [INDEX_URL]);
  });
});
