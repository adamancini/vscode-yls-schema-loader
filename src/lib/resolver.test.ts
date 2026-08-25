import * as assert from 'assert';
import { resolveSchema, sessionCacheKey, ResolverDeps } from './resolver';
import { MappingEntry } from './bundledMapping';
import { FetchFn } from './githubDiscovery';

function baseDeps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
  return {
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

  test('returns unresolved when github discovery finds nothing', async () => {
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps());
    assert.deepStrictEqual(result, { source: 'unresolved' });
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
