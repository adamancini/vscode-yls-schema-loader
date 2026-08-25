import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  // Open the repo root as the workspace (not test/fixtures) so vscode.workspace.asRelativePath
  // resolves fixture paths as `test/fixtures/<file>`, matching what a real user's workspace-root
  // relative path would look like and what applySchema.ts/coverageCheck.ts expect.
  workspaceFolder: '.',
  // A deeply nested project path (e.g. under .claude/worktrees/<name>) can push the
  // default --user-data-dir past macOS's ~103-char unix socket path limit, crashing
  // VS Code with EINVAL on its IPC handle. Force a short, fixed user-data-dir instead.
  launchArgs: ['--user-data-dir=/tmp/yls-schema-loader-vscode-test-user-data'],
  mocha: {
    ui: 'tdd',
  },
});
