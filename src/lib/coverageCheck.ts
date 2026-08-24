import { hasSchemaComment } from './schemaCommentDetector';
import { matchesAnyGlob } from './globMatch';

export type YamlSchemasSetting = Record<string, string | string[]>;

export function isCovered(
  text: string,
  startLine: number,
  relativePath: string,
  yamlSchemas: YamlSchemasSetting
): boolean {
  if (hasSchemaComment(text, startLine)) {
    return true;
  }
  const globs = Object.values(yamlSchemas).flatMap((value) => (Array.isArray(value) ? value : [value]));
  return matchesAnyGlob(relativePath, globs);
}
