import * as vscode from 'vscode';

export async function getGithubAuthToken(): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
    return session?.accessToken;
  } catch {
    return undefined;
  }
}
