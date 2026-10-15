// Existing browser modules are untyped; lint correctness without imposing a formatting migration.
import globals from 'globals';

export default [
  {
    files: ['js/**/*.js', 'tools/write_public_config.mjs', 'tests/config.test.mjs', 'tests/chart-refactor.test.mjs', 'tests/quality-browser.mjs', 'tests/design-system-browser.mjs', 'tests/legend-browser.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node, Tesseract: 'readonly' } },
    rules: {
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-unreachable': 'error',
      'valid-typeof': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },
  { files: ['tools/*.mjs', 'tests/*browser.mjs'], rules: { 'no-console': 'off' } }
];
