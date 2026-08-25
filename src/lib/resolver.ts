import { MappingEntry, resolveBundled } from './bundledMapping';
import { discoverGithubSchema, FetchFn, GithubCandidate } from './githubDiscovery';
import { RepoHint } from './repoHeuristic';

export type Resolution =
  | { source: 'bundled'; url: string }
  | { source: 'sessionCache'; url: string }
  | { source: 'github'; candidates: GithubCandidate[] }
  | { source: 'unresolved' };

export interface ResolverDeps {
  bundledEntries: MappingEntry[];
  // In-memory, session-scoped: caches resolutions this extension has already made
  // (bundled or accepted GitHub results) so a second file with the same kind/apiVersion
  // doesn't re-query GitHub. Populated by the caller after each successful resolution.
  sessionCache: Map<string, string>;
  enableWebDiscovery: boolean;
  githubHints: RepoHint[];
  fetchFn: FetchFn;
  authToken: string | undefined;
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
    const candidates = await discoverGithubSchema(kind, apiVersion, deps.githubHints, deps.fetchFn, deps.authToken);
    if (candidates.length > 0) {
      return { source: 'github', candidates };
    }
  } catch {
    // GitHub API failure (network error, rate limit, auth failure): treat as no candidate found
    // This ensures the resolver pipeline never throws, allowing callers to handle gracefully
  }
  return { source: 'unresolved' };
}
