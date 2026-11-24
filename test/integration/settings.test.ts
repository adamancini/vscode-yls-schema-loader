import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  getInsertionMode,
  getEnableWebDiscovery,
  getAutoInsert,
  getAdditionalMappings,
  getGithubRepoHints,
  getYamlSchemas,
  getEnableFluxCatalog,
} from '../../src/settings';
import { getGithubAuthToken } from '../../src/githubAuth';

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
    assert.strictEqual(getEnableWebDiscovery(), true);
    assert.strictEqual(getAutoInsert(), false);
    assert.deepStrictEqual(getAdditionalMappings(), []);
    assert.deepStrictEqual(getGithubRepoHints(), []);
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

suite('getGithubAuthToken', () => {
  test('resolves without throwing when no GitHub session is available', async () => {
    const token = await getGithubAuthToken();
    assert.ok(token === undefined || typeof token === 'string');
  });
});
