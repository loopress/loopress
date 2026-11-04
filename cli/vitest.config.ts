import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
    // Windows runners are slow under parallel load; the 5s default flakes on fs-heavy tests
    testTimeout: 20_000,
  },
})
