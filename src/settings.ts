import * as vscode from 'vscode';
import { MappingEntry } from './lib/resolver';
import { YamlSchemasSetting } from './lib/coverageCheck';

export type InsertionMode = 'comment' | 'yamlSchemas' | 'both';

export function getInsertionMode(): InsertionMode {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<InsertionMode>('insertionMode', 'comment');
}

export function getEnableFluxCatalog(): boolean {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<boolean>('enableFluxCatalog', true);
}

export function getAutoInsert(): boolean {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<boolean>('autoInsert', false);
}

export function getAdditionalMappings(): MappingEntry[] {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<MappingEntry[]>('additionalMappings', []);
}

export function getYamlSchemas(): YamlSchemasSetting {
  return vscode.workspace.getConfiguration('yaml').get<YamlSchemasSetting>('schemas', {});
}
