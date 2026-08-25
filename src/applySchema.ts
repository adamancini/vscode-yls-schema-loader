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
    // `yaml.schemas` is normally owned/registered by the YAML extension (redhat.vscode-yaml).
    // We also declare it in our own package.json so `insertionMode: "yamlSchemas"` still works
    // for users who don't have that extension installed -- VS Code refuses .update() on an
    // unregistered configuration key, so without our declaration this write would throw for
    // those users.
    await vscode.workspace.getConfiguration('yaml').update('schemas', updated, vscode.ConfigurationTarget.Workspace);
  }
}
