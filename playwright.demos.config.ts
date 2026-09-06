import {defineConfig} from '@playwright/test'

// Screencast recorder for the marketing site. Deliberately NOT part of `pnpm test:e2e`:
// these drive a real (disposable) WordPress the same way the e2e suite does, but their job
// is to produce video, not assertions. See demos/README.md.
export default defineConfig({
  testDir: './demos',
  testMatch: '**/*.demo.ts',
  // A screencast that only passed on the retry is a screencast with a glitch in it. Fail loud.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // A real `composer require` / `lps app push` against a local WP can take a while.
  timeout: 180_000,
  expect: {timeout: 15_000},
  outputDir: './demos/.out/raw',
  use: {
    baseURL: process.env.WP_URL,
    // Record at 2x the size the hero will display the clip at, so it stays crisp on retina.
    viewport: {width: 1440, height: 900},
    video: {mode: 'on', size: {width: 1440, height: 900}},
    trace: 'off',
  },
})
