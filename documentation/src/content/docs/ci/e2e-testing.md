---
title: E2E Testing
description: Run Playwright end-to-end tests against the WordPress instance loopress/setup-ci boots in CI.
---

`loopress/setup-ci` boots a real, disposable WordPress instance in CI (see [CI/CD Integration](/ci/)). Since it's a real instance, not a mock, you can point [Playwright](https://playwright.dev/) at it and drive the actual wp-admin, using WordPress's own [`@wordpress/e2e-test-utils-playwright`](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-e2e-test-utils-playwright/) package for authentication and admin helpers.

This is independent of `lps`: the CLI syncs snippets, plugins, and Composer dependencies as files, it doesn't drive a browser. E2E tests are for verifying the resulting site actually behaves correctly, for example that a page loads, a shortcode renders, or a form submits.

## Setup

```bash
npm install --save-dev @playwright/test @wordpress/e2e-test-utils-playwright
```

```ts title="playwright.config.ts"
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Matches the defaults `loopress/setup-ci` boots WordPress with.
process.env.WP_BASE_URL ??= 'http://localhost:8080'
process.env.WP_USERNAME ??= 'admin'
process.env.WP_PASSWORD ??= 'admin'

export default defineConfig({
  globalSetup: fileURLToPath(new URL('./tests/e2e/global-setup.ts', import.meta.url)),
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.WP_BASE_URL,
    storageState: './tests/e2e/.auth/admin.json',
  },
})
```

```ts title="tests/e2e/global-setup.ts"
import { request, type FullConfig } from '@playwright/test'
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright'

export default async function globalSetup(config: FullConfig): Promise<void> {
  const { storageState, baseURL } = config.projects[0].use
  const storageStatePath = typeof storageState === 'string' ? storageState : undefined

  const requestContext = await request.newContext({ baseURL })
  const requestUtils = new RequestUtils(requestContext, { storageStatePath })

  // Logs in as WP_USERNAME/WP_PASSWORD and saves the session so every test starts authenticated.
  await requestUtils.setupRest()

  await requestContext.dispose()
}
```

```ts title="tests/e2e/wp-admin.spec.ts"
import { expect, test } from '@wordpress/e2e-test-utils-playwright'

test('WordPress admin loads', async ({ admin }) => {
  await admin.visitAdminPage('index.php')
  await expect(admin.page.locator('#wpadminbar')).toBeVisible()
})
```

The `admin` fixture (and `editor`, `pageUtils`, `requestUtils`) come from `@wordpress/e2e-test-utils-playwright`, importing `test`/`expect` from that package instead of `@playwright/test` directly is what wires them in.

## Running in CI

Boot WordPress with `loopress/setup-ci` first, then point Playwright at its output URL:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: "24"
  - run: npm ci
  - run: npx playwright install --with-deps chromium

  - uses: loopress/setup-ci@main
    id: setup

  - run: npx playwright test
    env:
      WP_BASE_URL: ${{ steps.setup.outputs.wp-url }}
```

If your suite has several independent groups of tests and respawning the whole stack between them is too slow, use `loopress/setup-ci/restore` (or the equivalent on GitLab) to reset WordPress to a clean snapshot instead, see each platform's "Restoring between groups of tests" section: [GitHub Actions](/ci/github-actions/#restoring-between-groups-of-tests), [GitLab CI](/ci/gitlab/#restoring-between-groups-of-tests).

## Running locally

Boot WordPress yourself with `loopress/setup-ci`'s Docker Compose stack, or point `WP_BASE_URL`, `WP_USERNAME`, and `WP_PASSWORD` at any WordPress instance you already have running, then:

```bash
npx playwright test
```

## Full example

[github.com/loopress/demo](https://github.com/loopress/demo) is a working project wired up exactly like this: `lps snippet push` runs in CI via `loopress/setup-ci` on both GitHub Actions and GitLab CI, and `tests/e2e/` runs the Playwright suite above against the same ephemeral instance.
