import * as vscode from 'vscode';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { coverageState } from './lib/coverageCheck';
import { insertionModeWritesComment } from './applySchema';
import { getInsertionMode, getYamlSchemas } from './settings';

export const DIAGNOSTIC_SOURCE = 'ylsSchemaLoader';
export const RESTORE_DIAGNOSTIC_CODE = 'restoreDirective';
export const RESTORE_DIAGNOSTIC_MESSAGE = 'Schema is associated via yaml.schemas but the inline directive is missing.';

export interface DiagnosticsProvider {
  collection: vscode.DiagnosticCollection;
  refresh: (document: vscode.TextDocument) => void;
  dispose: () => void;
}

export function createDiagnosticsProvider(): DiagnosticsProvider {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);

  function refresh(document: vscode.TextDocument): void {
    if (document.languageId !== 'yaml') {
      return;
    }
    const text = document.getText();
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const yamlSchemas = getYamlSchemas();
    const writesComment = insertionModeWritesComment(getInsertionMode());
    const diagnostics: vscode.Diagnostic[] = [];

    for (const doc of parseKindApiVersions(text)) {
      const coverage = coverageState(text, doc.startLine, relativePath, yamlSchemas, writesComment);
      if (coverage.state === 'covered') {
        continue;
      }
      const line = document.lineAt(Math.min(doc.startLine, document.lineCount - 1));
      const restorable = coverage.state === 'restorable';
      const diagnostic = new vscode.Diagnostic(
        line.range,
        restorable ? RESTORE_DIAGNOSTIC_MESSAGE : `No yaml-language-server schema associated with this ${doc.kind}.`,
        vscode.DiagnosticSeverity.Information
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      if (restorable) {
        diagnostic.code = RESTORE_DIAGNOSTIC_CODE;
      }
      diagnostics.push(diagnostic);
    }
    collection.set(document.uri, diagnostics);
  }

  return { collection, refresh, dispose: () => collection.dispose() };
}
