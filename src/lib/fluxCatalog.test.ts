import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  CachedCatalog,
  CatalogIndex,
  CatalogStore,
  createFluxCatalog,
  FetchFn,
  FLUX_CATALOG_INDEX_URL,
  FLUX_CATALOG_RETRY_MS,
  FLUX_CATALOG_SCHEMA_BASE_URL,
  FLUX_CATALOG_TTL_MS,
  fluxCatalogUrl,
  parseCatalogIndex,
} from './fluxCatalog';

const RAW_INDEX: unknown = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'flux-catalog-index.json'), 'utf8')
);

const STAGE_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json';

function parsedFixture(): CatalogIndex {
  const index = parseCatalogIndex(RAW_INDEX);
  assert.ok(index, 'fixture must parse');
  return index;
}

// A minimal stand-in for the catalog server: serves `body` (or fails, per `mode`) and counts calls.
function countingFetch(mode: { kind: 'ok'; body: unknown } | { kind: 'reject' } | { kind: 'status'; status: number }) {
  const calls: string[] = [];
  const fetchFn: FetchFn = async (url: string) => {
    calls.push(url);
    if (mode.kind === 'reject') {
      throw new Error('network down');
    }
    if (mode.kind === 'status') {
      return { ok: false, status: mode.status, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => mode.body };
  };
  return { fetchFn, calls };
}

function memoryStore(initial?: CachedCatalog) {
  let value = initial;
  const counts = { gets: 0, sets: 0 };
  const store: CatalogStore = {
    get: () => {
      counts.gets++;
      return value;
    },
    set: async (v: CachedCatalog) => {
      counts.sets++;
      value = v;
    },
  };
  return { store, counts, current: () => value };
}

suite('fluxCatalog constants', () => {
  test('match the published catalog endpoints and windows', () => {
    assert.strictEqual(FLUX_CATALOG_INDEX_URL, 'https://schemas.fluxoperator.dev/index.json');
    assert.strictEqual(FLUX_CATALOG_SCHEMA_BASE_URL, 'https://schemas.fluxoperator.dev/catalog');
    assert.strictEqual(FLUX_CATALOG_TTL_MS, 24 * 60 * 60 * 1000);
    assert.strictEqual(FLUX_CATALOG_RETRY_MS, 5 * 60 * 1000);
  });
});

suite('parseCatalogIndex', () => {
  test('projects the fixture into group -> lowercaseKind -> versions', () => {
    assert.deepStrictEqual(parsedFixture(), {
      'kargo.akuity.io': { stage: ['v1alpha1'], warehouse: ['v1alpha1'] },
      'kustomize.toolkit.fluxcd.io': { kustomization: ['v1'] },
      'notification.toolkit.fluxcd.io': { alert: ['v1', 'v1beta3'], provider: ['v1', 'v1beta3'], receiver: ['v1'] },
      core: { configmap: ['v1'] },
      apps: { deployment: ['v1'] },
      'argoproj.io': { applicationset: ['v1alpha1'], rollout: ['v1alpha1'] },
    });
  });

  test('accepts 5-tuple kinds (with the trailing metadata object)', () => {
    const index = parsedFixture();
    assert.deepStrictEqual(index['kustomize.toolkit.fluxcd.io'].kustomization, ['v1']);
    assert.deepStrictEqual(index['argoproj.io'].applicationset, ['v1alpha1']);
  });

  test('keeps every version listed for a kind', () => {
    assert.deepStrictEqual(parsedFixture()['notification.toolkit.fluxcd.io'].alert, ['v1', 'v1beta3']);
  });

  test('reads kinds from a project that also carries a sources array', () => {
    assert.deepStrictEqual(parsedFixture()['argoproj.io'].rollout, ['v1alpha1']);
  });

  test('merges the same group appearing in two projects', () => {
    const index = parseCatalogIndex({
      projects: [
        { name: 'a', groups: [{ g: 'argoproj.io', kinds: [['rollout', ['v1alpha1'], 1, 'Rollout']] }] },
        { name: 'b', groups: [{ g: 'argoproj.io', kinds: [['workflow', ['v1alpha1'], 1, 'Workflow']] }] },
      ],
    });
    assert.deepStrictEqual(index, { 'argoproj.io': { rollout: ['v1alpha1'], workflow: ['v1alpha1'] } });
  });

  test('returns undefined for input that is not a catalog index', () => {
    assert.strictEqual(parseCatalogIndex(null), undefined);
    assert.strictEqual(parseCatalogIndex('index'), undefined);
    assert.strictEqual(parseCatalogIndex({}), undefined);
    assert.strictEqual(parseCatalogIndex({ projects: [] }), undefined);
  });

  test('skips malformed projects, groups and tuples without throwing', () => {
    const index = parseCatalogIndex({
      projects: [
        null,
        'not-a-project',
        { name: 'no-groups' },
        { name: 'bad-groups', groups: 'nope' },
        {
          name: 'mixed',
          groups: [
            null,
            { kinds: [['orphan', ['v1'], 1, 'Orphan']] },
            { g: 'bad.example.com', kinds: 'nope' },
            {
              g: 'good.example.com',
              kinds: [
                ['widget', ['v1'], 1, 'Widget'],
                ['short', ['v1']],
                [42, ['v1'], 1, 'Number'],
                ['noversions', 'v1', 1, 'NoVersions'],
                ['badversion', [1], 1, 'BadVersion'],
                'not-a-tuple',
              ],
            },
          ],
        },
      ],
    });
    assert.deepStrictEqual(index, { 'good.example.com': { widget: ['v1'] } });
  });
});

suite('fluxCatalogUrl', () => {
  test('builds the URL for a listed Stage', () => {
    assert.strictEqual(fluxCatalogUrl(parsedFixture(), 'Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
  });

  test('lowercases a mixed-case kind', () => {
    assert.strictEqual(
      fluxCatalogUrl(parsedFixture(), 'ApplicationSet', 'argoproj.io/v1alpha1'),
      'https://schemas.fluxoperator.dev/catalog/argoproj.io/applicationset_v1alpha1.json'
    );
  });

  test('maps groupless v1 to the core group', () => {
    assert.strictEqual(
      fluxCatalogUrl(parsedFixture(), 'ConfigMap', 'v1'),
      'https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json'
    );
  });

  test('resolves Deployment at apps/v1', () => {
    assert.strictEqual(
      fluxCatalogUrl(parsedFixture(), 'Deployment', 'apps/v1'),
      'https://schemas.fluxoperator.dev/catalog/apps/deployment_v1.json'
    );
  });

  test('resolves each listed version of Alert', () => {
    const index = parsedFixture();
    assert.strictEqual(
      fluxCatalogUrl(index, 'Alert', 'notification.toolkit.fluxcd.io/v1beta3'),
      'https://schemas.fluxoperator.dev/catalog/notification.toolkit.fluxcd.io/alert_v1beta3.json'
    );
    assert.strictEqual(
      fluxCatalogUrl(index, 'Alert', 'notification.toolkit.fluxcd.io/v1'),
      'https://schemas.fluxoperator.dev/catalog/notification.toolkit.fluxcd.io/alert_v1.json'
    );
  });

  test('returns undefined for an unknown group', () => {
    assert.strictEqual(fluxCatalogUrl(parsedFixture(), 'Widget', 'widgets.example.com/v1'), undefined);
  });

  test('returns undefined for an unknown kind in a known group', () => {
    assert.strictEqual(fluxCatalogUrl(parsedFixture(), 'Freight', 'kargo.akuity.io/v1alpha1'), undefined);
  });

  test('returns undefined for an unlisted version of a known kind', () => {
    assert.strictEqual(fluxCatalogUrl(parsedFixture(), 'Stage', 'kargo.akuity.io/v1beta1'), undefined);
  });

  test('returns undefined for the native kustomize Kustomization', () => {
    assert.strictEqual(fluxCatalogUrl(parsedFixture(), 'Kustomization', 'kustomize.config.k8s.io/v1beta1'), undefined);
  });
});

suite('createFluxCatalog lookup', () => {
  const T0 = 1_800_000_000_000;

  test('first lookup fetches the index URL once and stores the compact projection with its fetch time', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'ok', body: RAW_INDEX });
    const mem = memoryStore();
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
    assert.deepStrictEqual(calls, [FLUX_CATALOG_INDEX_URL]);
    assert.deepStrictEqual(mem.current(), { fetchedAt: T0, index: parsedFixture() });
    // A second lookup is served from memory.
    assert.strictEqual(
      await catalog.lookup('ConfigMap', 'v1'),
      'https://schemas.fluxoperator.dev/catalog/core/configmap_v1.json'
    );
    assert.strictEqual(calls.length, 1);
  });

  test('10 concurrent lookups share exactly one fetch', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'ok', body: RAW_INDEX });
    const catalog = createFluxCatalog({ fetchFn, store: memoryStore().store, isEnabled: () => true, now: () => T0 });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'))
    );
    assert.deepStrictEqual(results, Array(10).fill(STAGE_URL));
    assert.strictEqual(calls.length, 1);
  });

  test('a fresh stored copy (e.g. after a restart) is used with zero fetches', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'ok', body: RAW_INDEX });
    const mem = memoryStore({ fetchedAt: T0 - FLUX_CATALOG_TTL_MS + 60_000, index: parsedFixture() });
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(mem.counts.sets, 0);
  });

  test('a stored copy older than the TTL triggers one fetch and the store is rewritten', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'ok', body: RAW_INDEX });
    const mem = memoryStore({ fetchedAt: T0 - FLUX_CATALOG_TTL_MS - 1, index: { 'old.example.com': { old: ['v1'] } } });
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(mem.current(), { fetchedAt: T0, index: parsedFixture() });
  });

  test('stale copy + fetch rejects -> resolves from the stale copy', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'reject' });
    const mem = memoryStore({ fetchedAt: T0 - FLUX_CATALOG_TTL_MS * 3, index: parsedFixture() });
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(mem.counts.sets, 0);
  });

  test('stale copy + HTTP 500 -> resolves from the stale copy', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'status', status: 500 });
    const mem = memoryStore({ fetchedAt: T0 - FLUX_CATALOG_TTL_MS * 3, index: parsedFixture() });
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(mem.counts.sets, 0);
  });

  test('no copy + fetch rejects -> resolves undefined without rejecting', async () => {
    const { fetchFn } = countingFetch({ kind: 'reject' });
    const mem = memoryStore();
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), undefined);
    assert.strictEqual(mem.counts.sets, 0);
  });

  test('json() throwing is treated as a failure', async () => {
    const fetchFn: FetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    const mem = memoryStore();
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), undefined);
    assert.strictEqual(mem.counts.sets, 0);
  });

  test('an unparseable body is treated as a failure (stale copy kept, store untouched)', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'ok', body: { projects: [] } });
    const stale = { fetchedAt: T0 - FLUX_CATALOG_TTL_MS * 2, index: parsedFixture() };
    const mem = memoryStore(stale);
    let now = T0;
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => true, now: () => now });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(mem.counts.sets, 0);
    assert.deepStrictEqual(mem.current(), stale);
    // Counted as a failed attempt: no retry inside the retry window.
    now = T0 + 1000;
    await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1');
    assert.strictEqual(calls.length, 1);
  });

  test('after a failure, no refetch inside FLUX_CATALOG_RETRY_MS, and one refetch after it', async () => {
    let fail = true;
    const calls: string[] = [];
    const fetchFn: FetchFn = async (url: string) => {
      calls.push(url);
      if (fail) {
        throw new Error('network down');
      }
      return { ok: true, status: 200, json: async () => RAW_INDEX };
    };
    let now = T0;
    const catalog = createFluxCatalog({ fetchFn, store: memoryStore().store, isEnabled: () => true, now: () => now });

    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), undefined);
    assert.strictEqual(calls.length, 1);

    fail = false;
    now = T0 + FLUX_CATALOG_RETRY_MS - 1;
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), undefined);
    }
    assert.strictEqual(calls.length, 1);

    now = T0 + FLUX_CATALOG_RETRY_MS;
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), STAGE_URL);
    assert.strictEqual(calls.length, 2);
  });

  test('isEnabled false -> zero fetches and zero store reads', async () => {
    const { fetchFn, calls } = countingFetch({ kind: 'ok', body: RAW_INDEX });
    const mem = memoryStore({ fetchedAt: T0, index: parsedFixture() });
    const catalog = createFluxCatalog({ fetchFn, store: mem.store, isEnabled: () => false, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Stage', 'kargo.akuity.io/v1alpha1'), undefined);
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(mem.counts.gets, 0);
    assert.strictEqual(mem.counts.sets, 0);
  });

  test('never returns a URL for a pair the index does not list', async () => {
    const { fetchFn } = countingFetch({ kind: 'ok', body: RAW_INDEX });
    const catalog = createFluxCatalog({ fetchFn, store: memoryStore().store, isEnabled: () => true, now: () => T0 });
    assert.strictEqual(await catalog.lookup('Kustomization', 'kustomize.config.k8s.io/v1beta1'), undefined);
    assert.strictEqual(await catalog.lookup('Widget', 'widgets.example.com/v1'), undefined);
  });
});
