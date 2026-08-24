import { minimatch } from 'minimatch';

export function matchesAnyGlob(relativePath: string, globs: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return globs.some((pattern) => minimatch(normalized, pattern, { dot: true }));
}
