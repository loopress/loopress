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
