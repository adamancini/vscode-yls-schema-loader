import { minimatch } from 'minimatch';

export function matchesAnyGlob(relativePath: string, globs: string[]): boolean {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  return globs.some((pattern) => {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    if (minimatch(normalizedPath, normalizedPattern, { dot: true })) {
      return true;
    }
    const withoutLeadingSlash = normalizedPattern.replace(/^\/+/, '');
    return minimatch(normalizedPath, withoutLeadingSlash, { dot: true });
  });
}
