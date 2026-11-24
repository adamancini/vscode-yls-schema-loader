import * as assert from 'assert';
import { resolveSchema, sessionCacheKey, ResolverDeps, DIRECT_APPLY_SOURCES } from './resolver';
import { MappingEntry } from './bundledMapping';
import { FetchFn } from './githubDiscovery';

function baseDeps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
  return {
    overrideEntries: [],
    lookupFluxCatalog: async () => undefined,
    bundledEntries: [],
    sessionCache: new Map<string, string>(),
    enableWebDiscovery: true,
    githubHints: [],
    fetchFn: (async () => ({ ok: false, status: 404, json: async () => ({}) })) as FetchFn,
    getAuthToken: async () => undefined,
    ...overrides,
  };
}

suite('resolveSchema', () => {
  test('resolves from the bundled mapping first', async () => {
    const bundledEntries: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://bundled.example.com/stage.json' },
    ];
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ bundledEntries }));
    assert.deepStrictEqual(result, { source: 'bundled', url: 'https://bundled.example.com/stage.json' });
  });

  test('resolves from the session cache when not in the bundled mapping', async () => {
    const sessionCache = new Map<string, string>();
    sessionCache.set(sessionCacheKey('Stage', 'kargo.akuity.io/v1alpha1'), 'https://cached.example.com/stage.json');
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ sessionCache }));
    assert.deepStrictEqual(result, { source: 'sessionCache', url: 'https://cached.example.com/stage.json' });
  });

  test('returns unresolved when web discovery is disabled and nothing else matches', async () => {
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ enableWebDiscovery: false }));
    assert.deepStrictEqual(result, { source: 'unresolved' });
  });

  test('falls through to github discovery when nothing else matches', async () => {
    const hitUrl = 'https://api.github.com/repos/akuity/kargo/contents/schemas.json';
    const fetchFn: FetchFn = async (url: string) => {
      if (url === hitUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ download_url: 'https://raw.githubusercontent.com/akuity/kargo/HEAD/schemas.json' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ fetchFn }));
    assert.strictEqual(result.source, 'github');
    if (result.source === 'github') {
      assert.strictEqual(result.candidates.length, 1);
      assert.strictEqual(result.candidates[0].url, 'https://raw.githubusercontent.com/akuity/kargo/HEAD/schemas.json');
    }
  });

  test('returns unresolved when github discovery finds nothing and the CRDs-catalog has no match either', async () => {
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps());
    assert.deepStrictEqual(result, { source: 'unresolved' });
  });

  test('falls back to the CRDs-catalog when github discovery finds nothing', async () => {
    const catalogUrl =
      'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/cert-manager.io/certificate_v1.json';
    const fetchFn: FetchFn = async (url: string) => {
      if (url === catalogUrl) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const result = await resolveSchema('Certificate', 'cert-manager.io/v1', baseDeps({ fetchFn }));
    assert.deepStrictEqual(result, { source: 'crdsCatalog', url: catalogUrl });
  });

  test('does not fall back to the CRDs-catalog when github discovery already found candidates', async () => {
    const githubHitUrl = 'https://api.github.com/repos/akuity/kargo/contents/schemas.json';
    const catalogUrl =
      'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/kargo.akuity.io/stage_v1alpha1.json';
    const fetchFn: FetchFn = async (url: string) => {
      if (url === githubHitUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ download_url: 'https://raw.githubusercontent.com/akuity/kargo/HEAD/schemas.json' }),
        };
      }
      if (url === catalogUrl) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ fetchFn }));
    assert.strictEqual(result.source, 'github');
  });

  test('does not fall back to the CRDs-catalog when github is rate-limited', async () => {
    // kargo.akuity.io is a subdomain-style group, so deriveRepoFromApiVersion actually
    // guesses a repo and probes it (unlike cert-manager.io, a two-label group that skips
    // probing entirely) -- necessary for the 403s below to produce a real rate-limit signal.
    const catalogUrl =
      'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/kargo.akuity.io/stage_v1alpha1.json';
    const fetchFn: FetchFn = async (url: string) => {
      if (url === catalogUrl) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: false, status: 403, json: async () => ({ message: 'rate limit exceeded' }) };
    };
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ fetchFn }));
    assert.strictEqual(result.source, 'error');
  });

  test('returns an error resolution when fetchFn throws (network failure)', async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error('network down');
    };
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ fetchFn }));
    assert.strictEqual(result.source, 'error');
    if (result.source === 'error') {
      assert.match(result.message, /network down/);
    }
  });

  test('returns an error resolution when GitHub rate-limits every request', async () => {
    const fetchFn: FetchFn = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ message: 'rate limit exceeded' }),
    });
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ fetchFn }));
    assert.strictEqual(result.source, 'error');
    if (result.source === 'error') {
      assert.match(result.message, /rate limit/i);
    }
  });

  test('never calls getAuthToken for a bundled-mapping hit', async () => {
    let called = false;
    const bundledEntries: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://bundled.example.com/stage.json' },
    ];
    await resolveSchema(
      'Stage',
      'kargo.akuity.io/v1alpha1',
      baseDeps({
        bundledEntries,
        getAuthToken: async () => {
          called = true;
          return undefined;
        },
      })
    );
    assert.strictEqual(called, false);
  });

  test('never calls getAuthToken for a session-cache hit', async () => {
    let called = false;
    const sessionCache = new Map<string, string>();
    sessionCache.set(sessionCacheKey('Stage', 'kargo.akuity.io/v1alpha1'), 'https://cached.example.com/stage.json');
    await resolveSchema(
      'Stage',
      'kargo.akuity.io/v1alpha1',
      baseDeps({
        sessionCache,
        getAuthToken: async () => {
          called = true;
          return undefined;
        },
      })
    );
    assert.strictEqual(called, false);
  });

  test('never calls getAuthToken when web discovery is disabled', async () => {
    let called = false;
    await resolveSchema(
      'Stage',
      'kargo.akuity.io/v1alpha1',
      baseDeps({
        enableWebDiscovery: false,
        getAuthToken: async () => {
          called = true;
          return undefined;
        },
      })
    );
    assert.strictEqual(called, false);
  });

  test('calls getAuthToken when discovery is actually about to run', async () => {
    let called = false;
    await resolveSchema(
      'Stage',
      'kargo.akuity.io/v1alpha1',
      baseDeps({
        getAuthToken: async () => {
          called = true;
          return undefined;
        },
      })
    );
    assert.strictEqual(called, true);
  });
});

const STAGE = { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1' };
const OVERRIDE_URL = 'https://override.example.com/stage.json';
const CATALOG_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json';
const BUNDLED_URL = 'https://bundled.example.com/stage.json';
const CACHED_URL = 'https://cached.example.com/stage.json';

suite('resolveSchema source order (override -> fluxCatalog -> bundled -> sessionCache)', () => {
  test('an override beats a catalog hit for the same pair', async () => {
    const result = await resolveSchema(
      STAGE.kind,
      STAGE.apiVersion,
      baseDeps({
        overrideEntries: [{ ...STAGE, url: OVERRIDE_URL }],
        lookupFluxCatalog: async () => CATALOG_URL,
      })
    );
    assert.deepStrictEqual(result, { source: 'override', url: OVERRIDE_URL });
  });

  test('a catalog hit beats a bundled entry for the same pair', async () => {
    const result = await resolveSchema(
      STAGE.kind,
      STAGE.apiVersion,
      baseDeps({
        bundledEntries: [{ ...STAGE, url: BUNDLED_URL }],
        lookupFluxCatalog: async (kind, apiVersion) =>
          kind === STAGE.kind && apiVersion === STAGE.apiVersion ? CATALOG_URL : undefined,
      })
    );
    assert.deepStrictEqual(result, { source: 'fluxCatalog', url: CATALOG_URL });
  });

  test('the bundled entry is used when the catalog returns undefined', async () => {
    const result = await resolveSchema(
      STAGE.kind,
      STAGE.apiVersion,
      baseDeps({ bundledEntries: [{ ...STAGE, url: BUNDLED_URL }], lookupFluxCatalog: async () => undefined })
    );
    assert.deepStrictEqual(result, { source: 'bundled', url: BUNDLED_URL });
  });

  test('a bundled entry beats the session cache for the same pair', async () => {
    const sessionCache = new Map<string, string>([[sessionCacheKey(STAGE.kind, STAGE.apiVersion), CACHED_URL]]);
    const result = await resolveSchema(
      STAGE.kind,
      STAGE.apiVersion,
      baseDeps({ bundledEntries: [{ ...STAGE, url: BUNDLED_URL }], sessionCache })
    );
    assert.deepStrictEqual(result, { source: 'bundled', url: BUNDLED_URL });
  });

  test('a catalog hit beats the session cache for the same pair', async () => {
    const sessionCache = new Map<string, string>([[sessionCacheKey(STAGE.kind, STAGE.apiVersion), CACHED_URL]]);
    const result = await resolveSchema(
      STAGE.kind,
      STAGE.apiVersion,
      baseDeps({ lookupFluxCatalog: async () => CATALOG_URL, sessionCache })
    );
    assert.deepStrictEqual(result, { source: 'fluxCatalog', url: CATALOG_URL });
  });

  test('lookupFluxCatalog is not called for an override hit', async () => {
    let called = false;
    await resolveSchema(
      STAGE.kind,
      STAGE.apiVersion,
      baseDeps({
        overrideEntries: [{ ...STAGE, url: OVERRIDE_URL }],
        lookupFluxCatalog: async () => {
          called = true;
          return CATALOG_URL;
        },
      })
    );
    assert.strictEqual(called, false);
  });

  test('a catalog hit never reaches GitHub discovery', async () => {
    let fetched = false;
    let tokenRequested = false;
    await resolveSchema(
      STAGE.kind,
      STAGE.apiVersion,
      baseDeps({
        lookupFluxCatalog: async () => CATALOG_URL,
        fetchFn: async () => {
          fetched = true;
          return { ok: false, status: 404, json: async () => ({}) };
        },
        getAuthToken: async () => {
          tokenRequested = true;
          return undefined;
        },
      })
    );
    assert.strictEqual(fetched, false);
    assert.strictEqual(tokenRequested, false);
  });
});

suite('DIRECT_APPLY_SOURCES', () => {
  test('is exactly override, fluxCatalog, bundled, sessionCache and crdsCatalog', () => {
    assert.deepStrictEqual([...DIRECT_APPLY_SOURCES].sort(), [
      'bundled',
      'crdsCatalog',
      'fluxCatalog',
      'override',
      'sessionCache',
    ]);
  });
});
