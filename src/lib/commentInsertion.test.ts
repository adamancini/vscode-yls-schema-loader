import * as assert from 'assert';
import { schemaCommentLine } from './commentInsertion';

suite('schemaCommentLine', () => {
  test('formats the yaml-language-server modeline', () => {
    assert.strictEqual(
      schemaCommentLine('https://example.com/schema.json'),
      '# yaml-language-server: $schema=https://example.com/schema.json'
    );
  });
});
