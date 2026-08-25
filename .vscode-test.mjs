import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: 'test/fixtures',
  // A deeply nested project path (e.g. under .claude/worktrees/<name>) can push the
  // default --user-data-dir past macOS's ~103-char unix socket path limit, crashing
  // VS Code with EINVAL on its IPC handle. Force a short, fixed user-data-dir instead.
  launchArgs: ['--user-data-dir=/tmp/yls-schema-loader-vscode-test-user-data'],
  mocha: {
    ui: 'tdd',
  },
});
