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
