import * as vscode from 'vscode';
import { createDiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { debouncePerKey } from './lib/debounce';
import { createInsertSchemaCommandHandler } from './insertSchemaCommand';
import { autoInsertSchemas } from './autoInsert';
import { SchemaCodeActionProvider } from './codeActionsProvider';
import { INSERT_SCHEMA_COMMAND, INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND } from './commandIds';
import { CachedCatalog, createFluxCatalog } from './lib/fluxCatalog';
import { FetchFn } from './lib/githubDiscovery';
import { getEnableFluxCatalog } from './settings';

// Re-checking every open sub-document on every keystroke is wasted work on a large file.
// Keyed per-document so editing one file doesn't reset the timer for another.
const DIAGNOSTICS_DEBOUNCE_MS = 300;

// globalState key holding the compact projection of the Flux schema catalog index and its
// fetch time, so a VS Code restart inside the TTL window needs no network request.
const FLUX_CATALOG_STATE_KEY = 'fluxCatalog.index';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = createDiagnosticsProvider();
  const sessionCache = new Map<string, string>();
  // One catalog for the whole session, shared by the quick-fix and auto-insert so they share
  // one in-memory index and one in-flight fetch. Loading is lazy (first lookup); nothing is
  // fetched at activation.
  const fluxCatalog = createFluxCatalog({
    fetchFn: fetch as FetchFn,
    isEnabled: getEnableFluxCatalog,
    store: {
      get: () => context.globalState.get<CachedCatalog>(FLUX_CATALOG_STATE_KEY),
      set: (value: CachedCatalog) => context.globalState.update(FLUX_CATALOG_STATE_KEY, value),
    },
  });

  // Auto-insert (if enabled) runs first so any document it resolves never flashes a
  // diagnostic that immediately disappears -- the refresh right after reflects the
  // post-edit, already-covered state. Only wired to document *open* (and the initial
  // activation scan), not to every edit: auto-insert's own applyEdit already re-triggers
  // onDidChangeTextDocument, and its resolution can reach the network (the Flux schema
  // catalog index fetch, GitHub discovery, CRDs-catalog), so running it on every debounced
  // keystroke would re-issue those requests for as long as an unresolved document stays
  // open. Diagnostics still refresh on every edit -- that path is local-only and never
  // touches the catalog or the network.
  async function handleDocumentOpen(doc: vscode.TextDocument): Promise<void> {
    await autoInsertSchemas(doc, sessionCache, fluxCatalog);
    diagnostics.refresh(doc);
  }

  const debouncedDiagnosticsRefresh = debouncePerKey(
    (doc: vscode.TextDocument) => diagnostics.refresh(doc),
    DIAGNOSTICS_DEBOUNCE_MS,
    (doc: vscode.TextDocument) => doc.uri.toString()
  );

  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => void handleDocumentOpen(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => debouncedDiagnosticsRefresh(e.document)));
  vscode.workspace.textDocuments.forEach((doc) => void handleDocumentOpen(doc));

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
      createInsertSchemaCommandHandler(sessionCache, diagnostics, fluxCatalog)
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
