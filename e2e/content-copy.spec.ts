import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'

// `lps content copy` needs a second, HTTPS site to copy from, which CI doesn't have: these cover
// the guards that run before any content moves, the ones that keep it from wiping the wrong site.

type Config = {projects: {e2e: {environments: Record<string, Record<string, string>>}}}

function addEnvironment(homeDir: string, name: string, overrides: Record<string, string> = {}): void {
  const path = join(homeDir, '.config', 'loopress', 'config.json')
  const config = JSON.parse(readFileSync(path, 'utf8')) as Config
  config.projects.e2e.environments[name] = {...config.projects.e2e.environments.local, name, ...overrides}
  writeFileSync(path, JSON.stringify(config, null, 2))
}

test('copying from "local" into itself is refused', async ({runCli}) => {
  const copy = await runCli(['content', 'copy', 'local', '--yes'])

  expect(copy.exitCode).not.toBe(0)
  expect(output(copy)).toContain('<from> must be another environment than "local"')
})

test('an unknown source environment fails listing the available ones', async ({runCli}) => {
  const copy = await runCli(['content', 'copy', 'nope', '--yes'])

  expect(copy.exitCode).not.toBe(0)
  expect(output(copy)).toContain('Environment "nope" not found. Available: local')
})

test('a source environment without credentials is refused', async ({homeDir, runCli}) => {
  addEnvironment(homeDir, 'staging', {token: '', url: 'https://staging.example.com'})

  const copy = await runCli(['content', 'copy', 'staging', '--yes'])

  expect(copy.exitCode).not.toBe(0)
  expect(output(copy)).toContain('No credentials configured for https://staging.example.com')
})

test('a source environment on plain HTTP is refused before any request', async ({homeDir, runCli}) => {
  addEnvironment(homeDir, 'staging')

  const copy = await runCli(['content', 'copy', 'staging', '--dry-run'])

  expect(copy.exitCode).not.toBe(0)
  expect(output(copy)).toContain('Refusing to send credentials over plain HTTP for the "staging" environment')
})

test('--env pointing at another environment than "local" is refused', async ({homeDir, runCli}) => {
  addEnvironment(homeDir, 'production')

  const copy = await runCli(['content', 'copy', 'local', '--env', 'production', '--yes'])

  expect(copy.exitCode).not.toBe(0)
  expect(output(copy)).toContain('Content is only ever copied into the "local" environment')
})
