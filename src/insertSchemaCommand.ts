import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { resolveSchema, sessionCacheKey, ResolverDeps, DIRECT_APPLY_SOURCES } from './lib/resolver';
import { FluxCatalog } from './lib/fluxCatalog';
import bundledMappingData from './lib/bundledMappingData.json';
import { applyResolution } from './applySchema';
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
): (uri: vscode.Uri, startLine: number) => Promise<void> {
  const promptManualUrl =
    overrides.promptManualUrl ??
    (() => vscode.window.showInputBox({ prompt: 'Enter the schema URL or file path for this document' }));

  return async (uri: vscode.Uri, startLine: number): Promise<void> => {
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
      bundledEntries: bundledMappingData,
      sessionCache,
    };
    const insertionMode = getInsertionMode();

    const resolution = await resolveSchema(kind, apiVersion, deps);

    async function applyAndTrack(url: string): Promise<void> {
      const result = await applyResolution(document, targetStartLine, url, insertionMode);
      if (result.yamlSchemasError) {
        vscode.window.showWarningMessage(
          `Inserted schema, but couldn't update yaml.schemas: ${result.yamlSchemasError}`
        );
      }
      sessionCache.set(sessionCacheKey(kind, apiVersion), url);
    }

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
