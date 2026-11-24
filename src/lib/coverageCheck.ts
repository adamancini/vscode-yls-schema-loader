import { hasSchemaComment } from './schemaCommentDetector';
import { matchesAnyGlob } from './globMatch';

export type YamlSchemasSetting = Record<string, string | string[]>;

export type CoverageState = { state: 'covered' } | { state: 'restorable'; url: string } | { state: 'uncovered' };

function patternsOf(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

// Only these keys can be written as a directive: yaml-language-server reads any other value
// (an alias such as `kubernetes`, a relative path) as a file path next to the document.
const DIRECTIVE_URL_KEY = /^(https?:\/\/|file:)/i;

function normalize(pathOrPattern: string): string {
  return pathOrPattern.replace(/\\/g, '/').replace(/^\/+/, '');
}

// Literal leading directory segments before the first glob metacharacter; the file-name
// segment never counts.
function specificity(normalizedPattern: string): number {
  const directories = normalizedPattern.split('/').slice(0, -1);
  const firstGlob = directories.findIndex((segment) => /[*?[{]/.test(segment));
  return firstGlob === -1 ? directories.length : firstGlob;
}

// The URL to restore for `relativePath`: an exact path beats any glob, then the glob with
// more literal leading directories, then the lexically smallest pattern, then URL.
export function settingsSchemaUrl(relativePath: string, yamlSchemas: YamlSchemasSetting): string | undefined {
  const target = normalize(relativePath);
  const candidates = Object.entries(yamlSchemas)
    .filter(([url]) => DIRECTIVE_URL_KEY.test(url))
    .flatMap(([url, value]) => patternsOf(value).map((pattern) => ({ url, pattern })))
    .filter(({ pattern }) => matchesAnyGlob(relativePath, [pattern]))
    .map(({ url, pattern }) => {
      const normalized = normalize(pattern);
      return { url, pattern, exact: normalized === target, specificity: specificity(normalized) };
    });
  candidates.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.specificity - a.specificity ||
      compare(a.pattern, b.pattern) ||
      compare(a.url, b.url)
  );
  return candidates[0]?.url;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function coverageState(
  text: string,
  startLine: number,
  relativePath: string,
  yamlSchemas: YamlSchemasSetting,
  writesComment: boolean
): CoverageState {
  if (hasSchemaComment(text, startLine)) {
    return { state: 'covered' };
  }
  if (!matchesAnyGlob(relativePath, Object.values(yamlSchemas).flatMap(patternsOf))) {
    return { state: 'uncovered' };
  }
  const url = writesComment ? settingsSchemaUrl(relativePath, yamlSchemas) : undefined;
  return url === undefined ? { state: 'covered' } : { state: 'restorable', url };
}
