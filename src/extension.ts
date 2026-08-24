import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ylsSchemaLoader.insertSchemaForCurrentDocument', () => {
      vscode.window.showInformationMessage('YLS Schema Loader activated.');
    })
  );
}

export function deactivate(): void {}
