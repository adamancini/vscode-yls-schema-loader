import { FetchFn } from './githubDiscovery';

export const FLUX_CATALOG_INDEX_URL = 'https://schemas.fluxoperator.dev/index.json';
export const FLUX_CATALOG_SCHEMA_BASE_URL = 'https://schemas.fluxoperator.dev/catalog';
export const FLUX_CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // index is regenerated daily
export const FLUX_CATALOG_RETRY_MS = 5 * 60 * 1000; // minimum gap between attempts after a failed fetch

// group -> lowercaseKind -> versions. A compact projection of the ~607 KB raw index,
// small enough to keep in VS Code globalState.
export type CatalogIndex = Record<string, Record<string, string[]>>;

export interface CachedCatalog {
  fetchedAt: number;
  index: CatalogIndex;
}

export interface CatalogStore {
  get(): CachedCatalog | undefined;
  set(value: CachedCatalog): Thenable<void> | Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Kind tuple: [lowercaseKind, [versions...], <int>, DisplayKind, {optional metadata}].
function parseKindTuple(tuple: unknown): { kind: string; versions: string[] } | undefined {
  if (!Array.isArray(tuple) || tuple.length < 4) {
    return undefined;
  }
  const [kind, versions] = tuple;
  if (typeof kind !== 'string' || !Array.isArray(versions) || !versions.every((v) => typeof v === 'string')) {
    return undefined;
  }
  return { kind, versions: versions as string[] };
}

export function parseCatalogIndex(raw: unknown): CatalogIndex | undefined {
  if (!isObject(raw) || !Array.isArray(raw.projects)) {
    return undefined;
  }
  const index: CatalogIndex = {};
  for (const project of raw.projects) {
    if (!isObject(project) || !Array.isArray(project.groups)) {
      continue;
    }
    for (const group of project.groups) {
      if (!isObject(group) || typeof group.g !== 'string' || !Array.isArray(group.kinds)) {
        continue;
      }
      for (const tuple of group.kinds) {
        const parsed = parseKindTuple(tuple);
        if (!parsed) {
          continue;
        }
        const kinds = (index[group.g] ??= {});
        const existing = kinds[parsed.kind] ?? [];
        kinds[parsed.kind] = [...existing, ...parsed.versions.filter((v) => !existing.includes(v))];
      }
    }
  }
  return Object.keys(index).length > 0 ? index : undefined;
}

export function fluxCatalogUrl(index: CatalogIndex, kind: string, apiVersion: string): string | undefined {
  const slash = apiVersion.indexOf('/');
  // Groupless apiVersions ("v1") are the core API group, which the catalog files under "core".
  const group = slash === -1 ? 'core' : apiVersion.slice(0, slash);
  const version = slash === -1 ? apiVersion : apiVersion.slice(slash + 1);
  const lowerKind = kind.toLowerCase();
  // hasOwn guards against inherited keys such as "constructor" or "__proto__".
  const kinds = Object.hasOwn(index, group) ? index[group] : undefined;
  const versions = kinds && Object.hasOwn(kinds, lowerKind) ? kinds[lowerKind] : undefined;
  if (!versions?.includes(version)) {
    return undefined;
  }
  return `${FLUX_CATALOG_SCHEMA_BASE_URL}/${group}/${lowerKind}_${version}.json`;
}

export interface FluxCatalog {
  lookup(kind: string, apiVersion: string): Promise<string | undefined>;
}

export function createFluxCatalog(options: {
  fetchFn: FetchFn;
  store: CatalogStore;
  isEnabled: () => boolean;
  now?: () => number;
}): FluxCatalog {
  const { fetchFn, store, isEnabled } = options;
  const now = options.now ?? Date.now;
  let cached: CachedCatalog | undefined;
  let storeRead = false;
  let lastFailureAt: number | undefined;
  let inFlight: Promise<void> | undefined;

  async function fetchIndex(): Promise<void> {
    try {
      const response = await fetchFn(FLUX_CATALOG_INDEX_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const index = parseCatalogIndex(await response.json());
      if (!index) {
        throw new Error('unparseable catalog index');
      }
      cached = { fetchedAt: now(), index };
      lastFailureAt = undefined;
      await store.set(cached);
    } catch {
      // Any failure: keep the stale copy (if any) and back off for FLUX_CATALOG_RETRY_MS.
      // (If only store.set failed, the in-memory copy is fresh and no refetch is due anyway.)
      lastFailureAt = now();
    }
  }

  function needsFetch(): boolean {
    if (cached && now() - cached.fetchedAt <= FLUX_CATALOG_TTL_MS) {
      return false;
    }
    return lastFailureAt === undefined || now() - lastFailureAt >= FLUX_CATALOG_RETRY_MS;
  }

  async function ensureIndex(): Promise<CatalogIndex | undefined> {
    if (!cached && !storeRead) {
      storeRead = true;
      cached = store.get();
    }
    if (needsFetch()) {
      inFlight ??= fetchIndex().finally(() => {
        inFlight = undefined;
      });
    }
    if (inFlight) {
      await inFlight;
    }
    return cached?.index;
  }

  return {
    async lookup(kind: string, apiVersion: string): Promise<string | undefined> {
      if (!isEnabled()) {
        return undefined;
      }
      try {
        const index = await ensureIndex();
        return index ? fluxCatalogUrl(index, kind, apiVersion) : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
