import * as assert from 'assert';
import {
  getInsertionMode,
  getEnableWebDiscovery,
  getAdditionalMappings,
  getGithubRepoHints,
  getYamlSchemas,
} from '../../src/settings';
import { getGithubAuthToken } from '../../src/githubAuth';

suite('settings', () => {
  test('returns documented defaults when nothing is configured', () => {
    assert.strictEqual(getInsertionMode(), 'comment');
    assert.strictEqual(getEnableWebDiscovery(), true);
    assert.deepStrictEqual(getAdditionalMappings(), []);
    assert.deepStrictEqual(getGithubRepoHints(), []);
    assert.deepStrictEqual(getYamlSchemas(), {});
  });
});

suite('getGithubAuthToken', () => {
  test('resolves without throwing when no GitHub session is available', async () => {
    const token = await getGithubAuthToken();
    assert.ok(token === undefined || typeof token === 'string');
  });
});
