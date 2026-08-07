import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  {ignores: ['dist/**', 'tmp/**', 'src/types/*.generated.ts']},
  // ponytail: eslint-plugin-mocha v10 (pinned by eslint-config-oclif) crashes on ESLint 10,
  // drop this filter once eslint-config-oclif ships eslint-plugin-mocha v11
  ...oclif.filter((config) => config.name !== 'mocha/recommended'),
  prettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['vitest.config.ts', 'scripts/*.ts'],
        },
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-await-in-loop': 'off',
      'unicorn/no-useless-switch-case': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'perfectionist/sort-objects': 'off',
      // Companions to no-explicit-any above: same call, any is unsafe by design once allowed.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Idiomatic no-op patterns (fire-and-forget `.catch(() => {})`, mock stubs) shouldn't error.
      '@typescript-eslint/no-empty-function': ['error', {allow: ['arrowFunctions', 'asyncMethods']}],
      // eslint-config-oclif's own override (`styles: {'node:path': {named: true}}`) is silently
      // ineffective against the newer eslint-plugin-unicorn pulled in by eslint-config-xo, so
      // named imports for node builtins ("import {join} from 'node:path'") still get flagged.
      'unicorn/import-style': 'off',
      // Wants private helpers declared before the public methods that call them, which directly
      // contradicts oclif's own perfectionist/sort-classes group order (public methods before
      // private ones). Can't satisfy both at once.
      'unicorn/consistent-class-member-order': 'off',
      // Autofix suggests Array#toSorted()/toReversed(), Node 20+ only; package.json declares
      // engines >= 18.
      'unicorn/no-array-sort': 'off',
      // xo pins requireFlag: 'v' (Node 20+ RegExp unicodeSets); package.json declares engines >= 18.
      'require-unicode-regexp': 'off',
      // Flags established, unambiguous names (dryRun mirrors the --dry-run flag, disabled/active
      // match the API's own field names).
      'unicorn/consistent-boolean-name': 'off',
    },
  },
]
