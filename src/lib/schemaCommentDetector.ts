const SCHEMA_COMMENT_RE = /^#\s*yaml-language-server:\s*\$schema=(\S+)\s*$/;

export function hasSchemaComment(text: string, startLine: number): boolean {
  const lines = text.split(/\r?\n/);
  return SCHEMA_COMMENT_RE.test(lines[startLine] ?? '');
}
