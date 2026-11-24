import { MappingEntry, resolveBundled } from './bundledMapping';
import { discoverGithubSchema, FetchFn, GithubCandidate } from './githubDiscovery';
import { discoverCrdsCatalogSchema } from './crdsCatalogDiscovery';
import { RepoHint } from './repoHeuristic';

export type Resolution =
  | { source: 'override'; url: string }
  | { source: 'fluxCatalog'; url: string }
  | { source: 'bundled'; url: string }
  | { source: 'sessionCache'; url: string }
  | { source: 'github'; candidates: GithubCandidate[] }
  | { source: 'crdsCatalog'; url: string }
  | { source: 'unresolved' }
  | { source: 'error'; message: string };

// Sources that apply without a confirmation prompt (quick-fix) and are eligible for
// auto-insert. A `github` resolution (ambiguous, guessed candidates) is deliberately excluded.
export const DIRECT_APPLY_SOURCES: ReadonlySet<Resolution['source']> = new Set<Resolution['source']>([
  'override',
  'fluxCatalog',
  'bundled',
  'sessionCache',
  'crdsCatalog',
]);

export interface ResolverDeps {
  // User ylsSchemaLoader.additionalMappings: always checked first.
  overrideEntries: MappingEntry[];
  // Resolves offline from a cached copy of the Flux schema catalog index (fetching the index
  // at most once per TTL window). Never rejects; undefined means "not in the catalog".
  lookupFluxCatalog: (kind: string, apiVersion: string) => Promise<string | undefined>;
  // The bundled mapping data only (overrides are a separate, earlier stage).
  bundledEntries: MappingEntry[];
  // In-memory, session-scoped: caches resolutions this extension has already made
  // (bundled or accepted GitHub results) so a second file with the same kind/apiVersion
  // doesn't re-query GitHub. Populated by the caller after each successful resolution.
  sessionCache: Map<string, string>;
  enableWebDiscovery: boolean;
  githubHints: RepoHint[];
  fetchFn: FetchFn;
  // Lazy: only called when discovery is actually about to run (not for bundled/session-cache
  // hits, and not when web discovery is disabled), so a bundled-mapping match never probes
  // for a GitHub session at all.
  getAuthToken: () => Promise<string | undefined>;
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

  if (!deps.enableWebDiscovery) {
    return { source: 'unresolved' };
  }

  try {
    const authToken = await deps.getAuthToken();
    const { candidates, rateLimited } = await discoverGithubSchema(
      kind,
      apiVersion,
      deps.githubHints,
      deps.fetchFn,
      authToken
    );
    if (candidates.length > 0) {
      return { source: 'github', candidates };
    }
    if (rateLimited) {
      return {
        source: 'error',
        message:
          'GitHub API rate limit reached while searching for a schema. Sign in to GitHub for a higher limit, or try again later.',
      };
    }

    // Last resort: no source-code repo could be found (or it had no schema at the
    // conventional paths). Check the community-maintained CRDs-catalog directly --
    // a single deterministic URL, verified to exist before being returned, so it applies
    // the same way a bundled/session-cache hit does rather than prompting for confirmation.
    const crdsCatalogCandidate = await discoverCrdsCatalogSchema(kind, apiVersion, deps.fetchFn);
    if (crdsCatalogCandidate) {
      return { source: 'crdsCatalog', url: crdsCatalogCandidate.url };
    }
  } catch (err) {
    // A rejected fetchFn call (network down, DNS failure) -- not an HTTP error response,
    // which resolves normally via response.ok/response.status and is handled above. Could
    // originate from either the GitHub discovery call or the CRDs-catalog lookup that
    // follows it, so the message doesn't name a specific source.
    return {
      source: 'error',
      message: `Schema discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { source: 'unresolved' };
}
