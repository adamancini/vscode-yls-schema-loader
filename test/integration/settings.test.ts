import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getInsertionMode,
  getAutoInsert,
  getAdditionalMappings,
  getYamlSchemas,
  getEnableFluxCatalog,
} from '../../src/settings';

suite('settings', () => {
  // Other test files write to these same workspace-scoped settings (e.g.
  // applySchema.test.ts's insertionMode/yaml.schemas tests) and reset them in their own
  // teardown -- but mocha's file load order isn't guaranteed alphabetical, so this test
  // can't rely on running before or after any of them. Reset explicitly instead of
  // depending on execution order.
  setup(async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('insertionMode', undefined, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('autoInsert', undefined, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace.getConfiguration('yaml').update('schemas', undefined, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('enableFluxCatalog', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('returns documented defaults when nothing is configured', () => {
    assert.strictEqual(getInsertionMode(), 'comment');
    assert.strictEqual(getAutoInsert(), false);
    assert.deepStrictEqual(getAdditionalMappings(), []);
    assert.deepStrictEqual(getYamlSchemas(), {});
  });

  test('enableFluxCatalog defaults to true', () => {
    assert.strictEqual(getEnableFluxCatalog(), true);
  });

  test('enableFluxCatalog reflects a workspace override', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('enableFluxCatalog', false, vscode.ConfigurationTarget.Workspace);
    try {
      assert.strictEqual(getEnableFluxCatalog(), false);
    } finally {
      await vscode.workspace
        .getConfiguration('ylsSchemaLoader')
        .update('enableFluxCatalog', undefined, vscode.ConfigurationTarget.Workspace);
    }
  });
});

suite('contributed configuration', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8')) as {
    contributes: { configuration: { properties: Record<string, { description?: string }> } };
  };
  const properties = pkg.contributes.configuration.properties;

  test('declares exactly the remaining ylsSchemaLoader settings', () => {
    assert.deepStrictEqual(Object.keys(properties).sort(), [
      'ylsSchemaLoader.additionalMappings',
      'ylsSchemaLoader.autoInsert',
      'ylsSchemaLoader.enableFluxCatalog',
      'ylsSchemaLoader.insertionMode',
    ]);
  });

  test('the autoInsert description names the remaining sources and no removed one', () => {
    assert.strictEqual(
      properties['ylsSchemaLoader.autoInsert'].description,
      'When a document opens and its schema resolves, insert the schema immediately, with no confirmation prompt. Applies to every resolved source (your additionalMappings, the Flux schema catalog, the session cache). Off by default.'
    );
  });
});
