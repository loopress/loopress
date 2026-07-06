import {defineConfig} from '@playwright/test'

// These tests exercise the real CLI against a real (disposable) WordPress instance, so
// they run outside `pnpm test` (vitest). See e2e/README.md for how to point them at one.
export default defineConfig({
  // A real (often local dev) WordPress instance can take a few seconds to render an
  // admin page under load; the default 5s assertion timeout was flaky against it.
  expect: {timeout: 15_000},
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  reporter: process.env.CI ? [['github'], ['html', {open: 'never'}]] : [['list']],
  // These hit a real, shared WordPress instance (plugin activation state, page render
  // timing) and inherit some amount of that environment's own jitter; one retry absorbs it
  // without masking a real regression, which would still fail again on the retry.
  retries: 1,
  testDir: './e2e',
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
  },
  // Tests mutate shared, global WordPress state (active plugins, snippet lists), so they
  // can't safely run concurrently against the same instance.
  workers: 1,
})
