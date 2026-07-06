import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

// Every package under packages/* lints itself (see cli/eslint.config.mjs, etc.); this root
// config only covers e2e/, the one thing that lives outside all of them.
export default [
  includeIgnoreFile(gitignorePath),
  {ignores: ['**/*', '!e2e/**']},
  ...oclif,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'perfectionist/sort-objects': 'off',
      // `test` is re-exported from `@playwright/test` via helpers/environment.js, not a
      // global; the mocha plugin doesn't trace that re-export back to a known test framework.
      'mocha/no-global-tests': 'off',
      // Playwright fixture functions are `async ({depA, depB}, use) => ...`; a fixture with
      // no dependencies is legitimately `async ({}, use) => ...`, which these two rules
      // otherwise flag as a mistake.
      'no-empty-pattern': 'off',
      'object-shorthand': 'off',
    },
  },
]
