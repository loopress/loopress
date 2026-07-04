import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  {ignores: ['dist/**', 'src/types/*.generated.ts']},
  ...oclif,
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
