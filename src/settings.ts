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

export function getEnableFluxCatalog(): boolean {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<boolean>('enableFluxCatalog', true);
}

export function getAutoInsert(): boolean {
  return vscode.workspace.getConfiguration('ylsSchemaLoader').get<boolean>('autoInsert', false);
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
