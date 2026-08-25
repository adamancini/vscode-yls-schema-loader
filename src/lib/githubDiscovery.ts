import { deriveRepoFromApiVersion, RepoHint } from './repoHeuristic';

export interface GithubCandidate {
  url: string;
  description: string;
}

export interface DiscoveryResult {
  candidates: GithubCandidate[];
  // True only when discovery ended with zero candidates AND at least one request hit a
  // rate-limit-shaped response (403/429) along the way -- distinguishes "GitHub said no"
  // from "GitHub couldn't be asked". A rate limit seen on an earlier probe is irrelevant
  // once a later one succeeds, so this only reflects the final, no-candidates outcome.
  rateLimited: boolean;
}

export type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const CANDIDATE_PATH_TEMPLATES = [
  'schemas.json',
  'schema/{kindPlural}.json',
  'gen/schema/{kindPlural}.{group}_{version}.json',
  'ui/src/gen/schema/{kindPlural}.{group}_{version}.json',
];

function pluralize(kind: string): string {
  const lower = kind.toLowerCase();
  return lower.endsWith('s') ? lower : `${lower}s`;
}

function isRateLimitStatus(status: number): boolean {
  return status === 403 || status === 429;
}

export async function discoverGithubSchema(
  kind: string,
  apiVersion: string,
  hints: RepoHint[],
  fetchFn: FetchFn,
  authToken: string | undefined
): Promise<DiscoveryResult> {
  const guess = deriveRepoFromApiVersion(apiVersion, hints);
  if (!guess) {
    return { candidates: [], rateLimited: false };
  }

  const [group, version] = apiVersion.split('/');
  const kindPlural = pluralize(kind);
  const headers: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const candidates: GithubCandidate[] = [];
  let sawRateLimit = false;

  for (const template of CANDIDATE_PATH_TEMPLATES) {
    const path = template
      .replace('{kindPlural}', kindPlural)
      .replace('{group}', group)
      .replace('{version}', version ?? '');
    const contentsUrl = `https://api.github.com/repos/${guess.org}/${guess.repo}/contents/${path}`;
    const response = await fetchFn(contentsUrl, { headers });
    if (response.ok) {
      const body = (await response.json()) as { download_url?: string };
      if (body.download_url) {
        candidates.push({ url: body.download_url, description: `${guess.org}/${guess.repo}: ${path}` });
      }
    } else if (isRateLimitStatus(response.status)) {
      sawRateLimit = true;
    }
  }
  if (candidates.length > 0) {
    return { candidates, rateLimited: false };
  }

  const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(kind)}+schema+repo:${guess.org}/${guess.repo}`;
  const searchResponse = await fetchFn(searchUrl, { headers });
  if (searchResponse.ok) {
    const body = (await searchResponse.json()) as { items?: { path: string; html_url: string }[] };
    for (const item of body.items ?? []) {
      const rawUrl = `https://raw.githubusercontent.com/${guess.org}/${guess.repo}/HEAD/${item.path}`;
      candidates.push({ url: rawUrl, description: `${guess.org}/${guess.repo}: ${item.path} (via code search)` });
    }
  } else if (isRateLimitStatus(searchResponse.status)) {
    sawRateLimit = true;
  }
  return { candidates, rateLimited: candidates.length === 0 && sawRateLimit };
}
