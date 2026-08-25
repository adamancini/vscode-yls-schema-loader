const SCHEMA_COMMENT_RE = /^#\s*yaml-language-server:\s*\$schema=\S+/;

export function hasSchemaComment(text: string, startLine: number): boolean {
  const lines = text.split(/\r?\n/);
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (SCHEMA_COMMENT_RE.test(line)) {
      return true;
    }
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    return false;
  }
  return false;
}
