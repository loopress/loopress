import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restGet} from './helpers/rest.js'

// Theme versions in loopress.json (`lps theme add/status/version pull/version push`) and the
// `lps theme pull/push` aggregates. Core's bundled themes are installed by WordPress itself, so
// outside Loopress: a real Composer install is never run here, same reason as plugin-manifest.spec.ts.
const BLOCK_THEME = 'twentytwentyfour'

function readThemes(projectDir: string): Record<string, string> | undefined {
  return (JSON.parse(readFileSync(join(projectDir, 'loopress.json'), 'utf8')) as {themes?: Record<string, string>}).themes
}

function setThemes(projectDir: string, themes: Record<string, string>): void {
  const file = join(projectDir, 'loopress.json')
  const config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  writeFileSync(file, JSON.stringify({...config, themes}, null, 2))
}

test('theme add pins latest, then an exact version, and refuses a constraint', async ({projectDir, runCli}) => {
  const add = await runCli(['theme', 'add', 'generatepress'])
  expect(add.exitCode, output(add)).toBe(0)
  expect(add.stdout).toContain('Added generatepress (latest). Run `lps theme push` to apply.')

  const pin = await runCli(['theme', 'add', 'generatepress', '--version', '3.4.0'])
  expect(pin.stdout).toContain('Updated generatepress (3.4.0)')
  expect(readThemes(projectDir)).toEqual({generatepress: '3.4.0'})

  const again = await runCli(['theme', 'add', 'generatepress', '--version', '3.4.0'])
  expect(again.stdout).toContain('already pinned to 3.4.0, nothing to do')

  const constraint = await runCli(['theme', 'add', 'generatepress', '--version', '~3.4'])
  expect(constraint.exitCode).not.toBe(0)
  expect(output(constraint)).toContain('--version must be an exact version like 3.4.0')

  const dryRun = await runCli(['theme', 'add', 'astra', '--dry-run'])
  expect(dryRun.stdout).toContain('[dry-run] Would add astra (latest)')
  expect(readThemes(projectDir)).toEqual({generatepress: '3.4.0'})
})

test('theme version pull pins every installed theme to its live version', async ({projectDir, request, runCli, wp}) => {
  const themes = await restGet(request, wp, 'wp/v2/themes')
  const live = (await themes.json()) as Array<{stylesheet: string; version: string}>
  const block = live.find((theme) => theme.stylesheet === BLOCK_THEME)!

  const pull = await runCli(['theme', 'version', 'pull'])
  expect(pull.exitCode, output(pull)).toBe(0)
  expect(pull.stdout).toContain('Wrote ')

  expect(readThemes(projectDir)).toMatchObject({[BLOCK_THEME]: block.version})

  const dryRun = await runCli(['theme', 'version', 'pull', '--dry-run'])
  expect(dryRun.stdout).toContain('[dry-run] Would write')
})

test('theme status flags a missing theme and themes installed outside Loopress, exiting 1', async ({projectDir, runCli}) => {
  setThemes(projectDir, {[BLOCK_THEME]: 'latest', 'e2e-no-such-theme': 'latest'})

  const status = await runCli(['theme', 'status'])

  expect(status.exitCode).toBe(1)
  expect(status.stdout).toContain('Not installed: e2e-no-such-theme')
  expect(status.stdout).toContain(`Installed outside Loopress: ${BLOCK_THEME}`)
})

test('theme status with nothing pinned is in sync', async ({runCli}) => {
  const status = await runCli(['theme', 'status', '--json'])

  expect(status.exitCode, output(status)).toBe(0)
  expect(JSON.parse(status.stdout)).toMatchObject({drift: false, status: 'in-sync'})
})

test('theme version push refuses to run without pins, and to take over a core theme without --force', async ({projectDir, runCli}) => {
  const empty = await runCli(['theme', 'version', 'push', '--yes'])
  expect(empty.exitCode).not.toBe(0)
  expect(output(empty)).toContain('No themes found in loopress.json. Run `lps theme version pull` first.')

  setThemes(projectDir, {[BLOCK_THEME]: 'latest'})
  const collision = await runCli(['theme', 'version', 'push', '--yes'])
  expect(collision.exitCode).not.toBe(0)
  expect(output(collision)).toContain(`${BLOCK_THEME} (`)
  expect(output(collision)).toContain('installed outside Loopress. Re-run with --force')
})

test('theme version push --dry-run plans the install of a missing theme', async ({projectDir, runCli}) => {
  setThemes(projectDir, {generatepress: '3.4.0'})

  const push = await runCli(['theme', 'version', 'push', '--dry-run', '--json'])

  expect(push.exitCode, output(push)).toBe(0)
  expect(JSON.parse(push.stdout)).toMatchObject({installed: ['generatepress'], status: 'dry-run'})
})

test('a composer.json makes theme status and version push step aside', async ({projectDir, runCli}) => {
  writeFileSync(join(projectDir, 'composer.json'), JSON.stringify({require: {}}))
  setThemes(projectDir, {[BLOCK_THEME]: 'latest'})

  const status = await runCli(['theme', 'status', '--json'])
  expect(JSON.parse(status.stdout)).toMatchObject({status: 'composer-managed'})

  const push = await runCli(['theme', 'version', 'push', '--yes', '--json'])
  expect(push.exitCode).toBe(0)
  expect(JSON.parse(push.stdout)).toMatchObject({status: 'composer-managed'})
})

test.describe('theme pull / push aggregates (block theme active)', () => {
  let previousActiveTheme: string

  test.beforeAll(async ({requestUtils}) => {
    const themes = await requestUtils.rest<Array<{status: string; stylesheet: string}>>({path: '/wp/v2/themes'})
    previousActiveTheme = themes.find((theme) => theme.status === 'active')!.stylesheet
    await requestUtils.activateTheme(BLOCK_THEME)
  })

  test.afterAll(async ({requestUtils}) => {
    await requestUtils.activateTheme(previousActiveTheme)
  })

  test('theme pull runs theme versions then Global Styles, and both land locally', async ({projectDir, runCli}) => {
    const pull = await runCli(['theme', 'pull', '--json'])

    expect(pull.exitCode, output(pull)).toBe(0)
    expect(JSON.parse(pull.stdout)).toEqual({
      results: [
        {label: 'theme versions', status: 'pulled'},
        {label: 'Global Styles', status: 'pulled'},
      ],
    })
    expect(readThemes(projectDir)).toHaveProperty(BLOCK_THEME)
  })

  test('theme push --dry-run previews every step without writing anything', async ({projectDir, runCli}) => {
    setThemes(projectDir, {generatepress: '3.4.0'})

    const push = await runCli(['theme', 'push', '--dry-run'])

    expect(output(push)).toContain('theme versions')
    // No theme/templates, parts or css directory: the child theme step is skipped.
    expect(output(push)).not.toContain('templates and parts')
    expect(output(push)).toContain('Global Styles')
  })
})
