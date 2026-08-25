export function schemaCommentLine(schemaRef: string): string {
  return `# yaml-language-server: $schema=${schemaRef}`;
}
