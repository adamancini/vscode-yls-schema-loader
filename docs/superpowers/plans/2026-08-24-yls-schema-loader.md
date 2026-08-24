# YLS Schema Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that detects `kind`/`apiVersion` in open YAML documents, resolves a matching yaml-language-server schema (bundled mapping, session-cached prior resolution, or GitHub heuristic discovery), and offers to wire it up via an inline `$schema` comment and/or a `yaml.schemas` entry, entirely through an explicit diagnostic + quick-fix flow (no silent edits).

**Architecture:** A plain TypeScript VS Code extension (no custom language server). Nearly all logic lives in dependency-injected, `vscode`-free pure modules under `src/lib/` (parsing, coverage checks, mapping lookup, GitHub-repo heuristic, GitHub API calls, resolver pipeline) so it's unit-testable with plain Mocha. A thin `vscode`-aware glue layer (`src/*.ts`) wires those pure modules to real editor state, settings, diagnostics, code actions, and commands, and is covered by `@vscode/test-electron` integration tests.

**Tech Stack:** TypeScript, `tsc` for compilation (no bundler — this is a small extension, `tsc -p ./` is sufficient and simpler than adding esbuild), `yaml` (parsing), `minimatch` (glob matching), Mocha (`tdd` UI) for both unit and integration tests, `@vscode/test-cli`/`@vscode/test-electron` for the integration harness, global `fetch` (Node 18+, built into the VS Code extension host) for GitHub API calls.

**Spec:** `docs/superpowers/specs/2026-08-24-yls-schema-loader-design.md`

## Global Constraints

- `engines.vscode` minimum `^1.90.0` (relies on global `fetch` in the extension host and the stable `vscode.authentication` GitHub provider).
- No silent automatic edits to open files — every insertion happens via an explicit command or quick-fix, and GitHub-discovered schemas require explicit user confirmation before anything is written (bundled-mapping resolutions do not require confirmation — they're a curated, trusted source).
- `ylsSchemaLoader.insertionMode` (`"comment" | "yamlSchemas" | "both"`) defaults to `"comment"`.
- The bundled mapping is a versioned JSON file shipped in the extension; it is never fetched at runtime.
- No live network calls in any automated test — GitHub API interactions are mocked via an injected fetch function.
- The extension only acts on documents with **no** existing schema association; it never second-guesses or replaces an existing comment or `yaml.schemas` match.

---

### Task 1: Project scaffolding + activation smoke test

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.mocharc.json`
- Create: `.vscode-test.mjs`
- Create: `src/extension.ts`
- Create: `test/integration/activation.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a compiling, activatable extension shell; `npm run compile`, `npm run test:unit`, `npm run test:integration` all runnable (test:unit has nothing to run yet and that's fine).

- [ ] **Step 1: Write the failing integration test**

`test/integration/activation.test.ts`:
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('extension activates and registers the insert-schema-for-current-document command', async () => {
    const ext = vscode.extensions.getExtension('adamancini.yls-schema-loader');
    assert.ok(ext, 'extension not found — check publisher/name in package.json');
    await ext!.activate();
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('ylsSchemaLoader.insertSchemaForCurrentDocument'),
      'insertSchemaForCurrentDocument command was not registered'
    );
  });
});
```

- [ ] **Step 2: Create the scaffolding files**

`package.json`:
```json
{
  "name": "yls-schema-loader",
  "displayName": "YLS Schema Loader",
  "description": "Discovers yaml-language-server schemas for Kubernetes-style YAML documents and helps wire them up.",
  "version": "0.1.0",
  "publisher": "adamancini",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onLanguage:yaml"],
  "main": "./out/src/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "ylsSchemaLoader.insertSchemaForCurrentDocument",
        "title": "YLS Schema Loader: Insert Schema for Current Document"
      }
    ],
    "configuration": {
      "title": "YLS Schema Loader",
      "properties": {
        "ylsSchemaLoader.insertionMode": {
          "type": "string",
          "enum": ["comment", "yamlSchemas", "both"],
          "default": "comment",
          "description": "What to write when a schema is resolved: an inline yaml-language-server comment, a yaml.schemas entry, or both."
        },
        "ylsSchemaLoader.enableWebDiscovery": {
          "type": "boolean",
          "default": true,
          "description": "Search GitHub for a matching schema when no bundled mapping or cached resolution exists."
        },
        "ylsSchemaLoader.additionalMappings": {
          "type": "array",
          "default": [],
          "description": "User/workspace overrides merged on top of the bundled kind/apiVersion to schema URL mapping.",
          "items": {
            "type": "object",
            "required": ["kind", "apiVersion", "url"],
            "properties": {
              "kind": { "type": "string" },
              "apiVersion": { "type": "string" },
              "url": { "type": "string" }
            }
          }
        },
        "ylsSchemaLoader.githubRepoHints": {
          "type": "array",
          "default": [],
          "description": "Explicit apiVersion-group to org/repo overrides for cases the GitHub heuristic guesses wrong.",
          "items": {
            "type": "object",
            "required": ["group", "repo"],
            "properties": {
              "group": { "type": "string", "description": "The apiVersion group, e.g. kargo.akuity.io" },
              "repo": { "type": "string", "description": "org/repo, e.g. akuity/kargo" }
            }
          }
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -w -p ./",
    "pretest": "npm run compile",
    "test:unit": "mocha \"out/src/lib/**/*.test.js\"",
    "test:integration": "vscode-test",
    "test": "npm run test:unit && npm run test:integration"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.11.0",
    "@types/vscode": "^1.90.0",
    "@vscode/test-cli": "^0.0.9",
    "@vscode/test-electron": "^2.3.9",
    "mocha": "^10.3.0",
    "typescript": "^5.4.0"
  },
  "dependencies": {
    "minimatch": "^9.0.4",
    "yaml": "^2.4.1"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": ".",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

`.gitignore`:
```
out/
node_modules/
*.vsix
test/fixtures/.vscode/
```

`.mocharc.json`:
```json
{
  "ui": "tdd",
  "color": true
}
```

`.vscode-test.mjs`:
```js
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: 'test/fixtures',
  mocha: {
    ui: 'tdd',
  },
});
```

`src/extension.ts`:
```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ylsSchemaLoader.insertSchemaForCurrentDocument', () => {
      vscode.window.showInformationMessage('YLS Schema Loader activated.');
    })
  );
}

export function deactivate(): void {}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

- [ ] **Step 4: Compile and run the integration test**

Run: `npm run compile && npm run test:integration`
Expected: PASS (the first run downloads a VS Code test instance — this is normal and can take a minute).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .mocharc.json .vscode-test.mjs src/extension.ts test/integration/activation.test.ts
git commit -m "Scaffold extension project with activation smoke test"
```

---

### Task 2: YAML kind/apiVersion parser

**Files:**
- Create: `src/lib/yamlDocParser.ts`
- Create: `src/lib/yamlDocParser.test.ts`

**Interfaces:**
- Consumes: `yaml` package's `parse` function.
- Produces (for later tasks):
  - `interface YamlDocumentKey { docIndex: number; kind: string; apiVersion: string; startLine: number }`
  - `function parseKindApiVersions(text: string): YamlDocumentKey[]`

- [ ] **Step 1: Write the failing tests**

`src/lib/yamlDocParser.test.ts`:
```typescript
import * as assert from 'assert';
import { parseKindApiVersions } from './yamlDocParser';

suite('parseKindApiVersions', () => {
  test('extracts kind and apiVersion from a single document', () => {
    const text = [
      'apiVersion: argoproj.io/v1alpha1',
      'kind: ApplicationSet',
      'metadata:',
      '  name: demo',
    ].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), [
      { docIndex: 0, kind: 'ApplicationSet', apiVersion: 'argoproj.io/v1alpha1', startLine: 0 },
    ]);
  });

  test('extracts each document from a multi-document file', () => {
    const text = [
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Stage',
      'metadata:',
      '  name: first',
      '---',
      'apiVersion: kargo.akuity.io/v1alpha1',
      'kind: Warehouse',
      'metadata:',
      '  name: second',
    ].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), [
      { docIndex: 0, kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', startLine: 0 },
      { docIndex: 1, kind: 'Warehouse', apiVersion: 'kargo.akuity.io/v1alpha1', startLine: 5 },
    ]);
  });

  test('skips documents missing kind or apiVersion', () => {
    const text = ['metadata:', '  name: no-kind-here'].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), []);
  });

  test('skips unparseable documents without throwing', () => {
    const text = ['kind: Broken', 'apiVersion: v1', 'this is: [not valid yaml'].join('\n');
    assert.deepStrictEqual(parseKindApiVersions(text), []);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/src/lib/yamlDocParser.test.js`
Expected: FAIL (`yamlDocParser` module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/yamlDocParser.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha out/src/lib/yamlDocParser.test.js`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/yamlDocParser.ts src/lib/yamlDocParser.test.ts
git commit -m "Add YAML kind/apiVersion parser"
```

---

### Task 3: Coverage check (schema comment detector + glob match + isCovered)

**Files:**
- Create: `src/lib/schemaCommentDetector.ts`
- Create: `src/lib/schemaCommentDetector.test.ts`
- Create: `src/lib/globMatch.ts`
- Create: `src/lib/globMatch.test.ts`
- Create: `src/lib/coverageCheck.ts`
- Create: `src/lib/coverageCheck.test.ts`

**Interfaces:**
- Consumes: `minimatch` package.
- Produces (for later tasks):
  - `function hasSchemaComment(text: string, startLine: number): boolean`
  - `function matchesAnyGlob(relativePath: string, globs: string[]): boolean`
  - `type YamlSchemasSetting = Record<string, string | string[]>`
  - `function isCovered(text: string, startLine: number, relativePath: string, yamlSchemas: YamlSchemasSetting): boolean`

- [ ] **Step 1: Write the failing tests**

`src/lib/schemaCommentDetector.test.ts`:
```typescript
import * as assert from 'assert';
import { hasSchemaComment } from './schemaCommentDetector';

suite('hasSchemaComment', () => {
  test('detects a schema comment on the given line', () => {
    const text = [
      '# yaml-language-server: $schema=https://example.com/schema.json',
      'kind: Stage',
    ].join('\n');
    assert.strictEqual(hasSchemaComment(text, 0), true);
  });

  test('returns false when the line has no schema comment', () => {
    const text = ['kind: Stage', 'apiVersion: v1'].join('\n');
    assert.strictEqual(hasSchemaComment(text, 0), false);
  });

  test('checks the specified document start line, not just line 0', () => {
    const text = [
      'kind: Stage',
      '---',
      '# yaml-language-server: $schema=https://example.com/schema.json',
      'kind: Warehouse',
    ].join('\n');
    assert.strictEqual(hasSchemaComment(text, 2), true);
  });
});
```

`src/lib/globMatch.test.ts`:
```typescript
import * as assert from 'assert';
import { matchesAnyGlob } from './globMatch';

suite('matchesAnyGlob', () => {
  test('matches a file against a glob pattern', () => {
    assert.strictEqual(matchesAnyGlob('manifests/stage.yaml', ['manifests/*.yaml']), true);
  });

  test('returns false when no glob matches', () => {
    assert.strictEqual(matchesAnyGlob('manifests/stage.yaml', ['other/*.yaml']), false);
  });

  test('normalizes backslash separators before matching', () => {
    assert.strictEqual(matchesAnyGlob('manifests\\stage.yaml', ['manifests/*.yaml']), true);
  });
});
```

`src/lib/coverageCheck.test.ts`:
```typescript
import * as assert from 'assert';
import { isCovered } from './coverageCheck';

suite('isCovered', () => {
  test('is covered when the document has an inline schema comment', () => {
    const text = '# yaml-language-server: $schema=https://example.com/schema.json\nkind: Stage';
    assert.strictEqual(isCovered(text, 0, 'manifests/stage.yaml', {}), true);
  });

  test('is covered when yaml.schemas matches the file path', () => {
    const text = 'kind: Stage\napiVersion: kargo.akuity.io/v1alpha1';
    const yamlSchemas = { 'https://example.com/schema.json': ['manifests/*.yaml'] };
    assert.strictEqual(isCovered(text, 0, 'manifests/stage.yaml', yamlSchemas), true);
  });

  test('is not covered when neither a comment nor a yaml.schemas glob applies', () => {
    const text = 'kind: Stage\napiVersion: kargo.akuity.io/v1alpha1';
    assert.strictEqual(isCovered(text, 0, 'manifests/stage.yaml', {}), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha "out/src/lib/{schemaCommentDetector,globMatch,coverageCheck}.test.js"`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the implementation**

`src/lib/schemaCommentDetector.ts`:
```typescript
const SCHEMA_COMMENT_RE = /^#\s*yaml-language-server:\s*\$schema=(\S+)\s*$/;

export function hasSchemaComment(text: string, startLine: number): boolean {
  const lines = text.split(/\r?\n/);
  return SCHEMA_COMMENT_RE.test(lines[startLine] ?? '');
}
```

`src/lib/globMatch.ts`:
```typescript
import { minimatch } from 'minimatch';

export function matchesAnyGlob(relativePath: string, globs: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return globs.some((pattern) => minimatch(normalized, pattern, { dot: true }));
}
```

`src/lib/coverageCheck.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha "out/src/lib/{schemaCommentDetector,globMatch,coverageCheck}.test.js"`
Expected: PASS (9 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemaCommentDetector.ts src/lib/schemaCommentDetector.test.ts src/lib/globMatch.ts src/lib/globMatch.test.ts src/lib/coverageCheck.ts src/lib/coverageCheck.test.ts
git commit -m "Add schema coverage check (existing comment + yaml.schemas glob match)"
```

---

### Task 4: Bundled mapping + seed data

**Files:**
- Create: `src/lib/bundledMapping.ts`
- Create: `src/lib/bundledMappingData.json`
- Create: `src/lib/bundledMapping.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (for later tasks):
  - `interface MappingEntry { kind: string; apiVersion: string; url: string }`
  - `function resolveBundled(entries: MappingEntry[], kind: string, apiVersion: string): string | undefined`
  - `function mergeMappings(bundled: MappingEntry[], additional: MappingEntry[]): MappingEntry[]`
  - `src/lib/bundledMappingData.json`: a `MappingEntry[]` seed list.

- [ ] **Step 1: Write the failing tests**

`src/lib/bundledMapping.test.ts`:
```typescript
import * as assert from 'assert';
import { resolveBundled, mergeMappings, MappingEntry } from './bundledMapping';
import bundledMappingData from './bundledMappingData.json';

suite('resolveBundled', () => {
  const entries: MappingEntry[] = [
    { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://example.com/stage.json' },
  ];

  test('returns the URL for a known kind/apiVersion pair', () => {
    assert.strictEqual(resolveBundled(entries, 'Stage', 'kargo.akuity.io/v1alpha1'), 'https://example.com/stage.json');
  });

  test('returns undefined for an unknown pair', () => {
    assert.strictEqual(resolveBundled(entries, 'Warehouse', 'kargo.akuity.io/v1alpha1'), undefined);
  });
});

suite('mergeMappings', () => {
  test('additional entries override bundled entries for the same kind/apiVersion', () => {
    const bundled: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://bundled.example.com/stage.json' },
    ];
    const additional: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://override.example.com/stage.json' },
    ];
    const merged = mergeMappings(bundled, additional);
    assert.strictEqual(resolveBundled(merged, 'Stage', 'kargo.akuity.io/v1alpha1'), 'https://override.example.com/stage.json');
  });

  test('keeps bundled entries not present in additional', () => {
    const bundled: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://bundled.example.com/stage.json' },
    ];
    assert.strictEqual(mergeMappings(bundled, []).length, 1);
  });
});

suite('bundledMappingData seed content', () => {
  test('includes the Kargo Stage schema', () => {
    const url = resolveBundled(bundledMappingData as MappingEntry[], 'Stage', 'kargo.akuity.io/v1alpha1');
    assert.strictEqual(
      url,
      'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/src/lib/bundledMapping.test.js`
Expected: FAIL (module/data file not found).

- [ ] **Step 3: Write the implementation**

`src/lib/bundledMapping.ts`:
```typescript
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
```

`src/lib/bundledMappingData.json`:
```json
[
  {
    "kind": "Stage",
    "apiVersion": "kargo.akuity.io/v1alpha1",
    "url": "https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json"
  },
  {
    "kind": "Warehouse",
    "apiVersion": "kargo.akuity.io/v1alpha1",
    "url": "https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/warehouses.kargo.akuity.io_v1alpha1.json"
  },
  {
    "kind": "Promotion",
    "apiVersion": "kargo.akuity.io/v1alpha1",
    "url": "https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/promotions.kargo.akuity.io_v1alpha1.json"
  },
  {
    "kind": "ApplicationSet",
    "apiVersion": "argoproj.io/v1alpha1",
    "url": "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/argoproj.io/applicationset_v1alpha1.json"
  }
]
```

**Before moving on:** the Kargo `Stage` URL was given directly in the original feature request and is high-confidence. The `Warehouse`/`Promotion` URLs follow the same naming pattern but are pattern-derived, and the `ApplicationSet` URL is from the `datreeio/CRDs-catalog` public schema catalog. Verify all four resolve to actual JSON Schema documents before committing:

```bash
for url in \
  "https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json" \
  "https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/warehouses.kargo.akuity.io_v1alpha1.json" \
  "https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/promotions.kargo.akuity.io_v1alpha1.json" \
  "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/argoproj.io/applicationset_v1alpha1.json"; do
  echo "== $url =="
  curl -fsSL "$url" | head -c 200
  echo
done
```

If any URL 404s or doesn't return a JSON Schema (`"$schema"`/`"type"` keys near the top), find the correct path (check the repo's actual directory listing — e.g. `akuity/kargo`'s `ui/src/gen/schema/` directory, or search `datreeio/CRDs-catalog` for the right group folder) and fix that entry before proceeding to Step 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha out/src/lib/bundledMapping.test.js`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bundledMapping.ts src/lib/bundledMappingData.json src/lib/bundledMapping.test.ts
git commit -m "Add bundled kind/apiVersion to schema URL mapping"
```

---

### Task 5: GitHub repo heuristic

**Files:**
- Create: `src/lib/repoHeuristic.ts`
- Create: `src/lib/repoHeuristic.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (for later tasks):
  - `interface RepoHint { group: string; repo: string }` (`repo` is `"org/repo"`, e.g. `"akuity/kargo"`)
  - `interface RepoGuess { org: string; repo: string }`
  - `function deriveRepoFromApiVersion(apiVersion: string, hints?: RepoHint[]): RepoGuess | undefined`

- [ ] **Step 1: Write the failing tests**

`src/lib/repoHeuristic.test.ts`:
```typescript
import * as assert from 'assert';
import { deriveRepoFromApiVersion } from './repoHeuristic';

suite('deriveRepoFromApiVersion', () => {
  test('derives org/repo from a subdomain-style group', () => {
    assert.deepStrictEqual(deriveRepoFromApiVersion('kargo.akuity.io/v1alpha1'), { org: 'akuity', repo: 'kargo' });
  });

  test('returns undefined for a two-label group with no specific repo', () => {
    assert.strictEqual(deriveRepoFromApiVersion('argoproj.io/v1alpha1'), undefined);
  });

  test('returns undefined for a core API group with no slash', () => {
    assert.strictEqual(deriveRepoFromApiVersion('v1'), undefined);
  });

  test('an explicit hint overrides the heuristic', () => {
    const hints = [{ group: 'argoproj.io', repo: 'argoproj/argo-cd' }];
    assert.deepStrictEqual(deriveRepoFromApiVersion('argoproj.io/v1alpha1', hints), { org: 'argoproj', repo: 'argo-cd' });
  });

  test('a hint for a different group does not apply', () => {
    const hints = [{ group: 'other.example.com', repo: 'org/repo' }];
    assert.strictEqual(deriveRepoFromApiVersion('argoproj.io/v1alpha1', hints), undefined);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/src/lib/repoHeuristic.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/repoHeuristic.ts`:
```typescript
export interface RepoHint {
  group: string;
  repo: string; // "org/repo", e.g. "akuity/kargo"
}

export interface RepoGuess {
  org: string;
  repo: string;
}

export function deriveRepoFromApiVersion(apiVersion: string, hints: RepoHint[] = []): RepoGuess | undefined {
  const group = apiVersion.split('/')[0];

  const hint = hints.find((h) => h.group === group);
  if (hint) {
    const [org, repo] = hint.repo.split('/');
    if (org && repo) {
      return { org, repo };
    }
  }

  // Heuristic: a subdomain-style group like "kargo.akuity.io" is minted as
  // "<repo>.<org-domain>" — repo is the first label, org is the second. A bare or
  // two-label group ("v1", "argoproj.io") has no single repo to guess and needs a hint.
  const labels = group.split('.');
  if (labels.length < 3) {
    return undefined;
  }
  return { repo: labels[0], org: labels[1] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha out/src/lib/repoHeuristic.test.js`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repoHeuristic.ts src/lib/repoHeuristic.test.ts
git commit -m "Add apiVersion-group to GitHub org/repo heuristic"
```

---

### Task 6: GitHub discovery

**Files:**
- Create: `src/lib/githubDiscovery.ts`
- Create: `src/lib/githubDiscovery.test.ts`

**Interfaces:**
- Consumes: `RepoHint`, `deriveRepoFromApiVersion` from `./repoHeuristic` (Task 5).
- Produces (for later tasks):
  - `interface GithubCandidate { url: string; description: string }`
  - `type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>`
  - `function discoverGithubSchema(kind: string, apiVersion: string, hints: RepoHint[], fetchFn: FetchFn, authToken: string | undefined): Promise<GithubCandidate[]>`

- [ ] **Step 1: Write the failing tests**

`src/lib/githubDiscovery.test.ts`:
```typescript
import * as assert from 'assert';
import { discoverGithubSchema, FetchFn } from './githubDiscovery';

function stubFetch(responses: Record<string, unknown>): FetchFn {
  return async (url: string) => {
    if (url in responses) {
      const body = responses[url];
      return { ok: true, status: 200, json: async () => body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

suite('discoverGithubSchema', () => {
  test('returns a candidate when a conventional path is found via the contents API', async () => {
    const hitUrl =
      'https://api.github.com/repos/akuity/kargo/contents/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';
    const fetchFn = stubFetch({
      [hitUrl]: {
        download_url:
          'https://raw.githubusercontent.com/akuity/kargo/HEAD/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json',
      },
    });
    const candidates = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], fetchFn, undefined);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(
      candidates[0].url,
      'https://raw.githubusercontent.com/akuity/kargo/HEAD/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json'
    );
  });

  test('falls back to code search when no conventional path is found', async () => {
    const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent('Widget')}+schema+repo:acme/widgets`;
    const fetchFn = stubFetch({
      [searchUrl]: {
        items: [{ path: 'schema/widget.json', html_url: 'https://github.com/acme/widgets/blob/main/schema/widget.json' }],
      },
    });
    const candidates = await discoverGithubSchema('Widget', 'widgets.acme.com/v1', [], fetchFn, undefined);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].url, 'https://raw.githubusercontent.com/acme/widgets/HEAD/schema/widget.json');
  });

  test('returns no candidates when the apiVersion group cannot be mapped to a repo', async () => {
    const candidates = await discoverGithubSchema('ApplicationSet', 'argoproj.io/v1alpha1', [], stubFetch({}), undefined);
    assert.deepStrictEqual(candidates, []);
  });

  test('returns no candidates when nothing is found anywhere', async () => {
    const candidates = await discoverGithubSchema('Stage', 'kargo.akuity.io/v1alpha1', [], stubFetch({}), undefined);
    assert.deepStrictEqual(candidates, []);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/src/lib/githubDiscovery.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/githubDiscovery.ts`:
```typescript
import { deriveRepoFromApiVersion, RepoHint } from './repoHeuristic';

export interface GithubCandidate {
  url: string;
  description: string;
}

export type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const CANDIDATE_PATH_TEMPLATES = [
  'schemas.json',
  'schema/{kindPlural}.json',
  'gen/schema/{kindPlural}.{group}_{version}.json',
  'ui/src/gen/schema/{kindPlural}.{group}_{version}.json',
];

function pluralize(kind: string): string {
  const lower = kind.toLowerCase();
  return lower.endsWith('s') ? lower : `${lower}s`;
}

export async function discoverGithubSchema(
  kind: string,
  apiVersion: string,
  hints: RepoHint[],
  fetchFn: FetchFn,
  authToken: string | undefined
): Promise<GithubCandidate[]> {
  const guess = deriveRepoFromApiVersion(apiVersion, hints);
  if (!guess) {
    return [];
  }

  const [group, version] = apiVersion.split('/');
  const kindPlural = pluralize(kind);
  const headers: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const candidates: GithubCandidate[] = [];

  for (const template of CANDIDATE_PATH_TEMPLATES) {
    const path = template
      .replace('{kindPlural}', kindPlural)
      .replace('{group}', group)
      .replace('{version}', version ?? '');
    const contentsUrl = `https://api.github.com/repos/${guess.org}/${guess.repo}/contents/${path}`;
    const response = await fetchFn(contentsUrl, { headers });
    if (response.ok) {
      const body = (await response.json()) as { download_url?: string };
      if (body.download_url) {
        candidates.push({ url: body.download_url, description: `${guess.org}/${guess.repo}: ${path}` });
      }
    }
  }
  if (candidates.length > 0) {
    return candidates;
  }

  const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(kind)}+schema+repo:${guess.org}/${guess.repo}`;
  const searchResponse = await fetchFn(searchUrl, { headers });
  if (searchResponse.ok) {
    const body = (await searchResponse.json()) as { items?: { path: string; html_url: string }[] };
    for (const item of body.items ?? []) {
      const rawUrl = `https://raw.githubusercontent.com/${guess.org}/${guess.repo}/HEAD/${item.path}`;
      candidates.push({ url: rawUrl, description: `${guess.org}/${guess.repo}: ${item.path} (via code search)` });
    }
  }
  return candidates;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha out/src/lib/githubDiscovery.test.js`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/githubDiscovery.ts src/lib/githubDiscovery.test.ts
git commit -m "Add GitHub schema discovery (contents API probing + code search fallback)"
```

---

### Task 7: Schema insertion helpers

**Files:**
- Create: `src/lib/yamlSchemasEntry.ts`
- Create: `src/lib/yamlSchemasEntry.test.ts`
- Create: `src/lib/commentInsertion.ts`
- Create: `src/lib/commentInsertion.test.ts`

**Interfaces:**
- Consumes: `YamlSchemasSetting` from `./coverageCheck` (Task 3).
- Produces (for later tasks):
  - `function addSchemaMapping(current: YamlSchemasSetting, url: string, globPattern: string): YamlSchemasSetting`
  - `function schemaCommentLine(schemaRef: string): string`
  - `function insertSchemaComment(text: string, startLine: number, schemaRef: string): string`

- [ ] **Step 1: Write the failing tests**

`src/lib/yamlSchemasEntry.test.ts`:
```typescript
import * as assert from 'assert';
import { addSchemaMapping } from './yamlSchemasEntry';

suite('addSchemaMapping', () => {
  test('adds a new URL with a single glob', () => {
    const result = addSchemaMapping({}, 'https://example.com/schema.json', 'manifests/stage.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/stage.yaml'] });
  });

  test('appends a glob to an existing URL entry', () => {
    const current = { 'https://example.com/schema.json': ['manifests/a.yaml'] };
    const result = addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/b.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/a.yaml', 'manifests/b.yaml'] });
  });

  test('normalizes a single-string existing value to an array before appending', () => {
    const current = { 'https://example.com/schema.json': 'manifests/a.yaml' };
    const result = addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/b.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/a.yaml', 'manifests/b.yaml'] });
  });

  test('does not duplicate an already-present glob', () => {
    const current = { 'https://example.com/schema.json': ['manifests/a.yaml'] };
    const result = addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/a.yaml');
    assert.deepStrictEqual(result, { 'https://example.com/schema.json': ['manifests/a.yaml'] });
  });

  test('does not mutate the input object', () => {
    const current = { 'https://example.com/schema.json': ['manifests/a.yaml'] };
    addSchemaMapping(current, 'https://example.com/schema.json', 'manifests/b.yaml');
    assert.deepStrictEqual(current, { 'https://example.com/schema.json': ['manifests/a.yaml'] });
  });
});
```

`src/lib/commentInsertion.test.ts`:
```typescript
import * as assert from 'assert';
import { schemaCommentLine, insertSchemaComment } from './commentInsertion';

suite('schemaCommentLine', () => {
  test('formats the yaml-language-server modeline', () => {
    assert.strictEqual(
      schemaCommentLine('https://example.com/schema.json'),
      '# yaml-language-server: $schema=https://example.com/schema.json'
    );
  });
});

suite('insertSchemaComment', () => {
  test('inserts the comment at the top of a single-document file', () => {
    const text = 'kind: Stage\napiVersion: kargo.akuity.io/v1alpha1';
    const result = insertSchemaComment(text, 0, 'https://example.com/schema.json');
    assert.strictEqual(
      result,
      '# yaml-language-server: $schema=https://example.com/schema.json\nkind: Stage\napiVersion: kargo.akuity.io/v1alpha1'
    );
  });

  test('inserts the comment immediately before a later document in a multi-doc file', () => {
    const text = ['kind: Stage', '---', 'kind: Warehouse'].join('\n');
    const result = insertSchemaComment(text, 2, 'https://example.com/schema.json');
    assert.strictEqual(
      result,
      ['kind: Stage', '---', '# yaml-language-server: $schema=https://example.com/schema.json', 'kind: Warehouse'].join(
        '\n'
      )
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha "out/src/lib/{yamlSchemasEntry,commentInsertion}.test.js"`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the implementation**

`src/lib/yamlSchemasEntry.ts`:
```typescript
import { YamlSchemasSetting } from './coverageCheck';

export function addSchemaMapping(current: YamlSchemasSetting, url: string, globPattern: string): YamlSchemasSetting {
  const existing = current[url];
  const globs = existing === undefined ? [] : Array.isArray(existing) ? [...existing] : [existing];
  if (!globs.includes(globPattern)) {
    globs.push(globPattern);
  }
  return { ...current, [url]: globs };
}
```

`src/lib/commentInsertion.ts`:
```typescript
export function schemaCommentLine(schemaRef: string): string {
  return `# yaml-language-server: $schema=${schemaRef}`;
}

export function insertSchemaComment(text: string, startLine: number, schemaRef: string): string {
  const lines = text.split(/\r?\n/);
  lines.splice(startLine, 0, schemaCommentLine(schemaRef));
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha "out/src/lib/{yamlSchemasEntry,commentInsertion}.test.js"`
Expected: PASS (7 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/yamlSchemasEntry.ts src/lib/yamlSchemasEntry.test.ts src/lib/commentInsertion.ts src/lib/commentInsertion.test.ts
git commit -m "Add schema insertion helpers (yaml.schemas entry builder + comment insertion)"
```

---

### Task 8: Resolver pipeline

**Files:**
- Create: `src/lib/resolver.ts`
- Create: `src/lib/resolver.test.ts`

**Interfaces:**
- Consumes:
  - `MappingEntry`, `resolveBundled` from `./bundledMapping` (Task 4)
  - `RepoHint` from `./repoHeuristic` (Task 5)
  - `GithubCandidate`, `FetchFn`, `discoverGithubSchema` from `./githubDiscovery` (Task 6)
- Produces (for later tasks):
  - `type Resolution = { source: 'bundled'; url: string } | { source: 'sessionCache'; url: string } | { source: 'github'; candidates: GithubCandidate[] } | { source: 'unresolved' }`
  - `interface ResolverDeps { bundledEntries: MappingEntry[]; sessionCache: Map<string, string>; enableWebDiscovery: boolean; githubHints: RepoHint[]; fetchFn: FetchFn; authToken: string | undefined }`
  - `function sessionCacheKey(kind: string, apiVersion: string): string`
  - `function resolveSchema(kind: string, apiVersion: string, deps: ResolverDeps): Promise<Resolution>`

- [ ] **Step 1: Write the failing tests**

`src/lib/resolver.test.ts`:
```typescript
import * as assert from 'assert';
import { resolveSchema, sessionCacheKey, ResolverDeps } from './resolver';
import { MappingEntry } from './bundledMapping';
import { FetchFn } from './githubDiscovery';

function baseDeps(overrides: Partial<ResolverDeps> = {}): ResolverDeps {
  return {
    bundledEntries: [],
    sessionCache: new Map<string, string>(),
    enableWebDiscovery: true,
    githubHints: [],
    fetchFn: (async () => ({ ok: false, status: 404, json: async () => ({}) })) as FetchFn,
    authToken: undefined,
    ...overrides,
  };
}

suite('resolveSchema', () => {
  test('resolves from the bundled mapping first', async () => {
    const bundledEntries: MappingEntry[] = [
      { kind: 'Stage', apiVersion: 'kargo.akuity.io/v1alpha1', url: 'https://bundled.example.com/stage.json' },
    ];
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ bundledEntries }));
    assert.deepStrictEqual(result, { source: 'bundled', url: 'https://bundled.example.com/stage.json' });
  });

  test('resolves from the session cache when not in the bundled mapping', async () => {
    const sessionCache = new Map<string, string>();
    sessionCache.set(sessionCacheKey('Stage', 'kargo.akuity.io/v1alpha1'), 'https://cached.example.com/stage.json');
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ sessionCache }));
    assert.deepStrictEqual(result, { source: 'sessionCache', url: 'https://cached.example.com/stage.json' });
  });

  test('returns unresolved when web discovery is disabled and nothing else matches', async () => {
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ enableWebDiscovery: false }));
    assert.deepStrictEqual(result, { source: 'unresolved' });
  });

  test('falls through to github discovery when nothing else matches', async () => {
    const hitUrl = 'https://api.github.com/repos/akuity/kargo/contents/schemas.json';
    const fetchFn: FetchFn = async (url: string) => {
      if (url === hitUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ download_url: 'https://raw.githubusercontent.com/akuity/kargo/HEAD/schemas.json' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps({ fetchFn }));
    assert.strictEqual(result.source, 'github');
    if (result.source === 'github') {
      assert.strictEqual(result.candidates.length, 1);
      assert.strictEqual(result.candidates[0].url, 'https://raw.githubusercontent.com/akuity/kargo/HEAD/schemas.json');
    }
  });

  test('returns unresolved when github discovery finds nothing', async () => {
    const result = await resolveSchema('Stage', 'kargo.akuity.io/v1alpha1', baseDeps());
    assert.deepStrictEqual(result, { source: 'unresolved' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npx mocha out/src/lib/resolver.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/resolver.ts`:
```typescript
import { MappingEntry, resolveBundled } from './bundledMapping';
import { discoverGithubSchema, FetchFn, GithubCandidate } from './githubDiscovery';
import { RepoHint } from './repoHeuristic';

export type Resolution =
  | { source: 'bundled'; url: string }
  | { source: 'sessionCache'; url: string }
  | { source: 'github'; candidates: GithubCandidate[] }
  | { source: 'unresolved' };

export interface ResolverDeps {
  bundledEntries: MappingEntry[];
  // In-memory, session-scoped: caches resolutions this extension has already made
  // (bundled or accepted GitHub results) so a second file with the same kind/apiVersion
  // doesn't re-query GitHub. Populated by the caller after each successful resolution.
  sessionCache: Map<string, string>;
  enableWebDiscovery: boolean;
  githubHints: RepoHint[];
  fetchFn: FetchFn;
  authToken: string | undefined;
}

export function sessionCacheKey(kind: string, apiVersion: string): string {
  return `${apiVersion}::${kind}`;
}

export async function resolveSchema(kind: string, apiVersion: string, deps: ResolverDeps): Promise<Resolution> {
  const bundledUrl = resolveBundled(deps.bundledEntries, kind, apiVersion);
  if (bundledUrl) {
    return { source: 'bundled', url: bundledUrl };
  }

  const cached = deps.sessionCache.get(sessionCacheKey(kind, apiVersion));
  if (cached) {
    return { source: 'sessionCache', url: cached };
  }

  if (!deps.enableWebDiscovery) {
    return { source: 'unresolved' };
  }

  const candidates = await discoverGithubSchema(kind, apiVersion, deps.githubHints, deps.fetchFn, deps.authToken);
  if (candidates.length > 0) {
    return { source: 'github', candidates };
  }
  return { source: 'unresolved' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npx mocha out/src/lib/resolver.test.js`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolver.ts src/lib/resolver.test.ts
git commit -m "Add resolver pipeline (bundled -> session cache -> GitHub discovery)"
```

---

### Task 9: Settings & GitHub auth glue

**Files:**
- Create: `src/settings.ts`
- Create: `src/githubAuth.ts`
- Create: `test/integration/settings.test.ts`

**Interfaces:**
- Consumes: `MappingEntry` from `./lib/bundledMapping` (Task 4), `RepoHint` from `./lib/repoHeuristic` (Task 5), `YamlSchemasSetting` from `./lib/coverageCheck` (Task 3).
- Produces (for later tasks):
  - `type InsertionMode = 'comment' | 'yamlSchemas' | 'both'`
  - `function getInsertionMode(): InsertionMode`
  - `function getEnableWebDiscovery(): boolean`
  - `function getAdditionalMappings(): MappingEntry[]`
  - `function getGithubRepoHints(): RepoHint[]`
  - `function getYamlSchemas(): YamlSchemasSetting`
  - `function getGithubAuthToken(): Promise<string | undefined>`

- [ ] **Step 1: Write the failing integration test**

`test/integration/settings.test.ts`:
```typescript
import * as assert from 'assert';
import {
  getInsertionMode,
  getEnableWebDiscovery,
  getAdditionalMappings,
  getGithubRepoHints,
  getYamlSchemas,
} from '../../src/settings';
import { getGithubAuthToken } from '../../src/githubAuth';

suite('settings', () => {
  test('returns documented defaults when nothing is configured', () => {
    assert.strictEqual(getInsertionMode(), 'comment');
    assert.strictEqual(getEnableWebDiscovery(), true);
    assert.deepStrictEqual(getAdditionalMappings(), []);
    assert.deepStrictEqual(getGithubRepoHints(), []);
    assert.deepStrictEqual(getYamlSchemas(), {});
  });
});

suite('getGithubAuthToken', () => {
  test('resolves without throwing when no GitHub session is available', async () => {
    const token = await getGithubAuthToken();
    assert.ok(token === undefined || typeof token === 'string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run compile && npm run test:integration`
Expected: FAIL (`src/settings` / `src/githubAuth` not found).

- [ ] **Step 3: Write the implementation**

`src/settings.ts`:
```typescript
import * as vscode from 'vscode';
import { MappingEntry } from './lib/bundledMapping';
import { RepoHint } from './lib/repoHeuristic';
import { YamlSchemasSetting } from './lib/coverageCheck';

export type InsertionMode = 'comment' | 'yamlSchemas' | 'both';

export function getInsertionMode(): InsertionMode {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<InsertionMode>('insertionMode', 'comment');
}

export function getEnableWebDiscovery(): boolean {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<boolean>('enableWebDiscovery', true);
}

export function getAdditionalMappings(): MappingEntry[] {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<MappingEntry[]>('additionalMappings', []);
}

export function getGithubRepoHints(): RepoHint[] {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<RepoHint[]>('githubRepoHints', []);
}

export function getYamlSchemas(): YamlSchemasSetting {
  return vscode.workspace.getConfiguration('yaml').get<YamlSchemasSetting>('schemas', {});
}
```

`src/githubAuth.ts`:
```typescript
import * as vscode from 'vscode';

export async function getGithubAuthToken(): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
    return session?.accessToken;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run compile && npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/githubAuth.ts test/integration/settings.test.ts
git commit -m "Add settings and GitHub auth glue"
```

---

### Task 10: Diagnostics provider

**Files:**
- Create: `src/diagnosticsProvider.ts`
- Modify: `src/extension.ts`
- Create: `test/integration/diagnostics.test.ts`
- Create: `test/fixtures/uncovered.yaml`
- Create: `test/fixtures/covered-by-comment.yaml`

**Interfaces:**
- Consumes: `parseKindApiVersions` from `./lib/yamlDocParser` (Task 2), `isCovered` from `./lib/coverageCheck` (Task 3), `getYamlSchemas` from `./settings` (Task 9).
- Produces (for later tasks):
  - `const DIAGNOSTIC_SOURCE: string`
  - `function createDiagnosticsProvider(): { collection: vscode.DiagnosticCollection; refresh: (document: vscode.TextDocument) => void; dispose: () => void }`

- [ ] **Step 1: Write the failing integration test and fixtures**

`test/fixtures/uncovered.yaml`:
```yaml
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: uncovered-example
```

`test/fixtures/covered-by-comment.yaml`:
```yaml
# yaml-language-server: $schema=https://example.com/schema.json
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: covered-example
```

`test/integration/diagnostics.test.ts`:
```typescript
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

suite('diagnostics', () => {
  test('publishes a diagnostic for an uncovered document', async () => {
    const uri = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'uncovered.yaml'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const diagnostics = vscode.languages.getDiagnostics(uri);
    assert.ok(
      diagnostics.some((d) => d.source === 'ylsSchemaLoader'),
      'expected a ylsSchemaLoader diagnostic on the uncovered fixture'
    );
  });

  test('publishes no diagnostic for a document already covered by a schema comment', async () => {
    const uri = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'covered-by-comment.yaml'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const diagnostics = vscode.languages.getDiagnostics(uri);
    assert.strictEqual(diagnostics.filter((d) => d.source === 'ylsSchemaLoader').length, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run compile && npm run test:integration`
Expected: FAIL (no diagnostics published — `diagnosticsProvider` doesn't exist and isn't wired into `extension.ts` yet).

- [ ] **Step 3: Write the implementation**

`src/diagnosticsProvider.ts`:
```typescript
import * as vscode from 'vscode';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { isCovered } from './lib/coverageCheck';
import { getYamlSchemas } from './settings';

export const DIAGNOSTIC_SOURCE = 'ylsSchemaLoader';

export interface DiagnosticsProvider {
  collection: vscode.DiagnosticCollection;
  refresh: (document: vscode.TextDocument) => void;
  dispose: () => void;
}

export function createDiagnosticsProvider(): DiagnosticsProvider {
  const collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);

  function refresh(document: vscode.TextDocument): void {
    if (document.languageId !== 'yaml') {
      return;
    }
    const text = document.getText();
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const yamlSchemas = getYamlSchemas();
    const diagnostics: vscode.Diagnostic[] = [];

    for (const doc of parseKindApiVersions(text)) {
      if (isCovered(text, doc.startLine, relativePath, yamlSchemas)) {
        continue;
      }
      const line = document.lineAt(Math.min(doc.startLine, document.lineCount - 1));
      const diagnostic = new vscode.Diagnostic(
        line.range,
        `No yaml-language-server schema associated with this ${doc.kind}.`,
        vscode.DiagnosticSeverity.Information
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostics.push(diagnostic);
    }
    collection.set(document.uri, diagnostics);
  }

  return { collection, refresh, dispose: () => collection.dispose() };
}
```

`src/extension.ts` (modify to wire the diagnostics provider in):
```typescript
import * as vscode from 'vscode';
import { createDiagnosticsProvider } from './diagnosticsProvider';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = createDiagnosticsProvider();
  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => diagnostics.refresh(e.document)));
  vscode.workspace.textDocuments.forEach((doc) => diagnostics.refresh(doc));

  context.subscriptions.push(
    vscode.commands.registerCommand('ylsSchemaLoader.insertSchemaForCurrentDocument', () => {
      vscode.window.showInformationMessage('YLS Schema Loader activated.');
    })
  );
}

export function deactivate(): void {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run compile && npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diagnosticsProvider.ts src/extension.ts test/integration/diagnostics.test.ts test/fixtures/uncovered.yaml test/fixtures/covered-by-comment.yaml
git commit -m "Add diagnostics provider for uncovered YAML documents"
```

---

### Task 11: Apply-schema command + candidate confirmation

**Files:**
- Create: `src/commandIds.ts`
- Create: `src/applySchema.ts`
- Create: `src/confirmCandidate.ts`
- Modify: `src/extension.ts`
- Create: `test/integration/applySchema.test.ts`
- Create: `test/fixtures/apply-schema-comment-mode.yaml`
- Create: `test/fixtures/apply-schema-yamlschemas-mode.yaml`

**Interfaces:**
- Consumes: `schemaCommentLine`, `addSchemaMapping` from `./lib/commentInsertion` / `./lib/yamlSchemasEntry` (Task 7), `InsertionMode`, `getYamlSchemas` from `./settings` (Task 9), `GithubCandidate` from `./lib/githubDiscovery` (Task 6), `parseKindApiVersions` (Task 2), `resolveSchema`/`sessionCacheKey`/`ResolverDeps` (Task 8), `mergeMappings` (Task 4), `getGithubAuthToken` (Task 9).
- Produces (for later tasks):
  - `const INSERT_SCHEMA_COMMAND: string`, `const INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND: string` (`src/commandIds.ts`)
  - `function applyResolution(document: vscode.TextDocument, startLine: number, url: string, insertionMode: InsertionMode): Promise<void>` (`src/applySchema.ts`)
  - `function confirmGithubCandidate(candidates: GithubCandidate[]): Promise<GithubCandidate | undefined>` (`src/confirmCandidate.ts`)
  - The registered `INSERT_SCHEMA_COMMAND` command, callable as `vscode.commands.executeCommand(INSERT_SCHEMA_COMMAND, uri, startLine)`.

- [ ] **Step 1: Write the failing integration test and fixtures**

`test/fixtures/apply-schema-comment-mode.yaml`:
```yaml
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: apply-schema-comment-mode
```

`test/fixtures/apply-schema-yamlschemas-mode.yaml`:
```yaml
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: apply-schema-yamlschemas-mode
```

`test/integration/applySchema.test.ts`:
```typescript
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const KARGO_STAGE_SCHEMA_URL =
  'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';

suite('insertSchema command', () => {
  teardown(async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('insertionMode', undefined, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace.getConfiguration('yaml').update('schemas', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('inserts a schema comment for a bundled-mapping match (default insertionMode)', async () => {
    const uri = vscode.Uri.file(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'apply-schema-comment-mode.yaml')
    );
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.commands.executeCommand('ylsSchemaLoader.insertSchema', uri, 0);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(doc.lineAt(0).text, `# yaml-language-server: $schema=${KARGO_STAGE_SCHEMA_URL}`);
  });

  test('writes a yaml.schemas entry when insertionMode is yamlSchemas', async () => {
    await vscode.workspace
      .getConfiguration('ylsSchemaLoader')
      .update('insertionMode', 'yamlSchemas', vscode.ConfigurationTarget.Workspace);
    const uri = vscode.Uri.file(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'apply-schema-yamlschemas-mode.yaml')
    );
    await vscode.workspace.openTextDocument(uri);
    await vscode.commands.executeCommand('ylsSchemaLoader.insertSchema', uri, 0);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const schemas = vscode.workspace.getConfiguration('yaml').get<Record<string, string[]>>('schemas', {});
    assert.ok(schemas[KARGO_STAGE_SCHEMA_URL]?.includes('test/fixtures/apply-schema-yamlschemas-mode.yaml'));
  });
});
```

Note: this test only exercises the bundled-mapping path (Kargo `Stage`), which is deterministic and needs no network access — consistent with the "no live network calls in tests" constraint. The GitHub-discovery path is already covered by Task 6/8's unit tests with an injected fetch stub.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run compile && npm run test:integration`
Expected: FAIL (`ylsSchemaLoader.insertSchema` command not registered).

- [ ] **Step 3: Write the implementation**

`src/commandIds.ts`:
```typescript
export const INSERT_SCHEMA_COMMAND = 'ylsSchemaLoader.insertSchema';
export const INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND = 'ylsSchemaLoader.insertSchemaForCurrentDocument';
```

`src/applySchema.ts`:
```typescript
import * as vscode from 'vscode';
import { schemaCommentLine } from './lib/commentInsertion';
import { addSchemaMapping } from './lib/yamlSchemasEntry';
import { InsertionMode, getYamlSchemas } from './settings';

export async function applyResolution(
  document: vscode.TextDocument,
  startLine: number,
  url: string,
  insertionMode: InsertionMode
): Promise<void> {
  if (insertionMode === 'comment' || insertionMode === 'both') {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(startLine, 0), `${schemaCommentLine(url)}\n`);
    await vscode.workspace.applyEdit(edit);
  }
  if (insertionMode === 'yamlSchemas' || insertionMode === 'both') {
    const relativePath = vscode.workspace.asRelativePath(document.uri, false);
    const updated = addSchemaMapping(getYamlSchemas(), url, relativePath);
    await vscode.workspace.getConfiguration('yaml').update('schemas', updated, vscode.ConfigurationTarget.Workspace);
  }
}
```

`src/confirmCandidate.ts`:
```typescript
import * as vscode from 'vscode';
import { GithubCandidate } from './lib/githubDiscovery';

export async function confirmGithubCandidate(candidates: GithubCandidate[]): Promise<GithubCandidate | undefined> {
  if (candidates.length === 1) {
    const choice = await vscode.window.showInformationMessage(
      `Use this schema for this document?\n${candidates[0].description}`,
      { modal: true },
      'Use this schema'
    );
    return choice === 'Use this schema' ? candidates[0] : undefined;
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({ label: candidate.description, candidate })),
    { placeHolder: 'Multiple possible schemas found — choose one, or press Escape to cancel' }
  );
  return picked?.candidate;
}
```

`src/extension.ts` (modify to register the `insertSchema` command):
```typescript
import * as vscode from 'vscode';
import { createDiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { resolveSchema, sessionCacheKey, ResolverDeps } from './lib/resolver';
import { mergeMappings } from './lib/bundledMapping';
import bundledMappingData from './lib/bundledMappingData.json';
import { applyResolution } from './applySchema';
import { confirmGithubCandidate } from './confirmCandidate';
import { getGithubAuthToken } from './githubAuth';
import { INSERT_SCHEMA_COMMAND, INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND } from './commandIds';
import { getInsertionMode, getEnableWebDiscovery, getAdditionalMappings, getGithubRepoHints } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = createDiagnosticsProvider();
  const sessionCache = new Map<string, string>();

  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => diagnostics.refresh(e.document)));
  vscode.workspace.textDocuments.forEach((doc) => diagnostics.refresh(doc));

  context.subscriptions.push(
    vscode.commands.registerCommand(INSERT_SCHEMA_COMMAND, async (uri: vscode.Uri, startLine: number) => {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      const target = parseKindApiVersions(text).find((d) => d.startLine === startLine);
      if (!target) {
        return;
      }
      const deps: ResolverDeps = {
        bundledEntries: mergeMappings(bundledMappingData, getAdditionalMappings()),
        sessionCache,
        enableWebDiscovery: getEnableWebDiscovery(),
        githubHints: getGithubRepoHints(),
        fetchFn: fetch as ResolverDeps['fetchFn'],
        authToken: await getGithubAuthToken(),
      };
      const resolution = await resolveSchema(target.kind, target.apiVersion, deps);
      const insertionMode = getInsertionMode();

      if (resolution.source === 'bundled' || resolution.source === 'sessionCache') {
        await applyResolution(document, target.startLine, resolution.url, insertionMode);
        sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), resolution.url);
      } else if (resolution.source === 'github') {
        const picked = await confirmGithubCandidate(resolution.candidates);
        if (picked) {
          await applyResolution(document, target.startLine, picked.url, insertionMode);
          sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), picked.url);
        }
      } else {
        const manual = await vscode.window.showInputBox({
          prompt: 'Enter the schema URL or file path for this document',
        });
        if (manual) {
          await applyResolution(document, target.startLine, manual, insertionMode);
          sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), manual);
        }
      }
      diagnostics.refresh(document);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND, () => {
      vscode.window.showInformationMessage('YLS Schema Loader activated.');
    })
  );
}

export function deactivate(): void {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run compile && npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commandIds.ts src/applySchema.ts src/confirmCandidate.ts src/extension.ts test/integration/applySchema.test.ts test/fixtures/apply-schema-comment-mode.yaml test/fixtures/apply-schema-yamlschemas-mode.yaml
git commit -m "Add insertSchema command with candidate confirmation and insertionMode support"
```

---

### Task 12: Code actions provider + final extension wiring

**Files:**
- Create: `src/codeActionsProvider.ts`
- Modify: `src/extension.ts`
- Create: `test/integration/codeActions.test.ts`
- Create: `test/fixtures/current-document-command.yaml`

**Interfaces:**
- Consumes: `DIAGNOSTIC_SOURCE` from `./diagnosticsProvider` (Task 10), `INSERT_SCHEMA_COMMAND` from `./commandIds` (Task 11), `parseKindApiVersions` (Task 2).
- Produces: `class SchemaCodeActionProvider implements vscode.CodeActionProvider`. This is the final task — no further tasks consume its output.

- [ ] **Step 1: Write the failing integration tests and fixture**

`test/fixtures/current-document-command.yaml`:
```yaml
apiVersion: kargo.akuity.io/v1alpha1
kind: Stage
metadata:
  name: current-document-command
```

`test/integration/codeActions.test.ts`:
```typescript
import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { SchemaCodeActionProvider } from '../../src/codeActionsProvider';
import { DIAGNOSTIC_SOURCE } from '../../src/diagnosticsProvider';
import { INSERT_SCHEMA_COMMAND } from '../../src/commandIds';

const KARGO_STAGE_SCHEMA_URL =
  'https://raw.githubusercontent.com/akuity/kargo/refs/heads/main/ui/src/gen/schema/stages.kargo.akuity.io_v1alpha1.json';

suite('SchemaCodeActionProvider', () => {
  test('offers a quick-fix that invokes the insertSchema command for a matching diagnostic', async () => {
    const uri = vscode.Uri.parse('untitled:code-action-test.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'No yaml-language-server schema associated with this Stage.',
      vscode.DiagnosticSeverity.Information
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    const provider = new SchemaCodeActionProvider();
    const actions = provider.provideCodeActions(doc, diagnostic.range, {
      diagnostics: [diagnostic],
      only: undefined,
      triggerKind: vscode.CodeActionTriggerKind.Invoke,
    });
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].command?.command, INSERT_SCHEMA_COMMAND);
    assert.deepStrictEqual(actions[0].command?.arguments, [uri, 0]);
  });

  test('ignores diagnostics from other sources', () => {
    const provider = new SchemaCodeActionProvider();
    const otherDiagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      'unrelated',
      vscode.DiagnosticSeverity.Warning
    );
    otherDiagnostic.source = 'some-other-extension';
    const actions = provider.provideCodeActions({} as vscode.TextDocument, otherDiagnostic.range, {
      diagnostics: [otherDiagnostic],
      only: undefined,
      triggerKind: vscode.CodeActionTriggerKind.Invoke,
    });
    assert.strictEqual(actions.length, 0);
  });
});

suite('insertSchemaForCurrentDocument command', () => {
  test('resolves the document under the cursor', async () => {
    const uri = vscode.Uri.file(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'current-document-command.yaml')
    );
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(1, 0, 1, 0);
    await vscode.commands.executeCommand('ylsSchemaLoader.insertSchemaForCurrentDocument');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(doc.lineAt(0).text, `# yaml-language-server: $schema=${KARGO_STAGE_SCHEMA_URL}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run compile && npm run test:integration`
Expected: FAIL (`codeActionsProvider` doesn't exist; `insertSchemaForCurrentDocument` still just shows an info message).

- [ ] **Step 3: Write the implementation**

`src/codeActionsProvider.ts`:
```typescript
import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE } from './diagnosticsProvider';
import { INSERT_SCHEMA_COMMAND } from './commandIds';

export class SchemaCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    return context.diagnostics
      .filter((diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE)
      .map((diagnostic) => {
        const action = new vscode.CodeAction('Insert yaml-language-server schema', vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = {
          command: INSERT_SCHEMA_COMMAND,
          title: 'Insert yaml-language-server schema',
          arguments: [document.uri, diagnostic.range.start.line],
        };
        return action;
      });
  }
}
```

`src/extension.ts` (final version — replaces the `insertSchemaForCurrentDocument` placeholder and registers the code action provider):
```typescript
import * as vscode from 'vscode';
import { createDiagnosticsProvider } from './diagnosticsProvider';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { resolveSchema, sessionCacheKey, ResolverDeps } from './lib/resolver';
import { mergeMappings } from './lib/bundledMapping';
import bundledMappingData from './lib/bundledMappingData.json';
import { applyResolution } from './applySchema';
import { confirmGithubCandidate } from './confirmCandidate';
import { getGithubAuthToken } from './githubAuth';
import { SchemaCodeActionProvider } from './codeActionsProvider';
import { INSERT_SCHEMA_COMMAND, INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND } from './commandIds';
import { getInsertionMode, getEnableWebDiscovery, getAdditionalMappings, getGithubRepoHints } from './settings';

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = createDiagnosticsProvider();
  const sessionCache = new Map<string, string>();

  context.subscriptions.push(diagnostics.collection);
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => diagnostics.refresh(e.document)));
  vscode.workspace.textDocuments.forEach((doc) => diagnostics.refresh(doc));

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('yaml', new SchemaCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(INSERT_SCHEMA_COMMAND, async (uri: vscode.Uri, startLine: number) => {
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      const target = parseKindApiVersions(text).find((d) => d.startLine === startLine);
      if (!target) {
        return;
      }
      const deps: ResolverDeps = {
        bundledEntries: mergeMappings(bundledMappingData, getAdditionalMappings()),
        sessionCache,
        enableWebDiscovery: getEnableWebDiscovery(),
        githubHints: getGithubRepoHints(),
        fetchFn: fetch as ResolverDeps['fetchFn'],
        authToken: await getGithubAuthToken(),
      };
      const resolution = await resolveSchema(target.kind, target.apiVersion, deps);
      const insertionMode = getInsertionMode();

      if (resolution.source === 'bundled' || resolution.source === 'sessionCache') {
        await applyResolution(document, target.startLine, resolution.url, insertionMode);
        sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), resolution.url);
      } else if (resolution.source === 'github') {
        const picked = await confirmGithubCandidate(resolution.candidates);
        if (picked) {
          await applyResolution(document, target.startLine, picked.url, insertionMode);
          sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), picked.url);
        }
      } else {
        const manual = await vscode.window.showInputBox({
          prompt: 'Enter the schema URL or file path for this document',
        });
        if (manual) {
          await applyResolution(document, target.startLine, manual, insertionMode);
          sessionCache.set(sessionCacheKey(target.kind, target.apiVersion), manual);
        }
      }
      diagnostics.refresh(document);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(INSERT_SCHEMA_FOR_CURRENT_DOCUMENT_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Open a YAML document to insert a schema.');
        return;
      }
      const docs = parseKindApiVersions(editor.document.getText());
      const cursorLine = editor.selection.active.line;
      const target = [...docs].reverse().find((d) => d.startLine <= cursorLine) ?? docs[0];
      if (!target) {
        vscode.window.showWarningMessage('No recognizable kind/apiVersion found in this document.');
        return;
      }
      await vscode.commands.executeCommand(INSERT_SCHEMA_COMMAND, editor.document.uri, target.startLine);
    })
  );
}

export function deactivate(): void {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run compile && npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Run the full test suite end to end**

Run: `npm test`
Expected: PASS (all unit and integration tests green).

- [ ] **Step 6: Manual smoke test**

Press F5 in VS Code (or run `code --extensionDevelopmentPath=.` from the project root) to launch the Extension Development Host, then:
1. Open `test/fixtures/uncovered.yaml` — confirm an info-level squiggle/diagnostic appears on the `kind`/`apiVersion` lines.
2. Click the lightbulb / open the Quick Fix menu on that diagnostic — confirm "Insert yaml-language-server schema" is offered and applying it inserts the Kargo `Stage` schema comment at the top of the file (don't save, so the fixture stays clean for future test runs).
3. Run the command palette entry "YLS Schema Loader: Insert Schema for Current Document" on a fresh copy of the same file with the cursor placed mid-document — confirm it resolves and applies the same way.

- [ ] **Step 7: Commit**

```bash
git add src/codeActionsProvider.ts src/extension.ts test/integration/codeActions.test.ts test/fixtures/current-document-command.yaml
git commit -m "Add code actions provider and finish extension wiring"
```

---

## After this plan

Everything in the design spec's scope is implemented: detection, coverage check, the three-stage resolver (bundled → session cache → GitHub heuristic), diagnostics, the quick-fix + standalone command flow with confirmation for web-discovered schemas, and the four settings. Not built (see the spec's Non-goals, unchanged): live-cluster CRD introspection, auto-detection/replacement of stale existing schema associations, and publishing/packaging (`vsce package`) — revisit those as follow-up work if wanted.
