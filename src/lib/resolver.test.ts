import * as assert from 'assert';
import {
  resolveSchema,
  resolveOverride,
  sessionCacheKey,
  ResolverDeps,
  MappingEntry,
  DIRECT_APPLY_SOURCES,
} from './resolver';

function baseDeps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
  return {
    overrideEntries: [],
    lookupFluxCatalog: async () => undefined,
    sessionCache: new Map<string, string>(),
    ...overrides,
  };
}

suite('resolveOverride', () => {
  const entries: MappingEntry[] = [
    { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://example.com/stage.json' },
  ];

  test('returns the URL for a known kind/apiVersion pair', () => {
    assert.strictEqual(resolveOverride(entries, 'Stage', 'kargo.akuity.io/v1alpha1'), 'https://example.com/stage.json');
  });

  test('returns undefined for an unknown pair', () => {
    assert.strictEqual(resolveOverride(entries, 'Warehouse', 'kargo.akuity.io/v1alpha1'), undefined);
  });
});

suite('resolveSchema', () => {
  test('resolves from the session cache when nothing earlier matches', async () => {
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

  test('the native kustomize Kustomization is unresolved when no override maps it (nothing is shipped)', async () => {
    const result = await resolveSchema('Kustomization', 'kustomize.config.k8s.io/v1beta1', baseDeps());
    assert.deepStrictEqual(result, { source: 'unresolved' });
  });

  test('the native kustomize Kustomization resolves through a user override', async () => {
    const url = 'https://override.example.com/kustomization.json';
    const result = await resolveSchema(
      'Kustomization',
      'kustomize.config.k8s.io/v1beta1',
      baseDeps({ overrideEntries: [{ kind: 'Kustomization', apiVersion: 'kustomize.config.k8s.io/v1beta1', url }] })
    );
    assert.deepStrictEqual(result, { source: 'override', url });
  });
});

const STAGE = { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1' };
const OVERRIDE_URL = 'https://override.example.com/stage.json';
const CATALOG_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json';
const CACHED_URL = 'https://cached.example.com/stage.json';

suite('resolveSchema source order (override -> fluxCatalog -> sessionCache -> unresolved)', () => {
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
  test('is exactly override, fluxCatalog and sessionCache', () => {
    assert.deepStrictEqual([...DIRECT_APPLY_SOURCES].sort(), ['fluxCatalog', 'override', 'sessionCache']);
  });
});
