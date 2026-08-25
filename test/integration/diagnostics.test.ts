import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { staysFalseFor, waitFor } from './testUtils';

suite('diagnostics', () => {
  test('publishes a diagnostic for an uncovered document', async () => {
    const uri = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'uncovered.yaml'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await waitFor(() => vscode.languages.getDiagnostics(uri).some((d) => d.source === 'ylsSchemaLoader'));
    assert.ok(
      vscode.languages.getDiagnostics(uri).some((d) => d.source === 'ylsSchemaLoader'),
      'expected a ylsSchemaLoader diagnostic on the uncovered fixture'
    );
  });

  test('publishes no diagnostic for a document already covered by a schema comment', async () => {
    const uri = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'covered-by-comment.yaml'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await staysFalseFor(() => vscode.languages.getDiagnostics(uri).some((d) => d.source === 'ylsSchemaLoader'));
    assert.strictEqual(vscode.languages.getDiagnostics(uri).filter((d) => d.source === 'ylsSchemaLoader').length, 0);
  });
});
