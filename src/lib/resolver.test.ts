import * as assert from 'assert';
import { resolveSchema, sessionCacheKey, ResolverDeps, DIRECT_APPLY_SOURCES } from './resolver';
import { MappingEntry } from './bundledMapping';

function baseDeps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
  return {
    overrideEntries: [],
    lookupFluxCatalog: async () => undefined,
    bundledEntries: [],
    sessionCache: new Map<string, string>(),
    ...overrides,
  };
}

suite('resolveSchema', () => {
  test('resolves from the bundled mapping', async () => {
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

  test('resolves (does not reject) to unresolved when lookupFluxCatalog resolves undefined and nothing else matches', async () => {
    const result = await resolveSchema(
      'Stage',
      'kargo.akuity.io/v1alpha1',
      baseDeps({ lookupFluxCatalog: async () => undefined })
    );
    assert.deepStrictEqual(result, { source: 'unresolved' });
  });

  test('a session-cache miss for a different pair still resolves to unresolved', async () => {
    const sessionCache = new Map<string, string>([
      [sessionCacheKey('Warehouse', 'kargo.akuity.io/v1alpha1'), 'https://cached.example.com/warehouse.json'],
    ]);
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ sessionCache }));
    assert.deepStrictEqual(result, { source: 'unresolved' });
  });
});

const STAGE = { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1' };
const OVERRIDE_URL = 'https://override.example.com/stage.json';
const CATALOG_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json';
const BUNDLED_URL = 'https://bundled.example.com/stage.json';
const CACHED_URL = 'https://cached.example.com/stage.json';

suite('resolveSchema source order (override -> fluxCatalog -> bundled -> sessionCache -> unresolved)', () => {
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
});

suite('DIRECT_APPLY_SOURCES', () => {
  test('is exactly override, fluxCatalog, bundled and sessionCache', () => {
    assert.deepStrictEqual([...DIRECT_APPLY_SOURCES].sort(), ['bundled', 'fluxCatalog', 'override', 'sessionCache']);
  });
});
