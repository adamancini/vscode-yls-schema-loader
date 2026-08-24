import * as assert from 'assert';
import { hasSchemaComment } from './schemaCommentDetector';

suite('hasSchemaComment', () => {
  test('detects a schema comment on the given line', () => {
    const text = [
      '# yaml-language-server: $schema=https://example.com/schema.json',
      'kind: Stage',
    ].join('\n');
    assert.strictEqual(hasSchemaComment(text, 0), true);
  });

  test('returns false when the line has no schema comment', () => {
    const text = ['kind: Stage', 'apiVersion: v1'].join('\n');
    assert.strictEqual(hasSchemaComment(text, 0), false);
  });

  test('checks the specified document start line, not just line 0', () => {
    const text = [
      'kind: Stage',
      '---',
      '# yaml-language-server: $schema=https://example.com/schema.json',
      'kind: Warehouse',
    ].join('\n');
    assert.strictEqual(hasSchemaComment(text, 2), true);
  });
});
