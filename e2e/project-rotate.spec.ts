import type {APIRequestContext} from '@playwright/test'

import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test, type WpCredentials} from './helpers/environment.js'

const APPLICATION_PASSWORDS_PATH = 'wp/v2/users/me/application-passwords'

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function configPath(homeDir: string): string {
  return join(homeDir, '.config', 'loopress', 'config.json')
}

function readLocalToken(homeDir: string): string {
  const config = JSON.parse(readFileSync(configPath(homeDir), 'utf8')) as {
    projects: {e2e: {environments: {local: {token: string}}}}
  }
  return config.projects.e2e.environments.local.token
}

// Bootstraps a disposable application password and points the seeded local config at it, so
// these tests can rotate a real credential without ever touching WP_APP_PASSWORD, the one
// `wp` (a worker-scoped fixture, read once) hands to every other spec in this run. Revoking
// that shared credential here would break every test that happens to run afterward in the
// same worker.
async function seedDisposableCredential(request: APIRequestContext, wp: WpCredentials, homeDir: string): Promise<string> {
  const response = await request.post(`${wp.url}/wp-json/${APPLICATION_PASSWORDS_PATH}`, {
    data: {name: `E2E rotate seed ${Date.now()}`},
    headers: {Authorization: basicAuth(wp.username, wp.appPassword)},
  })
  expect(response.ok()).toBe(true)
  const {password} = (await response.json()) as {password: string}
  const seedToken = `${wp.username}:${password}`

  const path = configPath(homeDir)
  const config = JSON.parse(readFileSync(path, 'utf8')) as {
    projects: {e2e: {environments: {local: Record<string, unknown>}}}
  }
  config.projects.e2e.environments.local.token = seedToken
  writeFileSync(path, JSON.stringify(config, null, 2))

  return seedToken
}

async function countApplicationPasswords(request: APIRequestContext, wp: WpCredentials): Promise<number> {
  const response = await request.get(`${wp.url}/wp-json/${APPLICATION_PASSWORDS_PATH}`, {
    headers: {Authorization: basicAuth(wp.username, wp.appPassword)},
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as unknown[]).length
}

test('rotates the application password: the old one stops authenticating, the new one does', async ({
  homeDir,
  request,
  runCli,
  wp,
}) => {
  const seedToken = await seedDisposableCredential(request, wp, homeDir)

  const result = await runCli(['project', 'rotate'])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout).toContain('New application password created and verified, previous one revoked')

  const newToken = readLocalToken(homeDir)
  expect(newToken).not.toBe(seedToken)

  const oldResponse = await request.get(`${wp.url}/wp-json/wp/v2/users/me`, {
    headers: {Authorization: `Basic ${Buffer.from(seedToken).toString('base64')}`},
  })
  expect(oldResponse.status()).toBe(401)

  const [newUsername, newPassword] = newToken.split(':')
  const newResponse = await request.get(`${wp.url}/wp-json/wp/v2/users/me`, {
    headers: {Authorization: basicAuth(newUsername, newPassword)},
  })
  expect(newResponse.ok()).toBe(true)

  // The credential every other spec in this suite relies on must come out of this test
  // untouched: only the disposable seed credential above was ever rotated.
  const sharedResponse = await request.get(`${wp.url}/wp-json/wp/v2/users/me`, {
    headers: {Authorization: basicAuth(wp.username, wp.appPassword)},
  })
  expect(sharedResponse.ok()).toBe(true)
})

test('persists the new credentials locally so the next command keeps working', async ({homeDir, request, runCli, wp}) => {
  await seedDisposableCredential(request, wp, homeDir)

  const rotateResult = await runCli(['project', 'rotate'])
  expect(rotateResult.exitCode, rotateResult.stderr).toBe(0)

  const followUp = await runCli(['form', 'list'])
  expect(followUp.exitCode, followUp.stderr).toBe(0)
  expect(followUp.stdout).toContain('Forms (')
})

// Regression coverage for the create-verify-delete ordering in rotate-app-password.ts: the
// happy path must swap credentials one-for-one, never pile up an abandoned entry alongside it.
test('does not leave an orphaned application password behind', async ({homeDir, request, runCli, wp}) => {
  await seedDisposableCredential(request, wp, homeDir)
  const countAfterSeeding = await countApplicationPasswords(request, wp)

  const result = await runCli(['project', 'rotate'])
  expect(result.exitCode, result.stderr).toBe(0)

  const countAfterRotate = await countApplicationPasswords(request, wp)
  expect(countAfterRotate).toBe(countAfterSeeding)
})
