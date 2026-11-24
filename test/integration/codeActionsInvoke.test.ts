import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { SchemaCodeActionProvider } from '../../src/codeActionsProvider';
import { createDiagnosticsProvider, DIAGNOSTIC_SOURCE } from '../../src/diagnosticsProvider';
import { INSERT_SCHEMA_COMMAND } from '../../src/commandIds';
import { createInsertSchemaCommandHandler } from '../../src/insertSchemaCommand';
import { FluxCatalog } from '../../src/lib/fluxCatalog';
import { createFixtureFluxCatalog, disableActivatedFluxCatalog, restoreFluxCatalogSetting } from './testUtils';

// The diagnostic hover's "Quick Fix..." menu applies CodeAction.edit but drops
// CodeAction.command, so on an explicit (Invoke) request the provider must attach the
// schema comment as an edit. Automatic requests (cursor moves, lightbulb display) must stay
// local-only: no resolution, no catalog lookup, no fetch.

const STAGE_CATALOG_URL = 'https://schemas.fluxoperator.dev/catalog/kargo.akuity.io/stage_v1alpha1.json';
const STAGE_COMMENT = `# yaml-language-server: $schema=${STAGE_CATALOG_URL}`;

// Two documents: a ConfigMap first, then the Stage starting at line 5, so a wrong insert
// position (line 0) is distinguishable from the right one.
const MULTI_DOC_STAGE = [
  'apiVersion: v1',
  'kind: ConfigMap',
  'metadata:',
  '  name: first',
  '---',
  'apiVersion: kargo.akuity.io/v1alpha1',
  'kind: Stage',
  'metadata:',
  '  name: second',
  '',
].join('\n');
const STAGE_START_LINE = 5;

const UNRESOLVED_WIDGET = ['apiVersion: widgets.example.com/v1', 'kind: Widget', 'metadata:', '  name: w', ''].join(
  '\n'
);

function fixtureUri(name: string): vscode.Uri {
  return vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', name));
}

async function openYaml(content: string): Promise<vscode.TextDocument> {
  return vscode.workspace.openTextDocument({ language: 'yaml', content });
}

function schemaDiagnostic(line: number): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(line, 0, line, 1),
    'No yaml-language-server schema associated with this document.',
    vscode.DiagnosticSeverity.Information
  );
  diagnostic.source = DIAGNOSTIC_SOURCE;
  return diagnostic;
}

function context(diagnostic: vscode.Diagnostic, triggerKind: vscode.CodeActionTriggerKind): vscode.CodeActionContext {
  return { diagnostics: [diagnostic], only: vscode.CodeActionKind.QuickFix, triggerKind };
}

// Wraps a catalog to count lookup() calls, so a test can prove no lookup happened at all
// (not just that no fetch was needed because the index was already cached).
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

function countSchemaComments(doc: vscode.TextDocument): number {
  return doc
    .getText()
    .split(/\r?\n/)
    .filter((line) => line.startsWith('# yaml-language-server: $schema=')).length;
}

async function setInsertionMode(mode: string | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('ylsSchemaLoader')
    .update('insertionMode', mode, vscode.ConfigurationTarget.Workspace);
}

suite('SchemaCodeActionProvider: Invoke trigger attaches the schema edit', () => {
  setup(disableActivatedFluxCatalog);
  teardown(async () => {
    await restoreFluxCatalogSetting();
    await setInsertionMode(undefined);
  });

  test('a resolvable kind in comment mode gets an edit inserting exactly the schema comment at its startLine', async () => {
    const doc = await openYaml(MULTI_DOC_STAGE);
    const diagnostic = schemaDiagnostic(STAGE_START_LINE);
    const provider = new SchemaCodeActionProvider(new Map(), createFixtureFluxCatalog().catalog);

    const actions = await provider.provideCodeActions(
      doc,
      diagnostic.range,
      context(diagnostic, vscode.CodeActionTriggerKind.Invoke)
    );

    assert.strictEqual(actions.length, 1);
    const action = actions[0];
    assert.deepStrictEqual(action.diagnostics, [diagnostic]);
    assert.ok(action.edit, 'expected the action to carry a WorkspaceEdit');
    const entries = action.edit.entries();
    assert.strictEqual(entries.length, 1);
    const [editUri, textEdits] = entries[0];
    assert.strictEqual(editUri.toString(), doc.uri.toString());
    assert.strictEqual(textEdits.length, 1);
    assert.strictEqual(textEdits[0].newText, `${STAGE_COMMENT}\n`);
    assert.ok(textEdits[0].range.isEmpty, 'expected a pure insertion');
    assert.strictEqual(textEdits[0].range.start.line, STAGE_START_LINE);
    assert.strictEqual(textEdits[0].range.start.character, 0);

    assert.strictEqual(action.command?.command, INSERT_SCHEMA_COMMAND);
    const args = action.command?.arguments ?? [];
    assert.strictEqual(args[0]?.toString(), doc.uri.toString());
    assert.strictEqual(args[1], STAGE_START_LINE);
    assert.strictEqual(args[2], STAGE_CATALOG_URL);
    assert.strictEqual(args[3], true);
  });

  test('a session-cache hit also attaches the edit in both mode, with no fetch', async () => {
    await setInsertionMode('both');
    const doc = await openYaml(MULTI_DOC_STAGE);
    const diagnostic = schemaDiagnostic(STAGE_START_LINE);
    const sessionCache = new Map([['kargo.akuity.io/v1alpha1::Stage', 'https://cached.example.com/stage.json']]);
    const { catalog, requestedUrls } = createFixtureFluxCatalog(false);
    const provider = new SchemaCodeActionProvider(sessionCache, catalog);

    const actions = await provider.provideCodeActions(
      doc,
      diagnostic.range,
      context(diagnostic, vscode.CodeActionTriggerKind.Invoke)
    );

    assert.strictEqual(actions.length, 1);
    const textEdits = actions[0].edit?.get(doc.uri) ?? [];
    assert.strictEqual(textEdits.length, 1);
    assert.strictEqual(textEdits[0].newText, '# yaml-language-server: $schema=https://cached.example.com/stage.json\n');
    assert.strictEqual(actions[0].command?.arguments?.[2], 'https://cached.example.com/stage.json');
    assert.strictEqual(actions[0].command?.arguments?.[3], true);
    assert.deepStrictEqual(requestedUrls, []);
  });

  test('an unresolved kind gets no edit and the command is unchanged', async () => {
    const doc = await openYaml(UNRESOLVED_WIDGET);
    const diagnostic = schemaDiagnostic(0);
    const provider = new SchemaCodeActionProvider(new Map(), createFixtureFluxCatalog().catalog);

    const actions = await provider.provideCodeActions(
      doc,
      diagnostic.range,
      context(diagnostic, vscode.CodeActionTriggerKind.Invoke)
    );

    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].edit, undefined);
    assert.strictEqual(actions[0].command?.command, INSERT_SCHEMA_COMMAND);
    const args = actions[0].command?.arguments ?? [];
    assert.strictEqual(args.length, 2);
    assert.strictEqual(args[0]?.toString(), doc.uri.toString());
    assert.strictEqual(args[1], 0);
  });

  test('insertionMode yamlSchemas gets no edit and the command is unchanged', async () => {
    await setInsertionMode('yamlSchemas');
    const doc = await openYaml(MULTI_DOC_STAGE);
    const diagnostic = schemaDiagnostic(STAGE_START_LINE);
    const provider = new SchemaCodeActionProvider(new Map(), createFixtureFluxCatalog().catalog);

    const actions = await provider.provideCodeActions(
      doc,
      diagnostic.range,
      context(diagnostic, vscode.CodeActionTriggerKind.Invoke)
    );

    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].edit, undefined);
    const args = actions[0].command?.arguments ?? [];
    assert.strictEqual(args.length, 2);
    assert.strictEqual(args[1], STAGE_START_LINE);
  });

  test('a catalog that throws falls back to the command-only action instead of rejecting', async () => {
    const doc = await openYaml(MULTI_DOC_STAGE);
    const diagnostic = schemaDiagnostic(STAGE_START_LINE);
    const throwingCatalog: FluxCatalog = {
      lookup: async () => {
        throw new Error('boom');
      },
    };
    const provider = new SchemaCodeActionProvider(new Map(), throwingCatalog);

    const actions = await provider.provideCodeActions(
      doc,
      diagnostic.range,
      context(diagnostic, vscode.CodeActionTriggerKind.Invoke)
    );

    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].edit, undefined);
    assert.strictEqual(actions[0].command?.arguments?.length, 2);
  });
});

suite('SchemaCodeActionProvider: Automatic trigger stays local-only', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('no edit, no catalog lookup and no fetch for an Automatic request', async () => {
    const doc = await openYaml(MULTI_DOC_STAGE);
    const diagnostic = schemaDiagnostic(STAGE_START_LINE);
    const fixture = createFixtureFluxCatalog();
    const { catalog, lookups } = countingCatalog(fixture.catalog);
    const provider = new SchemaCodeActionProvider(new Map(), catalog);

    const actions = await provider.provideCodeActions(
      doc,
      diagnostic.range,
      context(diagnostic, vscode.CodeActionTriggerKind.Automatic)
    );

    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].edit, undefined);
    assert.strictEqual(actions[0].command?.command, INSERT_SCHEMA_COMMAND);
    assert.strictEqual(actions[0].command?.arguments?.length, 2);
    assert.strictEqual(actions[0].command?.arguments?.[1], STAGE_START_LINE);
    assert.deepStrictEqual(lookups, []);
    assert.deepStrictEqual(fixture.requestedUrls, []);
  });
});

suite('insertSchema command: comment already inserted by the code action edit', () => {
  setup(disableActivatedFluxCatalog);
  teardown(async () => {
    await restoreFluxCatalogSetting();
    await setInsertionMode(undefined);
    await vscode.workspace.getConfiguration('yaml').update('schemas', undefined, vscode.ConfigurationTarget.Workspace);
  });

  test('comment mode: no duplicate comment, session cache updated, no prompt, no re-resolution', async () => {
    const doc = await openYaml(MULTI_DOC_STAGE);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(STAGE_START_LINE, 0), `${STAGE_COMMENT}\n`);
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    const { catalog, lookups } = countingCatalog(createFixtureFluxCatalog().catalog);
    let prompted = false;
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, catalog, {
        promptManualUrl: async () => {
          prompted = true;
          return undefined;
        },
      });
      await handler(doc.uri, STAGE_START_LINE, STAGE_CATALOG_URL, true);

      assert.strictEqual(countSchemaComments(doc), 1);
      assert.strictEqual(doc.lineAt(STAGE_START_LINE).text, STAGE_COMMENT);
      assert.strictEqual(doc.lineAt(STAGE_START_LINE + 1).text, 'apiVersion: kargo.akuity.io/v1alpha1');
      assert.strictEqual(sessionCache.get('kargo.akuity.io/v1alpha1::Stage'), STAGE_CATALOG_URL);
      assert.strictEqual(prompted, false);
      assert.deepStrictEqual(lookups, []);
    } finally {
      diagnostics.dispose();
    }
  });

  test('both mode: no duplicate comment and yaml.schemas still updated', async () => {
    await setInsertionMode('both');
    const uri = fixtureUri('code-action-both-mode.yaml');
    const doc = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(0, 0), `${STAGE_COMMENT}\n`);
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);

    const sessionCache = new Map<string, string>();
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, createFixtureFluxCatalog().catalog, {
        promptManualUrl: async () => undefined,
      });
      await handler(uri, 0, STAGE_CATALOG_URL, true);

      assert.strictEqual(countSchemaComments(doc), 1);
      assert.strictEqual(doc.lineAt(0).text, STAGE_COMMENT);
      assert.strictEqual(sessionCache.get('kargo.akuity.io/v1alpha1::Stage'), STAGE_CATALOG_URL);
      const schemas = vscode.workspace.getConfiguration('yaml').get<Record<string, string[]>>('schemas', {});
      assert.ok(schemas[STAGE_CATALOG_URL]?.includes('test/fixtures/code-action-both-mode.yaml'));
    } finally {
      diagnostics.dispose();
    }
  });
});

suite('Quick fix end to end: hover path (edit only) and lightbulb path (edit + command)', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  async function invokeAction(
    doc: vscode.TextDocument,
    sessionCache: Map<string, string>,
    catalog: FluxCatalog
  ): Promise<vscode.CodeAction> {
    const diagnostic = schemaDiagnostic(STAGE_START_LINE);
    const provider = new SchemaCodeActionProvider(sessionCache, catalog);
    const actions = await provider.provideCodeActions(
      doc,
      diagnostic.range,
      context(diagnostic, vscode.CodeActionTriggerKind.Invoke)
    );
    assert.strictEqual(actions.length, 1);
    return actions[0];
  }

  test('applying only the edit (hover menu) inserts the comment above the right document', async () => {
    const doc = await openYaml(MULTI_DOC_STAGE);
    const action = await invokeAction(doc, new Map(), createFixtureFluxCatalog().catalog);
    assert.ok(action.edit);

    assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);

    assert.strictEqual(countSchemaComments(doc), 1);
    assert.strictEqual(doc.lineAt(STAGE_START_LINE).text, STAGE_COMMENT);
    assert.strictEqual(doc.lineAt(STAGE_START_LINE - 1).text, '---');
    assert.strictEqual(doc.lineAt(STAGE_START_LINE + 1).text, 'apiVersion: kargo.akuity.io/v1alpha1');
  });

  test('applying the edit then running the command with its arguments (lightbulb) leaves exactly one comment', async () => {
    const doc = await openYaml(MULTI_DOC_STAGE);
    const sessionCache = new Map<string, string>();
    const { catalog } = createFixtureFluxCatalog();
    const action = await invokeAction(doc, sessionCache, catalog);
    assert.ok(action.edit);
    assert.ok(action.command);

    assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);
    const diagnostics = createDiagnosticsProvider();
    try {
      const handler = createInsertSchemaCommandHandler(sessionCache, diagnostics, catalog, {
        promptManualUrl: async () => {
          throw new Error('the manual-URL prompt must not be shown');
        },
      });
      const args = action.command.arguments ?? [];
      await handler(args[0], args[1], args[2], args[3]);

      assert.strictEqual(countSchemaComments(doc), 1);
      assert.strictEqual(doc.lineAt(STAGE_START_LINE).text, STAGE_COMMENT);
      assert.strictEqual(doc.lineAt(STAGE_START_LINE + 1).text, 'apiVersion: kargo.akuity.io/v1alpha1');
      assert.strictEqual(doc.lineAt(0).text, 'apiVersion: v1');
      assert.strictEqual(sessionCache.get('kargo.akuity.io/v1alpha1::Stage'), STAGE_CATALOG_URL);
    } finally {
      diagnostics.dispose();
    }
  });

  test('the registered command, run with the action arguments after the edit, leaves exactly one comment', async () => {
    const doc = await openYaml(MULTI_DOC_STAGE);
    const action = await invokeAction(doc, new Map(), createFixtureFluxCatalog().catalog);
    assert.ok(action.edit);
    assert.ok(action.command);

    assert.strictEqual(await vscode.workspace.applyEdit(action.edit), true);
    await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments ?? []));

    assert.strictEqual(countSchemaComments(doc), 1);
    assert.strictEqual(doc.lineAt(STAGE_START_LINE).text, STAGE_COMMENT);
  });
});
