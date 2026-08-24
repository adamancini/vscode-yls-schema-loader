import { parse as parseYamlDocument } from 'yaml';

export interface YamlDocumentKey {
  docIndex: number;
  kind: string;
  apiVersion: string;
  startLine: number;
}

interface RawDocument {
  content: string;
  startLine: number;
}

// Splits on lines that are exactly '---' (optionally trailing whitespace). This is a
// heuristic, not a full YAML multi-document parser: a '---' appearing at the start of a
// line inside a block scalar would incorrectly be treated as a document separator. Good
// enough for the Kubernetes-manifest style files this extension targets.
function splitIntoDocuments(text: string): RawDocument[] {
  const lines = text.split(/\r?\n/);
  const docs: RawDocument[] = [];
  let buffer: string[] = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^---[ \t]*$/.test(lines[i])) {
      if (buffer.some((line) => line.trim().length > 0)) {
        docs.push({ content: buffer.join('\n'), startLine });
      }
      buffer = [];
      startLine = i + 1;
    } else {
      buffer.push(lines[i]);
    }
  }
  if (buffer.some((line) => line.trim().length > 0)) {
    docs.push({ content: buffer.join('\n'), startLine });
  }
  return docs;
}

export function parseKindApiVersions(text: string): YamlDocumentKey[] {
  const results: YamlDocumentKey[] = [];
  splitIntoDocuments(text).forEach((doc, docIndex) => {
    let parsed: unknown;
    try {
      parsed = parseYamlDocument(doc.content);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.kind === 'string' && typeof obj.apiVersion === 'string') {
      results.push({ docIndex, kind: obj.kind, apiVersion: obj.apiVersion, startLine: doc.startLine });
    }
  });
  return results;
}
