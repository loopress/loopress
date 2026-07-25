import {rmSync, writeFileSync} from 'node:fs'
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

// Regression coverage: `lps composer init`'s own generated scaffold requires `composer/installers`
// for installer-paths to route wpackagist-plugin/* packages to the real wp-content/plugins/, but
// didn't allow-list it. Composer 2.2+ refuses to run a non-allow-listed plugin non-interactively,
// so every real push through this exact scaffold 500d before this fix, with:
// "composer/installers contains a Composer plugin which is blocked by your allow-plugins config".
//
// Deliberately checks only for that specific message rather than a fully successful push
// (deliberately requiring nothing beyond the scaffold's own default, `composer/installers` itself,
// so this doesn't also depend on WordPress.org/wpackagist.org reachability, which turned out to be
// unreliable from GitHub-hosted runners): on this shared e2e instance, where Yoast SEO is always
// active, activating `composer/installers` after this fix hits a *separate*, unrelated failure —
// a process-wide PHP class-autoloading collision between Loopress's in-process Composer run and
// Yoast's own bundled (and stale) `composer/installers` classmap entry, tracked in
// obsidian/Product/Composer In-Process Autoloader Collision.md. Reproduced locally by simply
// activating wordpress-seo and re-running this exact push — confirmed unrelated to this bug or to
// CI specifically. A real success assertion here would make this test fail on that separate,
// already-tracked issue instead of the one it's actually meant to guard.
test('a fresh `composer init` scaffold does not hit the plugin-trust gate on a real push', async ({runCli}) => {
  const initResult = await runCli(['composer', 'init'])
  expect(initResult.exitCode, initResult.stderr).toBe(0)

  const pushResult = await runCli(['composer', 'push'])
  const output = pushResult.stderr || pushResult.stdout
  expect(output).not.toContain('blocked by your allow-plugins config')
})
