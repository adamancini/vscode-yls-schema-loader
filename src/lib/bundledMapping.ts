export interface MappingEntry {
  kind: string;
  apiVersion: string;
  url: string;
}

export function resolveBundled(entries: MappingEntry[], kind: string, apiVersion: string): string | undefined {
  return entries.find((entry) => entry.kind === kind && entry.apiVersion === apiVersion)?.url;
}

export function mergeMappings(bundled: MappingEntry[], additional: MappingEntry[]): MappingEntry[] {
  const byKey = new Map<string, MappingEntry>();
  for (const entry of bundled) {
    byKey.set(`${entry.apiVersion}::${entry.kind}`, entry);
  }
  for (const entry of additional) {
    byKey.set(`${entry.apiVersion}::${entry.kind}`, entry);
  }
  return Array.from(byKey.values());
}
