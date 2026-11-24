import * as assert from 'assert';
import { coverageState, settingsSchemaUrl } from './coverageCheck';

const URL_A = 'https://a.example.invalid/schema.json';
const URL_B = 'https://b.example.invalid/schema.json';
const URL_C = 'https://c.example.invalid/schema.json';
const STAGE = 'kind: Stage\napiVersion: kargo.akuity.io/v1alpha1';
const STAGE_PATH = 'apps/team-ada/kargo/stage.yaml';

suite('settingsSchemaUrl', () => {
  test('an exact path beats a glob regardless of key order', () => {
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_A]: '**/*.yaml', [URL_B]: STAGE_PATH }), URL_B);
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_B]: STAGE_PATH, [URL_A]: '**/*.yaml' }), URL_B);
  });

  test('more literal leading directory segments win among globs', () => {
    const settings = {
      [URL_A]: '**/*.yaml',
      [URL_B]: 'apps/**/*.yaml',
      [URL_C]: 'apps/team-ada/kargo/*.yaml',
    };
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, settings), URL_C);
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_A]: '**/*.yaml', [URL_B]: 'apps/**/*.yaml' }), URL_B);
  });

  test('equal specificity: the lexically smaller pattern wins', () => {
    assert.strictEqual(
      settingsSchemaUrl('apps/x.yaml', { [URL_A]: 'apps/*.{yaml,yml}', [URL_B]: 'apps/*.yaml' }),
      URL_B
    );
    assert.strictEqual(
      settingsSchemaUrl('apps/x.yaml', { [URL_B]: 'apps/*.yaml', [URL_A]: 'apps/*.{yaml,yml}' }),
      URL_B
    );
  });

  test('the same pattern under two URLs: the lexically smaller URL wins', () => {
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_B]: '**/*.yaml', [URL_A]: '**/*.yaml' }), URL_A);
  });

  test('a leading-slash pattern counts as exact and backslash paths normalize', () => {
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_A]: 'apps/**/*.yaml', [URL_B]: `/${STAGE_PATH}` }), URL_B);
    assert.strictEqual(
      settingsSchemaUrl('apps\\team-ada\\kargo\\stage.yaml', { [URL_A]: 'apps/**/*.yaml', [URL_B]: STAGE_PATH }),
      URL_B
    );
  });

  test('a single-string value and an array value both work', () => {
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_A]: STAGE_PATH }), URL_A);
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_A]: ['other/*.yaml', STAGE_PATH] }), URL_A);
  });

  test('non-URL keys are never returned and a URL key wins over a matching alias', () => {
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { kubernetes: STAGE_PATH }), undefined);
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { './schemas/stage.json': STAGE_PATH }), undefined);
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { kubernetes: STAGE_PATH, [URL_A]: '**/*.yaml' }), URL_A);
    assert.strictEqual(
      settingsSchemaUrl(STAGE_PATH, { 'file:///schemas/stage.json': STAGE_PATH }),
      'file:///schemas/stage.json'
    );
    assert.strictEqual(
      settingsSchemaUrl(STAGE_PATH, { 'http://x.example.invalid/s.json': STAGE_PATH }),
      'http://x.example.invalid/s.json'
    );
  });

  test('nothing matches -> undefined', () => {
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, { [URL_A]: 'other/*.yaml' }), undefined);
    assert.strictEqual(settingsSchemaUrl(STAGE_PATH, {}), undefined);
  });
});

suite('coverageState', () => {
  const settings = { [URL_A]: STAGE_PATH };

  test('an inline comment is covered even when settings match', () => {
    const text = `# yaml-language-server: $schema=${URL_B}\n${STAGE}`;
    assert.deepStrictEqual(coverageState(text, 0, STAGE_PATH, settings, true), { state: 'covered' });
  });

  test('a settings match with writesComment true is restorable with the URL', () => {
    assert.deepStrictEqual(coverageState(STAGE, 0, STAGE_PATH, settings, true), { state: 'restorable', url: URL_A });
  });

  test('a settings match with writesComment false is covered', () => {
    assert.deepStrictEqual(coverageState(STAGE, 0, STAGE_PATH, settings, false), { state: 'covered' });
  });

  test('only a non-URL key matching is covered', () => {
    assert.deepStrictEqual(coverageState(STAGE, 0, STAGE_PATH, { kubernetes: STAGE_PATH }, true), { state: 'covered' });
  });

  test('no match is uncovered', () => {
    assert.deepStrictEqual(coverageState(STAGE, 0, STAGE_PATH, { [URL_A]: 'other/*.yaml' }, true), {
      state: 'uncovered',
    });
  });
});
