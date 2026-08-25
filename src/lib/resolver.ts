import { MappingEntry, resolveBundled } from './bundledMapping';
import { discoverGithubSchema, FetchFn, GithubCandidate } from './githubDiscovery';
import { RepoHint } from './repoHeuristic';

export type Resolution =
  | { source: 'bundled'; url: string }
  | { source: 'sessionCache'; url: string }
  | { source: 'github'; candidates: GithubCandidate[] }
  | { source: 'unresolved' }
  | { source: 'error'; message: string };

export interface ResolverDeps {
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
  } catch (err) {
    // A rejected fetchFn call (network down, DNS failure) -- not an HTTP error response,
    // which resolves normally via response.ok/response.status and is handled above.
    return {
      source: 'error',
      message: `GitHub schema search failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { source: 'unresolved' };
}
