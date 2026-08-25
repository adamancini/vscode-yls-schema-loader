const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', '.vscode-test/**', '*.vsix'],
  },
  js.configs.recommended,
  {
    // Plain Node scripts (build config) -- not part of the TS project, so no
    // type-aware parsing here.
    files: ['*.js'],
    languageOptions: {
      globals: { require: 'readonly', module: 'readonly', process: 'readonly', console: 'readonly' },
    },
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // Common in this codebase: an intentionally-ignored destructured field or callback
      // parameter (e.g. a stub UI function in a test that doesn't use one of its args).
      // Warn, don't error, and allow a leading underscore to explicitly mark it.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  eslintConfigPrettier
);
