import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { resolveSchema, sessionCacheKey, ResolverDeps, DIRECT_APPLY_SOURCES } from './lib/resolver';
import { FluxCatalog } from './lib/fluxCatalog';
import { applyResolution } from './applySchema';
import { schemaCommentLine } from './lib/commentInsertion';
import { getInsertionMode, getAdditionalMappings } from './settings';

// Overridable seam for testing: the real prompt is VS Code UI, which a headless integration
// test can't drive. Tests construct the handler with a stub instead of the default
// `activate()` uses.
export interface InsertSchemaCommandOverrides {
  promptManualUrl?: () => Thenable<string | undefined>;
}

export function createInsertSchemaCommandHandler(
  sessionCache: Map<string, string>,
  diagnostics: DiagnosticsProvider,
  fluxCatalog: FluxCatalog,
  overrides: InsertSchemaCommandOverrides = {}
): (uri: vscode.Uri, startLine: number, resolvedUrl?: string, commentAlreadyInserted?: boolean) => Promise<void> {
  const promptManualUrl =
    overrides.promptManualUrl ??
    (() => vscode.window.showInputBox({ prompt: 'Enter the schema URL or file path for this document' }));

  // `resolvedUrl` + `commentAlreadyInserted` come from a quick-fix whose CodeAction.edit
  // already inserted the schema comment (codeActionsProvider.ts). The comment line sits at
  // the document's startLine, so the target is still found there, and nothing is resolved or
  // inserted again; only the rest of the insertion mode runs.
  return async (
    uri: vscode.Uri,
    startLine: number,
    resolvedUrl?: string,
    commentAlreadyInserted?: boolean
  ): Promise<void> => {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    const target = parseKindApiVersions(text).find((d) => d.startLine === startLine);
    if (!target) {
      return;
    }
    const { kind, apiVersion, startLine: targetStartLine } = target;

    const deps: ResolverDeps = {
      overrideEntries: getAdditionalMappings(),
      lookupFluxCatalog: (kind, apiVersion) => fluxCatalog.lookup(kind, apiVersion),
      sessionCache,
    };
    const insertionMode = getInsertionMode();

    async function applyAndTrack(url: string, skipComment = false): Promise<void> {
      const result = await applyResolution(document, targetStartLine, url, insertionMode, { skipComment });
      if (result.yamlSchemasError) {
        vscode.window.showWarningMessage(
          `Inserted schema, but couldn't update yaml.schemas: ${result.yamlSchemasError}`
        );
      }
      sessionCache.set(sessionCacheKey(kind, apiVersion), url);
    }

    if (commentAlreadyInserted && resolvedUrl) {
      // Only skip the comment when it really is there, so a failed edit can't leave the
      // document without one.
      const inPlace = document.lineAt(targetStartLine).text === schemaCommentLine(resolvedUrl);
      await applyAndTrack(resolvedUrl, inPlace);
      diagnostics.refresh(document);
      return;
    }

    const resolution = await resolveSchema(kind, apiVersion, deps);
    if (DIRECT_APPLY_SOURCES.has(resolution.source) && 'url' in resolution) {
      await applyAndTrack(resolution.url);
    } else {
      const manual = await promptManualUrl();
      if (manual) {
        await applyAndTrack(manual);
      }
    }
    diagnostics.refresh(document);
  };
}
