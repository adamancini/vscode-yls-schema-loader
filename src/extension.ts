import * as vscode from 'vscode';
import { createDiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { debouncePerKey } from './lib/debounce';
import { createInsertSchemaCommandHandler } from './insertSchemaCommand';
import { SchemaCodeActionProvider } from './codeActionsProvider';
import { INSERT_SCHEMA_COMMAND, INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND } from './commandIds';

// Re-checking every open sub-document on every keystroke is wasted work on a large file.
// Keyed per-document so editing one file doesn't reset the timer for another.
const DIAGNOSTICS_DEBOUNCE_MS = 300;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = createDiagnosticsProvider();
  const sessionCache = new Map<string, string>();
  const debouncedRefresh = debouncePerKey(
    (doc: vscode.TextDocument) => diagnostics.refresh(doc),
    DIAGNOSTICS_DEBOUNCE_MS,
    (doc: vscode.TextDocument) => doc.uri.toString()
  );

  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => debouncedRefresh(e.document)));
  vscode.workspace.textDocuments.forEach((doc) => diagnostics.refresh(doc));

  context.subscriptions.push(
    // No `scheme` restriction: Kubernetes manifests are commonly edited over
    // vscode-remote (SSH/containers) or as unsaved (untitled) documents, and this
    // provider doesn't touch disk directly, so it should work in either case.
    vscode.languages.registerCodeActionsProvider({ language: 'yaml' }, new SchemaCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      INSERT_SCHEMA_COMMAND,
      createInsertSchemaCommandHandler(sessionCache, diagnostics)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a YAML document to insert a schema.');
        return;
      }
      const docs = parseKindApiVersions(editor.document.getText());
      const cursorLine = editor.selection.active.line;
      const target = [...docs].reverse().find((d) => d.startLine <= cursorLine) ?? docs[0];
      if (!target) {
        vscode.window.showWarningMessage('No recognizable kind/apiVersion found in this document.');
        return;
      }
      await vscode.commands.executeCommand(INSERT_SCHEMA_COMMAND, editor.document.uri, target.startLine);
    })
  );
}

export function deactivate(): void {}
