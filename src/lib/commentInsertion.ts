export function schemaCommentLine(schemaRef: string): string {
  return `# yaml-language-server: $schema=${schemaRef}`;
}

export function insertSchemaComment(text: string, startLine: number, schemaRef: string): string {
  const lines = text.split(/\r?\n/);
  lines.splice(startLine, 0, schemaCommentLine(schemaRef));
  return lines.join('\n');
}
