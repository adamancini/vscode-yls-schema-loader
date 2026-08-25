import { FetchFn, GithubCandidate } from './githubDiscovery';

const CRDS_CATALOG_REPO = 'datreeio/CRDs-catalog';

// datreeio/CRDs-catalog's naming convention: <group>/<kind lowercase>_<version>.json,
// e.g. cert-manager.io/certificate_v1.json. No pluralization, no separators in the kind.
export async function discoverCrdsCatalogSchema(
  kind: string,
  apiVersion: string,
  fetchFn: FetchFn
): Promise<GithubCandidate | undefined> {
  const [group, version] = apiVersion.split('/');
  if (!group || !version) {
    return undefined;
  }

  const path = `${group}/${kind.toLowerCase()}_${version}.json`;
  const url = `https://raw.githubusercontent.com/${CRDS_CATALOG_REPO}/main/${path}`;
  const response = await fetchFn(url);
  if (!response.ok) {
    return undefined;
  }
  return { url, description: `${CRDS_CATALOG_REPO}: ${path}` };
}
