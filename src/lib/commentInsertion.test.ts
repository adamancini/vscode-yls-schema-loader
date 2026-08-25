import * as assert from 'assert';
import { schemaCommentLine, insertSchemaComment } from './commentInsertion';

suite('schemaCommentLine', () => {
  test('formats the yaml-language-server modeline', () => {
    assert.strictEqual(
      schemaCommentLine('https://example.com/schema.json'),
      '# yaml-language-server: $schema=https://example.com/schema.json'
    );
  });
});

suite('insertSchemaComment', () => {
  test('inserts the comment at the top of a single-document file', () => {
    const text = 'kind: Stage\napiVersion: kargo.akuity.io/v1alpha1';
    const result = insertSchemaComment(text, 0, 'https://example.com/schema.json');
    assert.strictEqual(
      result,
      '# yaml-language-server: $schema=https://example.com/schema.json\nkind: Stage\napiVersion: kargo.akuity.io/v1alpha1'
    );
  });

  test('inserts the comment immediately before a later document in a multi-doc file', () => {
    const text = ['kind: Stage', '---', 'kind: Warehouse'].join('\n');
    const result = insertSchemaComment(text, 2, 'https://example.com/schema.json');
    assert.strictEqual(
      result,
      ['kind: Stage', '---', '# yaml-language-server: $schema=https://example.com/schema.json', 'kind: Warehouse'].join(
        '\n'
      )
    );
  });
});
