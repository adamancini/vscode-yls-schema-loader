import * as assert from 'assert';
import { discoverCrdsCatalogSchema } from './crdsCatalogDiscovery';
import { FetchFn } from './githubDiscovery';

function stubFetch(responses: Record<string, { status: number }>): FetchFn {
  return async (url: string) => {
    const entry = responses[url];
    if (!entry) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: entry.status >= 200 && entry.status < 300, status: entry.status, json: async () => ({}) };
  };
}

suite('discoverCrdsCatalogSchema', () => {
  test('returns a candidate when the conventional CRDs-catalog path exists', async () => {
    const hitUrl = 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/cert-manager.io/certificate_v1.json';
    const fetchFn = stubFetch({ [hitUrl]: { status: 200 } });
    const result = await discoverCrdsCatalogSchema('Certificate', 'cert-manager.io/v1', fetchFn);
    assert.deepStrictEqual(result, {
      url: hitUrl,
      description: 'datreeio/CRDs-catalog: cert-manager.io/certificate_v1.json',
    });
  });

  test('lowercases the kind and does not pluralize it', async () => {
    const hitUrl =
      'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/cilium.io/ciliumclusterwidenetworkpolicy_v2.json';
    const fetchFn = stubFetch({ [hitUrl]: { status: 200 } });
    const result = await discoverCrdsCatalogSchema('CiliumClusterwideNetworkPolicy', 'cilium.io/v2', fetchFn);
    assert.strictEqual(result?.url, hitUrl);
  });

  test('returns undefined when the path does not exist in the catalog', async () => {
    const result = await discoverCrdsCatalogSchema('Widget', 'widgets.example.com/v1', stubFetch({}));
    assert.strictEqual(result, undefined);
  });

  test('returns undefined when apiVersion has no version segment', async () => {
    const result = await discoverCrdsCatalogSchema('Widget', 'widgets.example.com', stubFetch({}));
    assert.strictEqual(result, undefined);
  });
});
