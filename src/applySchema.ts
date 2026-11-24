import * as vscode from 'vscode';
import { schemaCommentLine } from './lib/commentInsertion';
import { addSchemaMapping } from './lib/yamlSchemasEntry';
import { InsertionMode, getYamlSchemas } from './settings';

export interface ApplyResult {
  commentInserted: boolean;
  yamlSchemasUpdated: boolean;
  // Set when insertionMode called for a yaml.schemas write but it couldn't complete --
  // e.g. no workspace folder is open (ConfigurationTarget.Workspace has nothing to write
  // to), or the YAML extension isn't installed to register the config key. commentInserted
  // may still be true in "both" mode even when this is set.
  yamlSchemasError?: string;
}

// The edit that inserts the schema comment line above the document starting at
// `startLine`. Shared by applyResolution and the quick-fix code action, which attaches it as
// CodeAction.edit, so both paths insert byte-identical text.
export function buildSchemaCommentEdit(uri: vscode.Uri, startLine: number, url: string): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(startLine, 0), `${schemaCommentLine(url)}\n`);
  return edit;
}

export function insertionModeWritesComment(insertionMode: InsertionMode): boolean {
  return insertionMode === 'comment' || insertionMode === 'both';
}

export interface ApplyOptions {
  // The schema comment is already in the document (inserted by the quick-fix's
  // CodeAction.edit), so only the yaml.schemas half of the insertion mode remains.
  skipComment?: boolean;
}

export async function applyResolution(
  document: vscode.TextDocument,
  startLine: number,
  url: string,
  insertionMode: InsertionMode,
  options: ApplyOptions = {}
): Promise<ApplyResult> {
  const result: ApplyResult = { commentInserted: false, yamlSchemasUpdated: false };

  if (insertionModeWritesComment(insertionMode) && !options.skipComment) {
    result.commentInserted = await vscode.workspace.applyEdit(buildSchemaCommentEdit(document.uri, startLine, url));
  }

  if (insertionMode === 'yamlSchemas' || insertionMode === 'both') {
    if (!vscode.workspace.workspaceFolders?.length) {
      result.yamlSchemasError =
        'No workspace folder is open, so the yaml.schemas setting (a workspace-scoped setting) cannot be updated.';
    } else {
      try {
        const relativePath = vscode.workspace.asRelativePath(document.uri, false);
        const updated = addSchemaMapping(getYamlSchemas(), url, relativePath);
        // `yaml.schemas` is owned/registered by the YAML extension (redhat.vscode-yaml), which
        // must be installed for `insertionMode: "yamlSchemas"` (or "both") to work -- VS Code
        // refuses .update() on a configuration key no installed extension has registered.
        await vscode.workspace
          .getConfiguration('yaml')
          .update('schemas', updated, vscode.ConfigurationTarget.Workspace);
        result.yamlSchemasUpdated = true;
      } catch (err) {
        result.yamlSchemasError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return result;
}
