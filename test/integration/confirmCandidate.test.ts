import * as assert from 'assert';
import * as vscode from 'vscode';
import { confirmGithubCandidate, ConfirmCandidateUi } from '../../src/confirmCandidate';
import { GithubCandidate } from '../../src/lib/githubDiscovery';

suite('confirmGithubCandidate', () => {
  test('single candidate: returns it when the user accepts the modal', async () => {
    const candidate: GithubCandidate = { url: 'https://example.com/schema.json', description: 'org/repo: path' };
    const ui: ConfirmCandidateUi = {
      showInformationMessage: async () => 'Use this schema',
      showQuickPick: async () => undefined,
    };
    const result = await confirmGithubCandidate([candidate], ui);
    assert.deepStrictEqual(result, candidate);
  });

  test('single candidate: returns undefined when the user dismisses the modal', async () => {
    const candidate: GithubCandidate = { url: 'https://example.com/schema.json', description: 'org/repo: path' };
    const ui: ConfirmCandidateUi = {
      showInformationMessage: async () => undefined,
      showQuickPick: async () => undefined,
    };
    const result = await confirmGithubCandidate([candidate], ui);
    assert.strictEqual(result, undefined);
  });

  test('single candidate: the modal shows the description and URL as detail', async () => {
    const candidate: GithubCandidate = { url: 'https://example.com/schema.json', description: 'org/repo: path' };
    let capturedOptions: vscode.MessageOptions | undefined;
    const ui: ConfirmCandidateUi = {
      showInformationMessage: async (_message, options) => {
        capturedOptions = options;
        return undefined;
      },
      showQuickPick: async () => undefined,
    };
    await confirmGithubCandidate([candidate], ui);
    assert.ok(capturedOptions?.detail?.includes(candidate.description));
    assert.ok(capturedOptions?.detail?.includes(candidate.url));
  });

  test('multiple candidates: shows a quick pick and returns the chosen one', async () => {
    const candidateA: GithubCandidate = { url: 'https://example.com/a.json', description: 'org/repo: a' };
    const candidateB: GithubCandidate = { url: 'https://example.com/b.json', description: 'org/repo: b' };
    const ui: ConfirmCandidateUi = {
      showInformationMessage: async () => undefined,
      showQuickPick: async (items) => items.find((item) => item.candidate === candidateB),
    };
    const result = await confirmGithubCandidate([candidateA, candidateB], ui);
    assert.deepStrictEqual(result, candidateB);
  });

  test('multiple candidates: returns undefined when the quick pick is dismissed', async () => {
    const candidateA: GithubCandidate = { url: 'https://example.com/a.json', description: 'org/repo: a' };
    const candidateB: GithubCandidate = { url: 'https://example.com/b.json', description: 'org/repo: b' };
    const ui: ConfirmCandidateUi = {
      showInformationMessage: async () => undefined,
      showQuickPick: async () => undefined,
    };
    const result = await confirmGithubCandidate([candidateA, candidateB], ui);
    assert.strictEqual(result, undefined);
  });

  test('multiple candidates: quick pick items carry the URL as detail', async () => {
    const candidateA: GithubCandidate = { url: 'https://example.com/a.json', description: 'org/repo: a' };
    let capturedItems: { label: string; detail?: string }[] = [];
    const ui: ConfirmCandidateUi = {
      showInformationMessage: async () => undefined,
      showQuickPick: async (items) => {
        capturedItems = items;
        return undefined;
      },
    };
    await confirmGithubCandidate([candidateA, candidateA], ui);
    assert.strictEqual(capturedItems[0]?.detail, candidateA.url);
  });
});
