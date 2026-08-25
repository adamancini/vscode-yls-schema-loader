import * as vscode from 'vscode';
import { schemaCommentLine } from './lib/commentInsertion';
import { addSchemaMapping } from './lib/yamlSchemasEntry';
import { InsertionMode, getYamlSchemas } from './settings';

export async function applyResolution(
  document: vscode.TextDocument,
  startLine: number,
  url: string,
  insertionMode: InsertionMode
): Promise<void> {
  if (insertionMode === 'comment' || insertionMode === 'both') {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(startLine, 0), `${schemaCommentLine(url)}\n`);
    await vscode.workspace.applyEdit(edit);
  }
  if (insertionMode === 'yamlSchemas' || insertionMode === 'both') {
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const updated = addSchemaMapping(getYamlSchemas(), url, relativePath);
    await vscode.workspace.getConfiguration('yaml').update('schemas', updated, vscode.ConfigurationTarget.Workspace);
  }
}
