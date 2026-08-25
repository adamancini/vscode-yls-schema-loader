import * as assert from 'assert';
import { deriveRepoFromApiVersion } from './repoHeuristic';

suite('deriveRepoFromApiVersion', () => {
  test('derives org/repo from a subdomain-style group', () => {
    assert.deepStrictEqual(deriveRepoFromApiVersion('kargo.akuity.io/v1alpha1'), { org: 'akuity', repo: 'kargo' });
  });

  test('returns undefined for a two-label group with no specific repo', () => {
    assert.strictEqual(deriveRepoFromApiVersion('argoproj.io/v1alpha1'), undefined);
  });

  test('returns undefined for a core API group with no slash', () => {
    assert.strictEqual(deriveRepoFromApiVersion('v1'), undefined);
  });

  test('an explicit hint overrides the heuristic', () => {
    const hints = [{ group: 'argoproj.io', repo: 'argoproj/argo-cd' }];
    assert.deepStrictEqual(deriveRepoFromApiVersion('argoproj.io/v1alpha1', hints), {
      org: 'argoproj',
      repo: 'argo-cd',
    });
  });

  test('a hint for a different group does not apply', () => {
    const hints = [{ group: 'other.example.com', repo: 'org/repo' }];
    assert.strictEqual(deriveRepoFromApiVersion('argoproj.io/v1alpha1', hints), undefined);
  });
});
