import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { SchemaCodeActionProvider } from '../../src/codeActionsProvider';
import {
  createDiagnosticsProvider,
  DIAGNOSTIC_SOURCE,
  DiagnosticsProvider,
  RESTORE_DIAGNOSTIC_CODE,
  RESTORE_DIAGNOSTIC_MESSAGE,
} from '../../src/diagnosticsProvider';
import { createInsertSchemaCommandHandler } from '../../src/insertSchemaCommand';
import { FluxCatalog } from '../../src/lib/fluxCatalog';
import { createFixtureFluxCatalog, disableActivatedFluxCatalog, restoreFluxCatalogSetting } from './testUtils';

// A document with no inline directive whose file is mapped under a URL key in yaml.schemas
// gets a restore diagnostic and an edit-only quick-fix that puts the settings URL back as an
// inline comment. Schema URLs live on the reserved .invalid host so nothing can be fetched.

const RESTORE_TITLE = 'Restore yaml-language-server schema directive';
const SETTINGS_URL = 'https://schemas.example.invalid/stage.json';
const GLOB_URL = 'https://schemas.example.invalid/glob-stage.json';
const DIRECTIVE_PREFIX = '# yaml-language-server: $schema=';

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', name));
}

function relPath(name: string): string {
  return `test/fixtures/${name}`;
}

async function setYamlSchemas(value: Record<string, string | string[]> | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('yaml').update('schemas', value, vscode.ConfigurationTarget.Workspace);
}

function currentYamlSchemas(): unknown {
  return vscode.workspace.getConfiguration('yaml').get('schemas');
}

async function setInsertionMode(mode: string | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('insertionMode', mode, vscode.ConfigurationTarget.Workspace);
}

// Wraps a catalog to count lookup() calls, so a test proves no lookup happened at all.
function countingCatalog(inner: FluxCatalog): { catalog: FluxCatalog; lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    catalog: {
      lookup: (kind, apiVersion) => {
        lookups.push(`${apiVersion}::${kind}`);
        return inner.lookup(kind, apiVersion);
      },
    },
  };
}

function countDirectives(doc: vscode.TextDocument): number {
  return doc
    .getText()
    .split(/\r?\n/)
    .filter((line) => line.startsWith(DIRECTIVE_PREFIX)).length;
}

function ownDiagnostics(provider: DiagnosticsProvider, uri: vscode.Uri): readonly vscode.Diagnostic[] {
  return (provider.collection.get(uri) ?? []).filter((d) => d.source === DIAGNOSTIC_SOURCE);
}

// Refresh a test-owned provider for `name` and return its diagnostics (the activated
// extension publishes to its own collection, which the tests don't assert on).
async function diagnosticsFor(name: string): Promise<{ doc: vscode.TextDocument; diagnostics: vscode.Diagnostic[] }> {
  const doc = await vscode.workspace.openTextDocument(fixtureUri(name));
  const provider = createDiagnosticsProvider();
  try {
    provider.refresh(doc);
    return { doc, diagnostics: [...ownDiagnostics(provider, doc.uri)] };
  } finally {
    provider.dispose();
  }
}

function assertRestoreDiagnostic(diagnostic: vscode.Diagnostic, line: number): void {
  assert.strictEqual(diagnostic.message, RESTORE_DIAGNOSTIC_MESSAGE);
  assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Information);
  assert.strictEqual(diagnostic.source, DIAGNOSTIC_SOURCE);
  assert.strictEqual(diagnostic.code, RESTORE_DIAGNOSTIC_CODE);
  assert.strictEqual(diagnostic.range.start.line, line);
}

async function teardownSettings(): Promise<void> {
  await restoreFluxCatalogSetting();
  await setInsertionMode(undefined);
  await setYamlSchemas(undefined);
}

suite('restore directive: diagnostics', () => {
  setup(disableActivatedFluxCatalog);
  teardown(teardownSettings);

  test('the message and code constants are exactly as specified', () => {
    assert.strictEqual(RESTORE_DIAGNOSTIC_CODE, 'restoreDirective');
    assert.strictEqual(
      RESTORE_DIAGNOSTIC_MESSAGE,
      'Schema is associated via yaml.schemas but the inline directive is missing.'
    );
  });

  test('comment mode, exact-path mapping: restore diagnostic on the start line', async () => {
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-diagnostic.yaml') });
    const { diagnostics } = await diagnosticsFor('restore-diagnostic.yaml');
    assert.strictEqual(diagnostics.length, 1);
    assertRestoreDiagnostic(diagnostics[0], 0);
  });

  test('both mode: same restore diagnostic', async () => {
    await setInsertionMode('both');
    await setYamlSchemas({ [SETTINGS_URL]: [relPath('restore-diagnostic.yaml')] });
    const { diagnostics } = await diagnosticsFor('restore-diagnostic.yaml');
    assert.strictEqual(diagnostics.length, 1);
    assertRestoreDiagnostic(diagnostics[0], 0);
  });

  test('yamlSchemas mode: no diagnostic for the same file', async () => {
    await setInsertionMode('yamlSchemas');
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-diagnostic.yaml') });
    const { diagnostics } = await diagnosticsFor('restore-diagnostic.yaml');
    assert.deepStrictEqual(diagnostics, []);
  });

  test('glob mapping: restore diagnostic published', async () => {
    await setYamlSchemas({ [GLOB_URL]: 'test/fixtures/restore-*.yaml' });
    const { diagnostics } = await diagnosticsFor('restore-diagnostic.yaml');
    assert.strictEqual(diagnostics.length, 1);
    assertRestoreDiagnostic(diagnostics[0], 0);
  });

  test('catch-all URL mapping flags the recognized document', async () => {
    await setYamlSchemas({ [GLOB_URL]: '**/*.yaml' });
    const { diagnostics } = await diagnosticsFor('restore-diagnostic.yaml');
    assert.strictEqual(diagnostics.length, 1);
    assertRestoreDiagnostic(diagnostics[0], 0);
  });

  test('alias-only mapping (kubernetes): no diagnostic, the document stays covered', async () => {
    await setYamlSchemas({ kubernetes: relPath('restore-diagnostic.yaml') });
    const { diagnostics } = await diagnosticsFor('restore-diagnostic.yaml');
    assert.deepStrictEqual(diagnostics, []);
  });

  test('multi-document file: only the document lacking a directive is flagged', async () => {
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-diagnostic-multidoc.yaml') });
    const { doc, diagnostics } = await diagnosticsFor('restore-diagnostic-multidoc.yaml');
    assert.strictEqual(diagnostics.length, 1);
    assertRestoreDiagnostic(diagnostics[0], 6);
    assert.strictEqual(doc.lineAt(6).text, 'apiVersion: kargo.akuity.io/v1alpha1');
  });

  test('unmapped file keeps the existing diagnostic with no code', async () => {
    await setYamlSchemas({ [SETTINGS_URL]: 'somewhere/else/*.yaml' });
    const { diagnostics } = await diagnosticsFor('restore-diagnostic.yaml');
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].message, 'No yaml-language-server schema associated with this Stage.');
    assert.strictEqual(diagnostics[0].code, undefined);
    assert.strictEqual(diagnostics[0].severity, vscode.DiagnosticSeverity.Information);
  });
});

suite('restore directive: quick-fix', () => {
  setup(disableActivatedFluxCatalog);
  teardown(teardownSettings);

  async function restoreDiagnostic(name: string): Promise<{ doc: vscode.TextDocument; diagnostic: vscode.Diagnostic }> {
    const { doc, diagnostics } = await diagnosticsFor(name);
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, RESTORE_DIAGNOSTIC_CODE);
    return { doc, diagnostic: diagnostics[0] };
  }

  async function actionsFor(
    doc: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    triggerKind: vscode.CodeActionTriggerKind,
    catalog: FluxCatalog
  ): Promise<vscode.CodeAction[]> {
    const provider = new SchemaCodeActionProvider(new Map(), catalog);
    return provider.provideCodeActions(doc, diagnostic.range, {
      diagnostics: [diagnostic],
      only: vscode.CodeActionKind.QuickFix,
      triggerKind,
    });
  }

  function assertRestoreAction(action: vscode.CodeAction, doc: vscode.TextDocument, url: string, line: number): void {
    assert.strictEqual(action.title, RESTORE_TITLE);
    assert.ok(action.kind && vscode.CodeActionKind.QuickFix.contains(action.kind));
    assert.strictEqual(action.command, undefined);
    assert.ok(action.edit, 'expected the restore action to carry a WorkspaceEdit');
    const entries = action.edit.entries();
    assert.strictEqual(entries.length, 1);
    const [editUri, textEdits] = entries[0];
    assert.strictEqual(editUri.toString(), doc.uri.toString());
    assert.strictEqual(textEdits.length, 1);
    assert.strictEqual(textEdits[0].newText, `${DIRECTIVE_PREFIX}${url}\n`);
    assert.ok(textEdits[0].range.isEmpty, 'expected a pure insertion');
    assert.strictEqual(textEdits[0].range.start.line, line);
    assert.strictEqual(textEdits[0].range.start.character, 0);
  }

  for (const [label, triggerKind] of [
    ['Invoke', vscode.CodeActionTriggerKind.Invoke],
    ['Automatic', vscode.CodeActionTriggerKind.Automatic],
  ] as const) {
    test(`${label} trigger: one edit-only action, no catalog lookup and no fetch`, async () => {
      await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-diagnostic.yaml') });
      const { doc, diagnostic } = await restoreDiagnostic('restore-diagnostic.yaml');
      const fixture = createFixtureFluxCatalog();
      const { catalog, lookups } = countingCatalog(fixture.catalog);

      const actions = await actionsFor(doc, diagnostic, triggerKind, catalog);

      assert.strictEqual(actions.length, 1);
      assertRestoreAction(actions[0], doc, SETTINGS_URL, 0);
      assert.deepStrictEqual(actions[0].diagnostics, [diagnostic]);
      assert.deepStrictEqual(lookups, []);
      assert.deepStrictEqual(fixture.requestedUrls, []);
    });
  }

  test('exact path and glob both match: the edit carries the exact-path URL', async () => {
    await setYamlSchemas({
      [GLOB_URL]: 'test/fixtures/restore-*.yaml',
      [SETTINGS_URL]: relPath('restore-diagnostic.yaml'),
    });
    const { doc, diagnostic } = await restoreDiagnostic('restore-diagnostic.yaml');

    const actions = await actionsFor(
      doc,
      diagnostic,
      vscode.CodeActionTriggerKind.Invoke,
      createFixtureFluxCatalog().catalog
    );

    assert.strictEqual(actions.length, 1);
    assertRestoreAction(actions[0], doc, SETTINGS_URL, 0);
  });

  test('settings entry removed after the diagnostic was built: no action, no throw', async () => {
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-diagnostic.yaml') });
    const { doc, diagnostic } = await restoreDiagnostic('restore-diagnostic.yaml');
    await setYamlSchemas(undefined);

    const actions = await actionsFor(
      doc,
      diagnostic,
      vscode.CodeActionTriggerKind.Invoke,
      createFixtureFluxCatalog().catalog
    );

    assert.deepStrictEqual(actions, []);
  });

  test('hover path: applying only the edit leaves one directive and no diagnostic, yaml.schemas untouched', async () => {
    const settings = { [SETTINGS_URL]: relPath('restore-quickfix.yaml') };
    await setYamlSchemas(settings);
    const before = currentYamlSchemas();
    const { doc, diagnostic } = await restoreDiagnostic('restore-quickfix.yaml');
    const actions = await actionsFor(
      doc,
      diagnostic,
      vscode.CodeActionTriggerKind.Invoke,
      createFixtureFluxCatalog().catalog
    );
    assert.strictEqual(actions.length, 1);
    assert.ok(actions[0].edit);

    assert.strictEqual(await vscode.workspace.applyEdit(actions[0].edit), true);

    assert.strictEqual(countDirectives(doc), 1);
    assert.strictEqual(doc.lineAt(0).text, `${DIRECTIVE_PREFIX}${SETTINGS_URL}`);
    assert.strictEqual(doc.lineAt(1).text, 'apiVersion: kargo.akuity.io/v1alpha1');
    assert.deepStrictEqual(currentYamlSchemas(), before);
    const provider = createDiagnosticsProvider();
    try {
      provider.refresh(doc);
      assert.deepStrictEqual([...ownDiagnostics(provider, doc.uri)], []);
    } finally {
      provider.dispose();
    }
  });
});

suite('restore directive: insert command', () => {
  setup(disableActivatedFluxCatalog);
  teardown(teardownSettings);

  async function runCommand(name: string): Promise<{
    doc: vscode.TextDocument;
    sessionCache: Map<string, string>;
    lookups: string[];
    requestedUrls: string[];
    prompted: boolean;
  }> {
    const uri = fixtureUri(name);
    const doc = await vscode.workspace.openTextDocument(uri);
    const sessionCache = new Map<string, string>();
    const fixture = createFixtureFluxCatalog();
    const { catalog, lookups } = countingCatalog(fixture.catalog);
    const diagnostics = createDiagnosticsProvider();
    let prompted = false;
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, catalog, {
        promptManualUrl: async () => {
          prompted = true;
          return undefined;
        },
      });
      await handler(uri, 0);
      assert.deepStrictEqual([...ownDiagnostics(diagnostics, uri)], []);
    } finally {
      diagnostics.dispose();
    }
    return { doc, sessionCache, lookups, requestedUrls: fixture.requestedUrls, prompted };
  }

  test('comment mode: inserts the settings URL without catalog, prompt or session cache', async () => {
    await setYamlSchemas({ [SETTINGS_URL]: relPath('restore-command.yaml') });

    const { doc, sessionCache, lookups, requestedUrls, prompted } = await runCommand('restore-command.yaml');

    assert.strictEqual(countDirectives(doc), 1);
    assert.strictEqual(doc.lineAt(0).text, `${DIRECTIVE_PREFIX}${SETTINGS_URL}`);
    assert.strictEqual(doc.lineAt(1).text, 'apiVersion: kargo.akuity.io/v1alpha1');
    assert.deepStrictEqual(lookups, []);
    assert.deepStrictEqual(requestedUrls, []);
    assert.strictEqual(prompted, false);
    assert.strictEqual(sessionCache.size, 0);
  });

  test('both mode: inserts the comment and leaves yaml.schemas exactly as it was', async () => {
    await setInsertionMode('both');
    await setYamlSchemas({ [SETTINGS_URL]: [relPath('restore-command-both-mode.yaml')] });
    const before = JSON.parse(JSON.stringify(currentYamlSchemas()));

    const { doc, sessionCache, lookups, prompted } = await runCommand('restore-command-both-mode.yaml');

    assert.strictEqual(countDirectives(doc), 1);
    assert.strictEqual(doc.lineAt(0).text, `${DIRECTIVE_PREFIX}${SETTINGS_URL}`);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(currentYamlSchemas())), before);
    assert.deepStrictEqual(lookups, []);
    assert.strictEqual(prompted, false);
    assert.strictEqual(sessionCache.size, 0);
  });
});
