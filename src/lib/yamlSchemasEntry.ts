import { YamlSchemasSetting } from './coverageCheck';

export function addSchemaMapping(current: YamlSchemasSetting, url: string, globPattern: string): YamlSchemasSetting {
  const existing = current[url];
  const globs = existing === undefined ? [] : Array.isArray(existing) ? [...existing] : [existing];
  if (!globs.includes(globPattern)) {
    globs.push(globPattern);
  }
  return { ...current, [url]: globs };
}
