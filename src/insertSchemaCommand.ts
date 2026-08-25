import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { resolveSchema, sessionCacheKey, ResolverDeps } from './lib/resolver';
import { GithubCandidate } from './lib/githubDiscovery';
import { mergeMappings } from './lib/bundledMapping';
import bundledMappingData from './lib/bundledMappingData.json';
import { applyResolution } from './applySchema';
import { confirmGithubCandidate } from './confirmCandidate';
import { getGithubAuthToken } from './githubAuth';
import { getInsertionMode, getEnableWebDiscovery, getAdditionalMappings, getGithubRepoHints } from './settings';

// Overridable seams for testing: the real implementations all touch the network or real
// VS Code UI, neither of which a headless integration test can drive. Tests construct the
// handler with stubs for these instead of the defaults `activate()` uses.
export interface InsertSchemaCommandOverrides {
  fetchFn?: ResolverDeps['fetchFn'];
  confirmCandidate?: (candidates: GithubCandidate[]) => Promise<GithubCandidate | undefined>;
  promptManualUrl?: () => Thenable<string | undefined>;
}

export function createInsertSchemaCommandHandler(
  sessionCache: Map<string, string>,
  diagnostics: DiagnosticsProvider,
  overrides: InsertSchemaCommandOverrides = {}
): (uri: vscode.Uri, startLine: number) => Promise<void> {
  const fetchFn = overrides.fetchFn ?? (fetch as ResolverDeps['fetchFn']);
  const confirmCandidate = overrides.confirmCandidate ?? confirmGithubCandidate;
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
      bundledEntries: mergeMappings(bundledMappingData, getAdditionalMappings()),
      sessionCache,
      enableWebDiscovery: getEnableWebDiscovery(),
      githubHints: getGithubRepoHints(),
      fetchFn,
      getAuthToken: getGithubAuthToken,
    };
    const insertionMode = getInsertionMode();

    let resolution = await resolveSchema(kind, apiVersion, deps);
    while (resolution.source === 'error') {
      const choice = await vscode.window.showWarningMessage(resolution.message, 'Retry');
      if (choice !== 'Retry') {
        return;
      }
      resolution = await resolveSchema(kind, apiVersion, deps);
    }

    async function applyAndTrack(url: string): Promise<void> {
      const result = await applyResolution(document, targetStartLine, url, insertionMode);
      if (result.yamlSchemasError) {
        vscode.window.showWarningMessage(
          `Inserted schema, but couldn't update yaml.schemas: ${result.yamlSchemasError}`
        );
      }
      sessionCache.set(sessionCacheKey(kind, apiVersion), url);
    }

    if (resolution.source === 'bundled' || resolution.source === 'sessionCache') {
      await applyAndTrack(resolution.url);
    } else if (resolution.source === 'github') {
      const picked = await confirmCandidate(resolution.candidates);
      if (picked) {
        await applyAndTrack(picked.url);
      }
    } else {
      const manual = await promptManualUrl();
      if (manual) {
        await applyAndTrack(manual);
      }
    }
    diagnostics.refresh(document);
  };
}
