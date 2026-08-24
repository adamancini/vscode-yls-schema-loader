import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('extension activates and registers the insert-schema-for-current-document command', async () => {
    const ext = vscode.extensions.getExtension('adamancini.yls-schema-loader');
    assert.ok(ext, 'extension not found — check publisher/name in package.json');
    await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('ylsSchemaLoader.insertSchemaForCurrentDocument'),
      'insertSchemaForCurrentDocument command was not registered'
    );
  });
});
