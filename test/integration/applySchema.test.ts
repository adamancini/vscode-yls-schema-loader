import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const KARGO_STAGE_SCHEMA_URL =
  'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';

suite('insertSchema command', () => {
  teardown(async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('insertionMode', undefined, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace.getConfiguration('yaml').update('schemas', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('inserts a schema comment for a bundled-mapping match (default insertionMode)', async () => {
    const uri = vscode.Uri.file(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'apply-schema-comment-mode.yaml')
    );
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.commands.executeCommand('ylsSchemaLoader.insertSchema', uri, 0);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(doc.lineAt(0).text, `# yaml-language-server: $schema=${KARGO_STAGE_SCHEMA_URL}`);
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
    await new Promise((resolve) => setTimeout(resolve, 200));
    const schemas = vscode.workspace.getConfiguration('yaml').get<Record<string, string[]>>('schemas', {});
    assert.ok(schemas[KARGO_STAGE_SCHEMA_URL]?.includes('test/fixtures/apply-schema-yamlschemas-mode.yaml'));
  });
});
