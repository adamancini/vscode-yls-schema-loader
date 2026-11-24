// A user ylsSchemaLoader.additionalMappings entry: one kind/apiVersion pair mapped to a schema URL.
export interface MappingEntry {
  kind: string;
  apiVersion: string;
  url: string;
}

export type Resolution =
  | { source: 'override'; url: string }
  | { source: 'fluxCatalog'; url: string }
  | { source: 'sessionCache'; url: string }
  | { source: 'unresolved' };

// Sources that apply without a prompt (quick-fix) and are eligible for auto-insert:
// every source except 'unresolved'.
export const DIRECT_APPLY_SOURCES: ReadonlySet<Resolution['source']> = new Set<Resolution['source']>([
  'override',
  'fluxCatalog',
  'sessionCache',
]);

export interface ResolverDeps {
  // User ylsSchemaLoader.additionalMappings: always checked first.
  overrideEntries: MappingEntry[];
  // Resolves offline from a cached copy of the Flux schema catalog index (fetching the index
  // at most once per TTL window). Never rejects; undefined means "not in the catalog".
  lookupFluxCatalog: (kind: string, apiVersion: string) => Promise<string | undefined>;
  // In-memory, session-scoped: caches resolutions this extension has already applied
  // (including manually entered URLs) so a second document with the same kind/apiVersion
  // resolves without prompting again. Populated by the caller after each applied resolution.
  sessionCache: Map<string, string>;
}

// Exact kind + apiVersion match against the user's additionalMappings entries.
export function resolveOverride(entries: MappingEntry[], kind: string, apiVersion: string): string | undefined {
  return entries.find((entry) => entry.kind === kind && entry.apiVersion === apiVersion)?.url;
}

export function sessionCacheKey(kind: string, apiVersion: string): string {
  return `${apiVersion}::${kind}`;
}

// The extension ships no schema data: overrides -> Flux catalog -> session cache -> unresolved.
export async function resolveSchema(kind: string, apiVersion: string, deps: ResolverDeps): Promise<Resolution> {
  const overrideUrl = resolveOverride(deps.overrideEntries, kind, apiVersion);
  if (overrideUrl) {
    return { source: 'override', url: overrideUrl };
  }

  const catalogUrl = await deps.lookupFluxCatalog(kind, apiVersion);
  if (catalogUrl) {
    return { source: 'fluxCatalog', url: catalogUrl };
  }

  const cached = deps.sessionCache.get(sessionCacheKey(kind, apiVersion));
  if (cached) {
    return { source: 'sessionCache', url: cached };
  }

  return { source: 'unresolved' };
}
