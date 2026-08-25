import * as assert from 'assert';
import { addSchemaMapping } from './yamlSchemasEntry';

suite('addSchemaMapping', () => {
  test('adds a new URL with a single glob', () => {
    const result = addSchemaMapping({}, 'https://example.com/schema.json', 'manifests/stage.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/stage.yaml'] });
  });

  test('appends a glob to an existing URL entry', () => {
    const current = { 'https://example.com/schema.json': ['manifests/a.yaml'] };
    const result = addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/b.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/a.yaml', 'manifests/b.yaml'] });
  });

  test('normalizes a single-string existing value to an array before appending', () => {
    const current = { 'https://example.com/schema.json': 'manifests/a.yaml' };
    const result = addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/b.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/a.yaml', 'manifests/b.yaml'] });
  });

  test('does not duplicate an already-present glob', () => {
    const current = { 'https://example.com/schema.json': ['manifests/a.yaml'] };
    const result = addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/a.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/a.yaml'] });
  });

  test('does not mutate the input object', () => {
    const current = { 'https://example.com/schema.json': ['manifests/a.yaml'] };
    addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/b.yaml');
    assert.deepStrictEqual(current, { 'https://example.com/schema.json': ['manifests/a.yaml'] });
  });
});
