export interface RepoHint {
  group: string;
  repo: string; // "org/repo", e.g. "akuity/kargo"
}

export interface RepoGuess {
  org: string;
  repo: string;
}

export function deriveRepoFromApiVersion(apiVersion: string, hints: RepoHint[] = []): RepoGuess | undefined {
  const group = apiVersion.split('/')[0];

  const hint = hints.find((h) => h.group === group);
  if (hint) {
    const [org, repo] = hint.repo.split('/');
    if (org && repo) {
      return { org, repo };
    }
  }

  // Heuristic: a subdomain-style group like "kargo.akuity.io" is minted as
  // "<repo>.<org-domain>" — repo is the first label, org is the second. A bare or
  // two-label group ("v1", "argoproj.io") has no single repo to guess and needs a hint.
  const labels = group.split('.');
  if (labels.length < 3) {
    return undefined;
  }
  return { repo: labels[0], org: labels[1] };
}
