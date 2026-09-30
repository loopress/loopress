import vitest from '@vitest/eslint-plugin'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import sonarjs from 'eslint-plugin-sonarjs'
import {defineConfig, globalIgnores, includeIgnoreFile} from 'eslint/config'
import {fileURLToPath} from 'node:url'

const gitignorePath = fileURLToPath(new URL('.gitignore', import.meta.url))

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  globalIgnores(['dist/**', 'tmp/**', 'src/types/*.generated.ts', 'demo/**']),
  // ponytail: eslint-plugin-mocha v10 (pinned by eslint-config-oclif) crashes on ESLint 10,
  // drop this filter once eslint-config-oclif ships eslint-plugin-mocha v11
  ...oclif.filter((config) => config.name !== 'mocha/recommended'),
  sonarjs.configs.recommended,
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
      'no-await-in-loop': 'off',
      'perfectionist/sort-objects': 'off',
      // Every oclif Command subclass declares `static description`/`static flags`/`static args`
      // plain (never `readonly`) by framework convention; flagging all of them is just noise.
      'sonarjs/public-static-readonly': 'off',
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
      // xo pins requireFlag: 'v', which tightens character-class escaping: adding it to the
      // existing regexes wholesale risks turning valid patterns into runtime SyntaxErrors.
      'require-unicode-regexp': 'off',
      // Flags established, unambiguous names (dryRun mirrors the --dry-run flag, disabled/active
      // match the API's own field names).
      'unicorn/consistent-boolean-name': 'off',
      // Iterator#toArray() needs the ES2025 lib, but tsconfig stays on es2024: Node 22 (the
      // engines floor) lacks parts of ES2025 such as Promise.try and RegExp.escape.
      'unicorn/prefer-iterator-to-array': 'off',
      // Wants a `continue` inside a doubly-nested loop pulled into its own function, even when
      // (as in project/push.ts) it unambiguously continues the innermost loop.
      'unicorn/no-break-in-nested-loop': 'off',
      // xo bans the `null` type outright (fixWith: 'undefined'), but this codebase uses `null`
      // as its established "absent value" sentinel throughout (config fields, lookups, parsed
      // JSON), including one type generated straight from a JSON schema that is `null`, not
      // `undefined`. The autofix only rewrites the type annotation, not the `return null`/`??
      // null` bodies behind it, which silently breaks the `tsc` build. Keep the rule's other,
      // unrelated bans (object/Buffer/empty-array-type).
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            object: {
              fixWith: 'Record<string, unknown>',
              message: 'The `object` type is hard to use. Use `Record<string, unknown>` instead. See: https://github.com/typescript-eslint/typescript-eslint/pull/848',
            },
            Buffer: {
              message: 'Use Uint8Array instead. See: https://sindresorhus.com/blog/goodbye-nodejs-buffer',
              suggest: ['Uint8Array'],
            },
            '[]': "Don't use the empty array type `[]`. It only allows empty arrays. Use `SomeType[]` instead.",
            '[[]]': "Don't use `[[]]`. It only allows an array with a single element which is an empty array. Use `SomeType[][]` instead.",
            '[[[]]]': "Don't use `[[[]]]`. Use `SomeType[][][]` instead.",
          },
        },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // Vitest's `expect(value, message)` form labels a failing iteration inside a loop.
      'vitest/valid-expect': ['error', {maxArgs: 2}],
      // Tests poke at parsed JSON and mock call args, which are `any` by nature.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Default max of 3 flags the standard `expect(JSON.parse(readFileSync(join(...))))`
      // one-liner used throughout these tests to read back a written file.
      'unicorn/max-nested-calls': 'off',
    },
  },
])
