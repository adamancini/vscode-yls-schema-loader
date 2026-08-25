import * as vscode from 'vscode';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { isCovered } from './lib/coverageCheck';
import { getYamlSchemas } from './settings';

export const DIAGNOSTIC_SOURCE = 'ylsSchemaLoader';

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
    const diagnostics: vscode.Diagnostic[] = [];

    for (const doc of parseKindApiVersions(text)) {
      if (isCovered(text, doc.startLine, relativePath, yamlSchemas)) {
        continue;
      }
      const line = document.lineAt(Math.min(doc.startLine, document.lineCount - 1));
      const diagnostic = new vscode.Diagnostic(
        line.range,
        `No yaml-language-server schema associated with this ${doc.kind}.`,
        vscode.DiagnosticSeverity.Information
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostics.push(diagnostic);
    }
    collection.set(document.uri, diagnostics);
  }

  return { collection, refresh, dispose: () => collection.dispose() };
}
