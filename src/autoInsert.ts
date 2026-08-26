import * as vscode from 'vscode';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { isCovered } from './lib/coverageCheck';
import { resolveSchema, sessionCacheKey, Resolution, ResolverDeps } from './lib/resolver';
import { mergeMappings } from './lib/bundledMapping';
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

// Sources that already apply without a confirmation prompt when triggered manually --
// auto-insert extends that same trust boundary to run without the user even opening the
// quick-fix. A `github` resolution (ambiguous candidates) is deliberately excluded.
const DIRECT_APPLY_SOURCES: ReadonlySet<Resolution['source']> = new Set(['bundled', 'sessionCache', 'crdsCatalog']);

export interface AutoInsertOverrides {
  fetchFn?: ResolverDeps['fetchFn'];
}

export async function autoInsertSchemas(
  document: vscode.TextDocument,
  sessionCache: Map<string, string>,
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
    bundledEntries: mergeMappings(bundledMappingData, getAdditionalMappings()),
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
    const resolution = await resolveSchema(doc.kind, doc.apiVersion, deps);
    if (!DIRECT_APPLY_SOURCES.has(resolution.source) || !('url' in resolution)) {
      continue;
    }
    await applyResolution(document, doc.startLine, resolution.url, insertionMode);
    sessionCache.set(sessionCacheKey(doc.kind, doc.apiVersion), resolution.url);
  }
}
