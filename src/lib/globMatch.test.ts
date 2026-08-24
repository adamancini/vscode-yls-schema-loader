import * as assert from 'assert';
import { matchesAnyGlob } from './globMatch';

suite('matchesAnyGlob', () => {
  test('matches a file against a glob pattern', () => {
    assert.strictEqual(matchesAnyGlob('manifests/stage.yaml', ['manifests/*.yaml']), true);
  });

  test('returns false when no glob matches', () => {
    assert.strictEqual(matchesAnyGlob('manifests/stage.yaml', ['other/*.yaml']), false);
  });

  test('normalizes backslash separators before matching', () => {
    assert.strictEqual(matchesAnyGlob('manifests\\stage.yaml', ['manifests/*.yaml']), true);
  });
});
