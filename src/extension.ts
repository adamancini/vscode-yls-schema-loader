import * as vscode from 'vscode';
import { createDiagnosticsProvider } from './diagnosticsProvider';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = createDiagnosticsProvider();
  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => diagnostics.refresh(e.document)));
  vscode.workspace.textDocuments.forEach((doc) => diagnostics.refresh(doc));

  context.subscriptions.push(
    vscode.commands.registerCommand('ylsSchemaLoader.insertSchemaForCurrentDocument', () => {
      vscode.window.showInformationMessage('YLS Schema Loader activated.');
    })
  );
}

export function deactivate(): void {}
