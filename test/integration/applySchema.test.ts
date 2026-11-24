import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  clearAdditionalMappings,
  disableActivatedFluxCatalog,
  restoreFluxCatalogSetting,
  setStageOverride,
  waitFor,
} from './testUtils';

// The activated extension's catalog is switched off for these tests, so the fixture's Stage
// resolves only through this workspace override.
const OVERRIDE_STAGE_SCHEMA_URL = 'https://override.example.com/stage.json';

suite('insertSchema command', () => {
  setup(async () => {
    await disableActivatedFluxCatalog();
    await setStageOverride(OVERRIDE_STAGE_SCHEMA_URL);
  });
  teardown(async () => {
    await restoreFluxCatalogSetting();
    await clearAdditionalMappings();
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('insertionMode', undefined, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace.getConfiguration('yaml').update('schemas', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('inserts a schema comment for a workspace additionalMappings match (default insertionMode)', async () => {
    const uri = vscode.Uri.file(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'apply-schema-comment-mode.yaml')
    );
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.commands.executeCommand('ylsSchemaLoader.insertSchema', uri, 0);
    const expectedLine = `# yaml-language-server: $schema=${OVERRIDE_STAGE_SCHEMA_URL}`;
    await waitFor(() => doc.lineAt(0).text === expectedLine);
    assert.strictEqual(doc.lineAt(0).text, expectedLine);
  });

  test('writes a yaml.schemas entry when insertionMode is yamlSchemas', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('insertionMode', 'yamlSchemas', vscode.ConfigurationTarget.Workspace);
    const uri = vscode.Uri.file(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'apply-schema-yamlschemas-mode.yaml')
    );
    await vscode.workspace.openTextDocument(uri);
    await vscode.commands.executeCommand('ylsSchemaLoader.insertSchema', uri, 0);
    const getSchemas = () => vscode.workspace.getConfiguration('yaml').get<Record<string, string[]>>('schemas', {});
    await waitFor(() =>
      Boolean(getSchemas()[OVERRIDE_STAGE_SCHEMA_URL]?.includes('test/fixtures/apply-schema-yamlschemas-mode.yaml'))
    );
    assert.ok(getSchemas()[OVERRIDE_STAGE_SCHEMA_URL]?.includes('test/fixtures/apply-schema-yamlschemas-mode.yaml'));
  });
});
