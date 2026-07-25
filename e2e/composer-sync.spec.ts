import {readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test} from './helpers/environment.js'

// Regression coverage: the REST schema for composerLock used to reject the explicit `null`
// the CLI sends when there is no composer.lock yet, so this exact scenario always failed.
//
// This asserts against the REST endpoint rather than the Loopress admin page: that page is a
// React app whose fetch-after-render timing made it an unreliable thing to assert on, and the
// REST response is the actual source of truth for "did the package get installed".
test('pushes composer.json with no lock file, and the package is actually installed server-side', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  writeFileSync(
    join(projectDir, 'composer.json'),
    JSON.stringify({name: 'loopress/e2e-test', require: {'psr/log': '^3.0'}}),
  )
  rmSync(join(projectDir, 'composer.lock'), {force: true})

  const result = await runCli(['composer', 'push'])

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain('completed on the server')

  const installedResponse = await request.get(`${wp.url}/wp-json/loopress/v1/composer/installed`, {
    headers: {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`},
  })
  expect(installedResponse.ok()).toBe(true)
  const installed = (await installedResponse.json()) as Array<{name: string}>
  expect(installed.map((pkg) => pkg.name)).toContain('psr/log')
})

// Regression coverage: `lps composer init`'s own generated scaffold (as opposed to a
// hand-crafted composer.json, like the test above) requires `composer/installers` for
// installer-paths to route wpackagist-plugin/* packages to the real wp-content/plugins/, but
// didn't allow-list it. Composer 2.2+ refuses to run a non-allow-listed plugin non-interactively,
// so every real push through this exact scaffold 500d before this fix, regardless of which
// package was being installed.
test('a fresh `composer init` scaffold can push a WordPress.org plugin without a manual workaround', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const initResult = await runCli(['composer', 'init'])
  expect(initResult.exitCode, initResult.stderr).toBe(0)

  const composerJsonPath = join(projectDir, 'composer.json')
  const composerJson = JSON.parse(readFileSync(composerJsonPath, 'utf8'))
  // query-monitor, not hello-dolly: the official `wordpress:latest` image (used by CI's
  // loopress/setup-ci) ships Hello Dolly bundled by default, unlike a from-scratch Local by
  // Flywheel site — query-monitor is the plugin this project's own manual QA playbook already
  // uses for this exact kind of test, precisely to avoid a real WordPress.org plugin that might
  // already be present under a different path convention.
  composerJson.require['wpackagist-plugin/query-monitor'] = '*'
  writeFileSync(composerJsonPath, JSON.stringify(composerJson))

  const pushResult = await runCli(['composer', 'push'])
  // Surfaced as the assertion's failure message (Playwright's second `expect()` argument)
  // rather than a separate log line, so a CI failure shows the actual Composer error instead
  // of just "Expected: 0, Received: 1".
  expect(pushResult.exitCode, pushResult.stderr || pushResult.stdout).toBe(0)

  const pluginsResponse = await request.get(`${wp.url}/wp-json/wp/v2/plugins`, {
    headers: {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`},
  })
  expect(pluginsResponse.ok()).toBe(true)
  const plugins = (await pluginsResponse.json()) as Array<{plugin: string}>
  expect(plugins.some((plugin) => plugin.plugin.startsWith('query-monitor/'))).toBe(true)
})
