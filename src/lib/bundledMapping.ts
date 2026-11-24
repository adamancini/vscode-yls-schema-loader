export interface MappingEntry {
  kind: string;
  apiVersion: string;
  url: string;
}

export function resolveBundled(entries: MappingEntry[], kind: string, apiVersion: string): string | undefined {
  return entries.find((entry) => entry.kind === kind && entry.apiVersion === apiVersion)?.url;
}
