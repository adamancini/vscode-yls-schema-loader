import { MappingEntry, resolveBundled } from './bundledMapping';

export type Resolution =
  | { source: 'override'; url: string }
  | { source: 'fluxCatalog'; url: string }
  | { source: 'bundled'; url: string }
  | { source: 'sessionCache'; url: string }
  | { source: 'unresolved' };

// Sources that apply without a prompt (quick-fix) and are eligible for auto-insert:
// every source except 'unresolved'.
export const DIRECT_APPLY_SOURCES: ReadonlySet<Resolution['source']> = new Set<Resolution['source']>([
  'override',
  'fluxCatalog',
  'bundled',
  'sessionCache',
]);

export interface ResolverDeps {
  // User ylsSchemaLoader.additionalMappings: always checked first.
  overrideEntries: MappingEntry[];
  // Resolves offline from a cached copy of the Flux schema catalog index (fetching the index
  // at most once per TTL window). Never rejects; undefined means "not in the catalog".
  lookupFluxCatalog: (kind: string, apiVersion: string) => Promise<string | undefined>;
  // The bundled mapping data only (overrides are a separate, earlier stage).
  bundledEntries: MappingEntry[];
  // In-memory, session-scoped: caches resolutions this extension has already applied
  // (including manually entered URLs) so a second document with the same kind/apiVersion
  // resolves without prompting again. Populated by the caller after each applied resolution.
  sessionCache: Map<string, string>;
}

export function sessionCacheKey(kind: string, apiVersion: string): string {
  return `${apiVersion}::${kind}`;
}

export async function resolveSchema(kind: string, apiVersion: string, deps: ResolverDeps): Promise<Resolution> {
  const overrideUrl = resolveBundled(deps.overrideEntries, kind, apiVersion);
  if (overrideUrl) {
    return { source: 'override', url: overrideUrl };
  }

  const catalogUrl = await deps.lookupFluxCatalog(kind, apiVersion);
  if (catalogUrl) {
    return { source: 'fluxCatalog', url: catalogUrl };
  }

  const bundledUrl = resolveBundled(deps.bundledEntries, kind, apiVersion);
  if (bundledUrl) {
    return { source: 'bundled', url: bundledUrl };
  }

  const cached = deps.sessionCache.get(sessionCacheKey(kind, apiVersion));
  if (cached) {
    return { source: 'sessionCache', url: cached };
  }

  return { source: 'unresolved' };
}
