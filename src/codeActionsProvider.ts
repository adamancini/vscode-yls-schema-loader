import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE } from './diagnosticsProvider';
import { INSERT_SCHEMA_COMMAND } from './commandIds';

export class SchemaCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    return context.diagnostics
      .filter((diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE)
      .map((diagnostic) => {
        const action = new vscode.CodeAction('Insert yaml-language-server schema', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
          command: INSERT_SCHEMA_COMMAND,
          title: 'Insert yaml-language-server schema',
          arguments: [document.uri, diagnostic.range.start.line],
        };
        return action;
      });
  }
}
