import {configDefaults, defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // e2e/ holds @playwright/test specs (run via `pnpm test:e2e`), not vitest ones; both use
    // the `*.spec.ts` naming convention, so vitest's default include glob would otherwise try
    // (and fail) to collect them too.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    environment: 'node',
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
  },
})
