import * as vscode from 'vscode';
import { createDiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { resolveSchema, sessionCacheKey, ResolverDeps } from './lib/resolver';
import { mergeMappings } from './lib/bundledMapping';
import bundledMappingData from './lib/bundledMappingData.json';
import { applyResolution } from './applySchema';
import { confirmGithubCandidate } from './confirmCandidate';
import { getGithubAuthToken } from './githubAuth';
import { SchemaCodeActionProvider } from './codeActionsProvider';
import { INSERT_SCHEMA_COMMAND, INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND } from './commandIds';
import { getInsertionMode, getEnableWebDiscovery, getAdditionalMappings, getGithubRepoHints } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = createDiagnosticsProvider();
  const sessionCache = new Map<string, string>();

  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => diagnostics.refresh(e.document)));
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
    vscode.commands.registerCommand(INSERT_SCHEMA_COMMAND, async (uri: vscode.Uri, startLine: number) => {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      const target = parseKindApiVersions(text).find((d) => d.startLine === startLine);
      if (!target) {
        return;
      }
      const deps: ResolverDeps = {
        bundledEntries: mergeMappings(bundledMappingData, getAdditionalMappings()),
        sessionCache,
        enableWebDiscovery: getEnableWebDiscovery(),
        githubHints: getGithubRepoHints(),
        fetchFn: fetch as ResolverDeps['fetchFn'],
        authToken: await getGithubAuthToken(),
      };
      const resolution = await resolveSchema(target.kind, target.apiVersion, deps);
      const insertionMode = getInsertionMode();

      if (resolution.source === 'bundled' || resolution.source === 'sessionCache') {
        await applyResolution(document, target.startLine, resolution.url, insertionMode);
        sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), resolution.url);
      } else if (resolution.source === 'github') {
        const picked = await confirmGithubCandidate(resolution.candidates);
        if (picked) {
          await applyResolution(document, target.startLine, picked.url, insertionMode);
          sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), picked.url);
        }
      } else {
        const manual = await vscode.window.showInputBox({
          prompt: 'Enter the schema URL or file path for this document',
        });
        if (manual) {
          await applyResolution(document, target.startLine, manual, insertionMode);
          sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), manual);
        }
      }
      diagnostics.refresh(document);
    })
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
