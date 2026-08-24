import * as assert from 'assert';
import { isCovered } from './coverageCheck';

suite('isCovered', () => {
  test('is covered when the document has an inline schema comment', () => {
    const text = '# yaml-language-server: $schema=https://example.com/schema.json\nkind: Stage';
    assert.strictEqual(isCovered(text, 0, 'manifests/stage.yaml', {}), true);
  });

  test('is covered when yaml.schemas matches the file path', () => {
    const text = 'kind: Stage\napiVersion: kargo.akuity.io/v1alpha1';
    const yamlSchemas = { 'https://example.com/schema.json': ['manifests/*.yaml'] };
    assert.strictEqual(isCovered(text, 0, 'manifests/stage.yaml', yamlSchemas), true);
  });

  test('is not covered when neither a comment nor a yaml.schemas glob applies', () => {
    const text = 'kind: Stage\napiVersion: kargo.akuity.io/v1alpha1';
    assert.strictEqual(isCovered(text, 0, 'manifests/stage.yaml', {}), false);
  });
});
