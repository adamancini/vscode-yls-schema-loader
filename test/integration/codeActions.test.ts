import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { SchemaCodeActionProvider } from '../../src/codeActionsProvider';
import { DIAGNOSTIC_SOURCE } from '../../src/diagnosticsProvider';
import { INSERT_SCHEMA_COMMAND } from '../../src/commandIds';
import {
  clearAdditionalMappings,
  disableActivatedFluxCatalog,
  restoreFluxCatalogSetting,
  setStageOverride,
  waitFor,
} from './testUtils';

const OVERRIDE_STAGE_SCHEMA_URL = 'https://override.example.com/stage.json';

suite('SchemaCodeActionProvider', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

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
    // Compare the URI by its string form (not deepStrictEqual on the vscode.Uri object):
    // vscode.workspace.openTextDocument returns a document whose .uri is a distinct Uri
    // instance from the one used to open it, and VS Code's core eagerly computes/caches
    // that instance's private _fsPath field as a side effect of opening the document. A
    // deepStrictEqual against the freshly-parsed local `uri` (whose _fsPath cache is still
    // unset) would fail on that private implementation detail even though both Uris are
    // semantically identical.
    assert.strictEqual(actions[0].command?.arguments?.[0]?.toString(), uri.toString());
    assert.strictEqual(actions[0].command?.arguments?.[1], 0);
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

suite('SchemaCodeActionProvider (registered, headless)', () => {
  setup(disableActivatedFluxCatalog);
  teardown(restoreFluxCatalogSetting);

  test('vscode.executeCodeActionProvider returns the insert-schema quick-fix for the uncovered fixture', async () => {
    const uri = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'uncovered.yaml'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc);
    await waitFor(() => vscode.languages.getDiagnostics(uri).some((d) => d.source === DIAGNOSTIC_SOURCE));
    const range = new vscode.Range(0, 0, Math.min(3, doc.lineCount - 1), 0);
    const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
      'vscode.executeCodeActionProvider',
      uri,
      range
    );
    assert.ok(
      actions?.some((action) => action.title === 'Insert yaml-language-server schema'),
      'expected a code action titled "Insert yaml-language-server schema"'
    );
  });
});

suite('insertSchemaForCurrentDocument command', () => {
  setup(async () => {
    await disableActivatedFluxCatalog();
    await setStageOverride(OVERRIDE_STAGE_SCHEMA_URL);
  });
  teardown(async () => {
    await restoreFluxCatalogSetting();
    await clearAdditionalMappings();
  });

  test('resolves the document under the cursor', async () => {
    const uri = vscode.Uri.file(
      path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'current-document-command.yaml')
    );
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(1, 0, 1, 0);
    await vscode.commands.executeCommand('ylsSchemaLoader.insertSchemaForCurrentDocument');
    const expectedLine = `# yaml-language-server: $schema=${OVERRIDE_STAGE_SCHEMA_URL}`;
    await waitFor(() => doc.lineAt(0).text === expectedLine);
    assert.strictEqual(doc.lineAt(0).text, expectedLine);
  });
});
