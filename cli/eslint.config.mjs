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
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-await-in-loop': 'off',
      'unicorn/no-useless-switch-case': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'perfectionist/sort-objects': 'off',
    },
  },
]
