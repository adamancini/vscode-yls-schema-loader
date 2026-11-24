import * as vscode from 'vscode';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { coverageState } from './lib/coverageCheck';
import { resolveSchema, sessionCacheKey, ResolverDeps, DIRECT_APPLY_SOURCES } from './lib/resolver';
import { FluxCatalog } from './lib/fluxCatalog';
import { applyResolution, insertionModeWritesComment } from './applySchema';
import { getAutoInsert, getInsertionMode, getAdditionalMappings, getYamlSchemas } from './settings';

export async function autoInsertSchemas(
  document: vscode.TextDocument,
  sessionCache: Map<string, string>,
  fluxCatalog: FluxCatalog
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
    sessionCache,
  };

  // Bottom-to-top: inserting a comment above one document must not shift the line
  // numbers of documents still waiting to be resolved later in this same pass.
  const docs = [...parseKindApiVersions(text)].reverse();
  for (const doc of docs) {
    const coverage = coverageState(
      text,
      doc.startLine,
      relativePath,
      yamlSchemas,
      insertionModeWritesComment(insertionMode)
    );
    if (coverage.state === 'covered') {
      continue;
    }
    if (coverage.state === 'restorable') {
      // The settings URL is user-configured, so it goes back as a comment only: the literal
      // 'comment' keeps yaml.schemas untouched even in 'both' mode. No catalog lookup and no
      // session-cache write -- the URL belongs to this file, not to the kind/apiVersion.
      await applyResolution(document, doc.startLine, coverage.url, 'comment');
      continue;
    }
    // Auto-insert applies direct-apply sources (resolver.ts) without the user even opening
    // the quick-fix; an 'unresolved' document is left untouched, with no prompt.
    const resolution = await resolveSchema(doc.kind, doc.apiVersion, deps);
    if (!DIRECT_APPLY_SOURCES.has(resolution.source) || !('url' in resolution)) {
      continue;
    }
    await applyResolution(document, doc.startLine, resolution.url, insertionMode);
    sessionCache.set(sessionCacheKey(doc.kind, doc.apiVersion), resolution.url);
  }
}
