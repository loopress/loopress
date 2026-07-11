import {test as base} from '@playwright/test'
import {execFile} from 'node:child_process'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

import {loginToWpAdmin} from './wp-admin.js'

const execFileAsync = promisify(execFile)

const CLI_ENTRY = fileURLToPath(new URL('../../cli/bin/run.js', import.meta.url))

export interface WpCredentials {
  /** Real wp-admin account password. Only used to drive the browser login form; never sent over the REST API. */
  adminPassword: string
  appPassword: string
  url: string
  username: string
}

export interface CliResult {
  exitCode: number
  stderr: string
  stdout: string
}

function readWpCredentials(): WpCredentials {
  const url = process.env.WP_URL
  const username = process.env.WP_USERNAME
  const appPassword = process.env.WP_APP_PASSWORD
  const adminPassword = process.env.WP_ADMIN_PASSWORD

  if (!url || !username || !appPassword || !adminPassword) {
    throw new Error(
      'Missing WP_URL / WP_USERNAME / WP_APP_PASSWORD / WP_ADMIN_PASSWORD environment variables. ' +
        'These e2e tests need a real, disposable WordPress instance to run against, see cli/e2e/README.md.',
    )
  }

  return {adminPassword, appPassword, url, username}
}

interface TestFixtures {
  homeDir: string
  projectDir: string
  runCli(args: string[]): Promise<CliResult>
}

interface WorkerFixtures {
  wp: WpCredentials
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Every test's `page` starts logged into wp-admin: without this, each spec would have to
  // remember to call `loginToWpAdmin` itself, and a forgotten call fails as a slow, confusing
  // "element not found" (silently redirected to wp-login.php) rather than an obvious error.
  page: async ({page, wp}, use) => {
    await loginToWpAdmin(page, wp)
    await use(page)
  },

  homeDir: async ({}, use) => {
    await use(mkdtempSync(join(tmpdir(), 'lps-e2e-home-')))
  },

  projectDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'lps-e2e-project-'))
    writeFileSync(join(dir, 'loopress.json'), `${JSON.stringify({rootDir: '.', snippetsDir: 'snippets'}, null, 2)}\n`)
    await use(dir)
  },

  runCli: async ({homeDir, projectDir, wp}, use) => {
    // Seeds an isolated `~/.loopress/config.json` under the fake home directory, so every
    // CLI invocation in this test targets the e2e WordPress instance without ever touching
    // a developer's real global Loopress config (mirrors the isolation `test/setup.ts` uses
    // for the unit suite, but for a real child process rather than an in-process mock).
    mkdirSync(join(homeDir, '.loopress'), {recursive: true})
    const addedAt = new Date().toISOString()
    writeFileSync(
      join(homeDir, '.loopress', 'config.json'),
      JSON.stringify({
        currentProject: {env: 'local', id: 'e2e'},
        projects: {
          e2e: {
            addedAt,
            environments: {
              local: {addedAt, name: 'local', token: `${wp.username}:${wp.appPassword}`, url: wp.url},
            },
            name: 'e2e',
          },
        },
        telemetry: {disabled: true},
      }),
    )

    await use(async (args: string[]) => {
      try {
        const {stderr, stdout} = await execFileAsync(process.execPath, [CLI_ENTRY, ...args], {
          cwd: projectDir,
          env: {...process.env, HOME: homeDir},
          timeout: 60_000,
        })
        return {exitCode: 0, stderr, stdout}
      } catch (error) {
        const err = error as {code?: number; stderr?: string; stdout?: string}
        return {exitCode: err.code ?? 1, stderr: err.stderr ?? '', stdout: err.stdout ?? ''}
      }
    })
  },

  wp: [
    async ({}, use) => {
      await use(readWpCredentials())
    },
    {scope: 'worker'},
  ],
})

// oclif hard-wraps error output to a fixed column width, so a long message can be split
// across lines mid-sentence. Collapse it back to single-spaced text before substring checks.
export function unwrap(text: string): string {
  return text.replaceAll(/\s+/g, ' ')
}

export {expect} from '@playwright/test'
