import * as assert from 'assert';
import { discoverGithubSchema, FetchFn } from './githubDiscovery';

function stubFetch(responses: Record<string, { status: number; body: unknown }>): FetchFn {
  return async (url: string) => {
    const entry = responses[url];
    if (!entry) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: entry.status >= 200 && entry.status < 300, status: entry.status, json: async () => entry.body };
  };
}

suite('discoverGithubSchema', () => {
  test('returns a candidate when a conventional path is found via the contents API', async () => {
    const hitUrl =
      'https://api.github.com/repos/akuity/kargo/contents/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';
    const fetchFn = stubFetch({
      [hitUrl]: {
        status: 200,
        body: {
          download_url:
            'https://raw.githubusercontent.com/akuity/kargo/HEAD/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json',
        },
      },
    });
    const result = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], fetchFn, undefined);
    assert.strictEqual(result.candidates.length, 1);
    assert.strictEqual(
      result.candidates[0].url,
      'https://raw.githubusercontent.com/akuity/kargo/HEAD/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json'
    );
    assert.strictEqual(result.rateLimited, false);
  });

  test('falls back to code search when no conventional path is found', async () => {
    const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent('Widget')}+schema+repo:acme/widgets`;
    const fetchFn = stubFetch({
      [searchUrl]: {
        status: 200,
        body: {
          items: [
            { path: 'schema/widget.json', html_url: 'https://github.com/acme/widgets/blob/main/schema/widget.json' },
          ],
        },
      },
    });
    const result = await discoverGithubSchema('Widget', 'widgets.acme.com/v1', [], fetchFn, undefined);
    assert.strictEqual(result.candidates.length, 1);
    assert.strictEqual(
      result.candidates[0].url,
      'https://raw.githubusercontent.com/acme/widgets/HEAD/schema/widget.json'
    );
    assert.strictEqual(result.rateLimited, false);
  });

  test('returns no candidates when the apiVersion group cannot be mapped to a repo', async () => {
    const result = await discoverGithubSchema('ApplicationSet', 'argoproj.io/v1alpha1', [], stubFetch({}), undefined);
    assert.deepStrictEqual(result, { candidates: [], rateLimited: false });
  });

  test('returns no candidates when nothing is found anywhere', async () => {
    const result = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], stubFetch({}), undefined);
    assert.deepStrictEqual(result, { candidates: [], rateLimited: false });
  });

  test('flags rateLimited when the contents API returns 403 for every template and nothing is found', async () => {
    const fetchFn: FetchFn = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ message: 'rate limit exceeded' }),
    });
    const result = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], fetchFn, undefined);
    assert.deepStrictEqual(result.candidates, []);
    assert.strictEqual(result.rateLimited, true);
  });

  test('flags rateLimited when the code-search fallback returns 429', async () => {
    const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent('Stage')}+schema+repo:akuity/kargo`;
    const fetchFn: FetchFn = async (url: string) => {
      if (url === searchUrl) {
        return { ok: false, status: 429, json: async () => ({ message: 'too many requests' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const result = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], fetchFn, undefined);
    assert.deepStrictEqual(result.candidates, []);
    assert.strictEqual(result.rateLimited, true);
  });

  test('does not flag rateLimited when a plain 404 is the only response seen', async () => {
    const result = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], stubFetch({}), undefined);
    assert.strictEqual(result.rateLimited, false);
  });

  test('rateLimited is false once a real candidate is found, even if an earlier template hit a 403', async () => {
    const rateLimitedUrl = 'https://api.github.com/repos/akuity/kargo/contents/schemas.json';
    const hitUrl =
      'https://api.github.com/repos/akuity/kargo/contents/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';
    const fetchFn = stubFetch({
      [rateLimitedUrl]: { status: 403, body: { message: 'rate limit exceeded' } },
      [hitUrl]: {
        status: 200,
        body: {
          download_url:
            'https://raw.githubusercontent.com/akuity/kargo/HEAD/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json',
        },
      },
    });
    const result = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], fetchFn, undefined);
    assert.strictEqual(result.candidates.length, 1);
    assert.strictEqual(result.rateLimited, false);
  });
});
