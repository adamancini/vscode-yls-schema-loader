import * as vscode from 'vscode';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { isCovered } from './lib/coverageCheck';
import { resolveSchema, sessionCacheKey, ResolverDeps, DIRECT_APPLY_SOURCES } from './lib/resolver';
import { FluxCatalog } from './lib/fluxCatalog';
import bundledMappingData from './lib/bundledMappingData.json';
import { applyResolution } from './applySchema';
import { getGithubAuthToken } from './githubAuth';
import {
  getAutoInsert,
  getInsertionMode,
  getEnableWebDiscovery,
  getAdditionalMappings,
  getGithubRepoHints,
  getYamlSchemas,
} from './settings';

export interface AutoInsertOverrides {
  fetchFn?: ResolverDeps['fetchFn'];
}

export async function autoInsertSchemas(
  document: vscode.TextDocument,
  sessionCache: Map<string, string>,
  fluxCatalog: FluxCatalog,
  overrides: AutoInsertOverrides = {}
): Promise<void> {
  if (document.languageId !== 'yaml' || !getAutoInsert()) {
    return;
  }

  const text = document.getText();
  const relativePath = vscode.workspace.asRelativePath(document.uri, false);
  const yamlSchemas = getYamlSchemas();
  const insertionMode = getInsertionMode();
  const deps: ResolverDeps = {
    overrideEntries: getAdditionalMappings(),
    lookupFluxCatalog: (kind, apiVersion) => fluxCatalog.lookup(kind, apiVersion),
    bundledEntries: bundledMappingData,
    sessionCache,
    enableWebDiscovery: getEnableWebDiscovery(),
    githubHints: getGithubRepoHints(),
    fetchFn: overrides.fetchFn ?? (fetch as ResolverDeps['fetchFn']),
    getAuthToken: getGithubAuthToken,
  };

  // Bottom-to-top: inserting a comment above one document must not shift the line
  // numbers of documents still waiting to be resolved later in this same pass.
  const docs = [...parseKindApiVersions(text)].reverse();
  for (const doc of docs) {
    if (isCovered(text, doc.startLine, relativePath, yamlSchemas)) {
      continue;
    }
    // Auto-insert extends the direct-apply trust boundary (resolver.ts) to run without the
    // user even opening the quick-fix; a `github` resolution is never applied on its own.
    const resolution = await resolveSchema(doc.kind, doc.apiVersion, deps);
    if (!DIRECT_APPLY_SOURCES.has(resolution.source) || !('url' in resolution)) {
      continue;
    }
    await applyResolution(document, doc.startLine, resolution.url, insertionMode);
    sessionCache.set(sessionCacheKey(doc.kind, doc.apiVersion), resolution.url);
  }
}
