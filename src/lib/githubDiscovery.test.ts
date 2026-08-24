import * as assert from 'assert';
import { discoverGithubSchema, FetchFn } from './githubDiscovery';

function stubFetch(responses: Record<string, unknown>): FetchFn {
  return async (url: string) => {
    if (url in responses) {
      const body = responses[url];
      return { ok: true, status: 200, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

suite('discoverGithubSchema', () => {
  test('returns a candidate when a conventional path is found via the contents API', async () => {
    const hitUrl =
      'https://api.github.com/repos/akuity/kargo/contents/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';
    const fetchFn = stubFetch({
      [hitUrl]: {
        download_url:
          'https://raw.githubusercontent.com/akuity/kargo/HEAD/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json',
      },
    });
    const candidates = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], fetchFn, undefined);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(
      candidates[0].url,
      'https://raw.githubusercontent.com/akuity/kargo/HEAD/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json'
    );
  });

  test('falls back to code search when no conventional path is found', async () => {
    const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent('Widget')}+schema+repo:acme/widgets`;
    const fetchFn = stubFetch({
      [searchUrl]: {
        items: [{ path: 'schema/widget.json', html_url: 'https://github.com/acme/widgets/blob/main/schema/widget.json' }],
      },
    });
    const candidates = await discoverGithubSchema('Widget', 'widgets.acme.com/v1', [], fetchFn, undefined);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].url, 'https://raw.githubusercontent.com/acme/widgets/HEAD/schema/widget.json');
  });

  test('returns no candidates when the apiVersion group cannot be mapped to a repo', async () => {
    const candidates = await discoverGithubSchema('ApplicationSet', 'argoproj.io/v1alpha1', [], stubFetch({}), undefined);
    assert.deepStrictEqual(candidates, []);
  });

  test('returns no candidates when nothing is found anywhere', async () => {
    const candidates = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], stubFetch({}), undefined);
    assert.deepStrictEqual(candidates, []);
  });
});
