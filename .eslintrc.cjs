// Minimal ESLint baseline (2026-09-05) — catches real bugs (undefined
// vars, unreachable code, hook rule violations) without imposing a
// stylistic rewrite on the existing codebase. Intentionally lenient on
// style (no prop-types, no forced prettier) so this doesn't generate
// thousands of pre-existing-code warnings on day one.
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
}
