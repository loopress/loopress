import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test, unwrap} from './helpers/environment.js'
import {setPluginActive} from './helpers/wp-admin.js'

// `lps doctor` is the one command whose whole job is probing a real environment (reachability,
// plugin presence, credential validity), so its behaviour can only really be pinned down
// end-to-end. Unit tests mock every call it makes.

test('reports every check green against a healthy environment', async ({runCli}) => {
  const result = await runCli(['doctor'])

  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout).toContain('✓ WordPress REST API reachable')
  expect(result.stdout).toContain('✓ Loopress plugin installed')
  expect(result.stdout).toContain('✓ Credentials accepted')
  expect(result.stdout).toContain('All checks passed.')
})

// A wrong application password must fail the credentials check specifically, not the
// reachability or plugin checks (the site is up and the plugin is there), and must exit
// non-zero so `lps doctor` is usable as a CI precondition gate.
test('fails the credentials check, and only that one, when the stored app password is wrong', async ({homeDir, runCli}) => {
  const path = join(homeDir, '.config', 'loopress', 'config.json')
  const config = JSON.parse(readFileSync(path, 'utf8')) as {
    projects: {e2e: {environments: {local: {token: string}}}}
  }
  const [username] = config.projects.e2e.environments.local.token.split(':')
  config.projects.e2e.environments.local.token = `${username}:not-a-real-application-password`
  writeFileSync(path, JSON.stringify(config, null, 2))

  const result = await runCli(['doctor'])

  expect(result.exitCode).not.toBe(0)
  expect(result.stdout).toContain('✓ WordPress REST API reachable')
  expect(result.stdout).toContain('✓ Loopress plugin installed')
  expect(result.stdout).toContain('✗ Credentials accepted')
})

// Deactivating the plugin is the exact failure `lps doctor` exists to catch: the site is
// reachable and the credentials are fine, but `loopress/v1` 404s. Scoped to its own describe
// block with a guaranteed restore, same pattern as acf-sync.spec.ts's "ACF plugin inactive",
// since every other spec in the suite needs the plugin active.
test.describe('Loopress plugin inactive', () => {
  test.beforeAll(async ({requestUtils}) => {
    await setPluginActive(requestUtils, 'loopress-full', false)
  })

  test.afterAll(async ({requestUtils}) => {
    await setPluginActive(requestUtils, 'loopress-full', true)
  })

  test('fails the plugin check with a clear "missing or outdated" message', async ({runCli}) => {
    const result = await runCli(['doctor'])

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toContain('✗ Loopress plugin installed')
    expect(unwrap(result.stdout)).toContain('Is the required plugin installed and up to date')
    expect(unwrap(result.stderr)).toContain('check failed')
  })
})
