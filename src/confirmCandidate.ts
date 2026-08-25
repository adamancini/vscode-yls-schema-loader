import * as vscode from 'vscode';
import { GithubCandidate } from './lib/githubDiscovery';

interface CandidateQuickPickItem extends vscode.QuickPickItem {
  candidate: GithubCandidate;
}

export interface ConfirmCandidateUi {
  showInformationMessage: (message: string, options: vscode.MessageOptions, item: string) => Thenable<string | undefined>;
  showQuickPick: (
    items: CandidateQuickPickItem[],
    options: vscode.QuickPickOptions
  ) => Thenable<CandidateQuickPickItem | undefined>;
}

const defaultUi: ConfirmCandidateUi = {
  showInformationMessage: (message, options, item) => vscode.window.showInformationMessage(message, options, item),
  showQuickPick: (items, options) => vscode.window.showQuickPick(items, options),
};

export async function confirmGithubCandidate(
  candidates: GithubCandidate[],
  ui: ConfirmCandidateUi = defaultUi
): Promise<GithubCandidate | undefined> {
  if (candidates.length === 1) {
    const candidate = candidates[0];
    const choice = await ui.showInformationMessage(
      'Use this schema for this document?',
      { modal: true, detail: `${candidate.description}\n${candidate.url}` },
      'Use this schema'
    );
    return choice === 'Use this schema' ? candidate : undefined;
  }
  const picked = await ui.showQuickPick(
    candidates.map((candidate) => ({ label: candidate.description, detail: candidate.url, candidate })),
    { placeHolder: 'Multiple possible schemas found — choose one, or press Escape to cancel' }
  );
  return picked?.candidate;
}
