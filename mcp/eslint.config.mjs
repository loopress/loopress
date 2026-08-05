import {includeIgnoreFile} from '@eslint/compat'
import node from '@loopress/eslint-config/node'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [
  includeIgnoreFile(gitignorePath),
  {ignores: ['dist/**']},
  ...node,
  prettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts'],
        },
      },
    },
  },
  {
    rules: {
      // package.json's `bin` field points at the compiled dist/server.js, not this source
      // file, so the rule can't see that the shebang is required for the packaged binary.
      'n/hashbang': 'off',
      // eslint-plugin-n's export-map resolver doesn't handle @modelcontextprotocol/sdk's
      // wildcard subpath export ("./*" -> "./dist/esm/*"): it flags server/mcp.js and
      // server/stdio.js as missing even though they resolve correctly (tsc agrees, and the
      // server runs).
      'n/no-missing-import': 'off',
    },
  },
]
