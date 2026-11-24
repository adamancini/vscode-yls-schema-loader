import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE, RESTORE_DIAGNOSTIC_CODE } from './diagnosticsProvider';
import { INSERT_SCHEMA_COMMAND } from './commandIds';
import { parseKindApiVersions } from './lib/yamlDocParser';
import { resolveSchema, ResolverDeps, DIRECT_APPLY_SOURCES } from './lib/resolver';
import { FluxCatalog } from './lib/fluxCatalog';
import { buildSchemaCommentEdit, insertionModeWritesComment } from './applySchema';
import { settingsSchemaUrl } from './lib/coverageCheck';
import { getAdditionalMappings, getInsertionMode, getYamlSchemas } from './settings';

const ACTION_TITLE = 'Insert yaml-language-server schema';
const RESTORE_ACTION_TITLE = 'Restore yaml-language-server schema directive';

export class SchemaCodeActionProvider implements vscode.CodeActionProvider {
  constructor(
    private readonly sessionCache: Map<string, string>,
    private readonly fluxCatalog: FluxCatalog
  ) {}

  async provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    const diagnostics = context.diagnostics.filter((diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE);
    const actions = await Promise.all(
      diagnostics.map((diagnostic) =>
        diagnostic.code === RESTORE_DIAGNOSTIC_CODE
          ? createRestoreAction(document, diagnostic)
          : this.createAction(document, diagnostic, context.triggerKind)
      )
    );
    return actions.filter((action): action is vscode.CodeAction => action !== undefined);
  }

  private async createAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    triggerKind: vscode.CodeActionTriggerKind
  ): Promise<vscode.CodeAction> {
    const startLine = diagnostic.range.start.line;
    const action = new vscode.CodeAction(ACTION_TITLE, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.command = { command: INSERT_SCHEMA_COMMAND, title: ACTION_TITLE, arguments: [document.uri, startLine] };

    // The diagnostic hover's "Quick Fix..." menu applies CodeAction.edit but never runs
    // CodeAction.command, so an explicitly requested (Invoke) quick-fix carries the comment
    // as an edit too. Automatic requests fire on cursor moves and lightbulb display; resolution
    // can reach the network (the catalog index fetch), so those stay command-only.
    if (triggerKind !== vscode.CodeActionTriggerKind.Invoke) {
      return action;
    }
    const insertionMode = getInsertionMode();
    if (!insertionModeWritesComment(insertionMode)) {
      return action;
    }
    const url = await this.resolveUrl(document, startLine);
    if (url === undefined) {
      return action;
    }
    action.edit = buildSchemaCommentEdit(document.uri, startLine, url);
    // The command still runs on the lightbulb path (edit first, then command); tell it the
    // comment is already in place so it only does the rest (yaml.schemas, session cache).
    action.command = {
      command: INSERT_SCHEMA_COMMAND,
      title: ACTION_TITLE,
      arguments: [document.uri, startLine, url, true],
    };
    return action;
  }

  // The URL a direct-apply source resolves to, or undefined when the document is gone,
  // unresolved, or resolution fails (a failure falls back to the command-only action).
  private async resolveUrl(document: vscode.TextDocument, startLine: number): Promise<string | undefined> {
    try {
      const target = parseKindApiVersions(document.getText()).find((d) => d.startLine === startLine);
      if (!target) {
        return undefined;
      }
      const deps: ResolverDeps = {
        overrideEntries: getAdditionalMappings(),
        lookupFluxCatalog: (kind, apiVersion) => this.fluxCatalog.lookup(kind, apiVersion),
        sessionCache: this.sessionCache,
      };
      const resolution = await resolveSchema(target.kind, target.apiVersion, deps);
      return DIRECT_APPLY_SOURCES.has(resolution.source) && 'url' in resolution ? resolution.url : undefined;
    } catch {
      return undefined;
    }
  }
}

// The restore URL comes straight from yaml.schemas, so the edit is local and cheap on every
// trigger kind: no resolution, no catalog, no command (the hover menu would drop it anyway).
// Undefined when settings no longer map the file to a usable URL.
function createRestoreAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic
): vscode.CodeAction | undefined {
  const url = settingsSchemaUrl(vscode.workspace.asRelativePath(document.uri, false), getYamlSchemas());
  if (url === undefined) {
    return undefined;
  }
  const action = new vscode.CodeAction(RESTORE_ACTION_TITLE, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.edit = buildSchemaCommentEdit(document.uri, diagnostic.range.start.line, url);
  return action;
}
