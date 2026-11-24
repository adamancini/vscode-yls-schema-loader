import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { createDiagnosticsProvider } from '../../src/diagnosticsProvider';
import { createInsertSchemaCommandHandler } from '../../src/insertSchemaCommand';
import { GithubCandidate } from '../../src/lib/githubDiscovery';
import { ResolverDeps } from '../../src/lib/resolver';
import { createFixtureFluxCatalog, disableActivatedFluxCatalog, restoreFluxCatalogSetting } from './testUtils';

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', name));
}

// Simulates a single GitHub Contents API hit on the first candidate path template, so
// resolveSchema resolves to `{ source: 'github', candidates: [...] }` without any real
// network call.
const githubHitFetchFn: ResolverDeps['fetchFn'] = async (url: string) => {
  if (url === 'https://api.github.com/repos/example/widgets/contents/schemas.json') {
    return {
      ok: true,
      status: 200,
      json: async () => ({ download_url: 'https://raw.githubusercontent.com/example/widgets/HEAD/schemas.json' }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

// Every probe 404s, so resolveSchema resolves to `{ source: 'unresolved' }`.
const nothingFoundFetchFn: ResolverDeps['fetchFn'] = async () => ({ ok: false, status: 404, json: async () => ({}) });

// GitHub discovery 404s everywhere, but the CRDs-catalog URL hits -- so resolveSchema
// resolves to `{ source: 'crdsCatalog', url }` without any real network call.
const crdsCatalogHitFetchFn: ResolverDeps['fetchFn'] = async (url: string) => {
  if (url === 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/widgets.example.com/widget_v1.json') {
    return { ok: true, status: 200, json: async () => ({}) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

suite('insertSchema command: github branch', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('applies the schema when the user accepts the offered candidate', async () => {
    const uri = fixtureUri('github-branch-accept.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(new Map(), diagnostics, createFixtureFluxCatalog().catalog, {
        fetchFn: githubHitFetchFn,
        confirmCandidate: async (candidates: GithubCandidate[]) => candidates[0],
      });
      await handler(uri, 0);
      assert.strictEqual(
        doc.lineAt(0).text,
        '# yaml-language-server: $schema=https://raw.githubusercontent.com/example/widgets/HEAD/schemas.json'
      );
    } finally {
      diagnostics.dispose();
    }
  });

  test('applies nothing when the user rejects the offered candidate', async () => {
    const uri = fixtureUri('github-branch-reject.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalFirstLine = doc.lineAt(0).text;
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(new Map(), diagnostics, createFixtureFluxCatalog().catalog, {
        fetchFn: githubHitFetchFn,
        confirmCandidate: async () => undefined,
      });
      await handler(uri, 0);
      assert.strictEqual(doc.lineAt(0).text, originalFirstLine);
    } finally {
      diagnostics.dispose();
    }
  });

  test('populates the session cache only when the candidate is accepted', async () => {
    const uri = fixtureUri('github-branch-accept.yaml');
    await vscode.workspace.openTextDocument(uri);
    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, createFixtureFluxCatalog().catalog, {
        fetchFn: githubHitFetchFn,
        confirmCandidate: async (candidates: GithubCandidate[]) => candidates[0],
      });
      await handler(uri, 0);
      assert.strictEqual(
        sessionCache.get('widgets.example.com/v1::Widget'),
        'https://raw.githubusercontent.com/example/widgets/HEAD/schemas.json'
      );
    } finally {
      diagnostics.dispose();
    }
  });
});

suite('insertSchema command: crdsCatalog branch', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('applies the CRDs-catalog match directly, without a confirmation prompt', async () => {
    const uri = fixtureUri('crds-catalog-branch.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(new Map(), diagnostics, createFixtureFluxCatalog().catalog, {
        fetchFn: crdsCatalogHitFetchFn,
        confirmCandidate: async () => {
          throw new Error('confirmCandidate should not be called for a crdsCatalog resolution');
        },
      });
      await handler(uri, 0);
      assert.strictEqual(
        doc.lineAt(0).text,
        '# yaml-language-server: $schema=https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/widgets.example.com/widget_v1.json'
      );
    } finally {
      diagnostics.dispose();
    }
  });

  test('populates the session cache', async () => {
    const uri = fixtureUri('crds-catalog-branch.yaml');
    await vscode.workspace.openTextDocument(uri);
    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, createFixtureFluxCatalog().catalog, {
        fetchFn: crdsCatalogHitFetchFn,
      });
      await handler(uri, 0);
      assert.strictEqual(
        sessionCache.get('widgets.example.com/v1::Widget'),
        'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/widgets.example.com/widget_v1.json'
      );
    } finally {
      diagnostics.dispose();
    }
  });
});

suite('insertSchema command: unresolved branch', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('applies the manually-entered URL when the user provides one', async () => {
    const uri = fixtureUri('unresolved-branch-accept.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(new Map(), diagnostics, createFixtureFluxCatalog().catalog, {
        fetchFn: nothingFoundFetchFn,
        promptManualUrl: async () => 'https://manual.example.com/schema.json',
      });
      await handler(uri, 0);
      assert.strictEqual(doc.lineAt(0).text, '# yaml-language-server: $schema=https://manual.example.com/schema.json');
    } finally {
      diagnostics.dispose();
    }
  });

  test('applies nothing when the manual-entry prompt is dismissed', async () => {
    const uri = fixtureUri('unresolved-branch-reject.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const originalFirstLine = doc.lineAt(0).text;
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(new Map(), diagnostics, createFixtureFluxCatalog().catalog, {
        fetchFn: nothingFoundFetchFn,
        promptManualUrl: async () => undefined,
      });
      await handler(uri, 0);
      assert.strictEqual(doc.lineAt(0).text, originalFirstLine);
    } finally {
      diagnostics.dispose();
    }
  });
});

suite('insertSchema command: fluxCatalog branch', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('applies the catalog URL directly, without a confirmation prompt, and records it in the session cache', async () => {
    const uri = fixtureUri('flux-catalog-branch.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    const { catalog, requestedUrls } = createFixtureFluxCatalog();
    let confirmCalled = false;
    let manualPromptCalled = false;
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, catalog, {
        fetchFn: nothingFoundFetchFn,
        confirmCandidate: async () => {
          confirmCalled = true;
          return undefined;
        },
        promptManualUrl: async () => {
          manualPromptCalled = true;
          return undefined;
        },
      });
      await handler(uri, 0);
      assert.strictEqual(
        doc.lineAt(0).text,
        '# yaml-language-server: $schema=https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json'
      );
      assert.strictEqual(confirmCalled, false);
      assert.strictEqual(manualPromptCalled, false);
      assert.strictEqual(
        sessionCache.get('kargo.akuity.io/v1alpha1::Stage'),
        'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json'
      );
      assert.deepStrictEqual(requestedUrls, ['https://schemas.fluxoperator.dev/index.json']);
    } finally {
      diagnostics.dispose();
    }
  });
});
