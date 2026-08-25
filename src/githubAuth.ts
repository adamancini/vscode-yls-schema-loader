import * as vscode from 'vscode';

export async function getGithubAuthToken(): Promise<string | undefined> {
  try {
    // No scopes requested: this only reads public repo contents and public code search,
    // neither of which is scope-gated -- an authenticated session just raises the rate
    // limit tier. `silent: true` means this never adds a sign-in nag to the Accounts menu;
    // `createIfNone: false` means it never prompts either. If the user has no GitHub
    // session at all, this quietly returns undefined and callers fall back to
    // unauthenticated (lower rate limit) requests.
    const session = await vscode.authentication.getSession('github', [], { createIfNone: false, silent: true });
    return session?.accessToken;
  } catch {
    return undefined;
  }
}
