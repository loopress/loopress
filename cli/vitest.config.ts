import {configDefaults, defineConfig} from 'vitest/config'

// Stryker runs the tests from a copy under .stryker-tmp/sandbox-*, where `../wordpress-plugin`
// and `../documentation` no longer exist: the docs matrix test reads sibling packages, so it
// stays out of the mutation run (CI still runs it normally).
const inStryker = process.env.STRYKER_MUTATOR_WORKER !== undefined

export default defineConfig({
  test: {
    environment: 'node',
    exclude: inStryker ? [...configDefaults.exclude, 'test/docs/capability-matrix.test.ts'] : configDefaults.exclude,
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
    // Windows runners are slow under parallel load; the 5s default flakes on fs-heavy tests
    testTimeout: 20_000,
  },
})
