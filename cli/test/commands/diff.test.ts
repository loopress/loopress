import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Diff from '../../src/commands/diff.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

// The command resolves local files under localConfig.rootDir; tests point it at an absolute
// temp dir instead of process.chdir(), which Stryker's worker-thread pool disallows.
let dir: string

class TestDiff extends Diff {
  setup(siteConfig: EnvironmentConfig) {
    this.siteConfig = siteConfig
    this.projectId = 'id-acme'
    this.localConfig = {rootDir: dir}
  }
}

function missingComposerLock(): Error {
  return new Error('Not Found', {
    cause: {response: {body: JSON.stringify({error: 'composer.lock not found'}), statusCode: 404}},
  })
}

// Every list endpoint empty, settings an empty object, composer.json matching what the test
// writes to disk and no composer.lock: the baseline where nothing differs.
function baselineGet(composerJson = '{}') {
  return vi.fn(async (path: string) => {
    if (path === 'loopress/v1/seo/settings') return {}
    if (path === 'loopress/v1/composer/json') return {composerJson}
    if (path === 'loopress/v1/composer/lock') throw missingComposerLock()
    return []
  })
}

function make(argv: string[], get: ReturnType<typeof vi.fn>) {
  const cmd = new TestDiff(argv, fakeOclifConfig)
  cmd.setup(makeEnv('staging', 'https://staging.acme.com'))
  const logs = silenceLogs(cmd)
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, getAll: get}
  return {cmd, logs}
}

describe('diff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dir = mkdtempSync(join(tmpdir(), 'lps-diff-cmd-'))
    writeFileSync(join(dir, 'composer.json'), '{}')
    // SEO settings always exist server-side; a clean baseline needs the local counterpart.
    mkdirSync(join(dir, 'seo'))
    writeFileSync(join(dir, 'seo', 'settings.json'), '{}')
    process.exitCode = 0
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
    process.exitCode = 0
  })

  it('reports no drift when every resource matches', async () => {
    const {cmd} = make([], baselineGet())

    const result = await cmd.run()

    expect(result.drift).toBe(false)
    expect(result.left).toBe('staging')
    expect(result.right).toBe('local')
    expect(process.exitCode).not.toBe(1)
  })

  it('flags a local-only snippet as added and exits non-zero', async () => {
    mkdirSync(join(dir, 'snippets'))
    writeFileSync(join(dir, 'snippets', '9-x.php'), '<?php\n\nreturn 1;')
    writeFileSync(join(dir, 'snippets', '9-x.json'), JSON.stringify({active: true, id: 9, name: 'X', type: 'php'}))

    const {cmd} = make([], baselineGet())

    const result = await cmd.run()

    expect(result.drift).toBe(true)
    expect(result.resources.snippet.added).toEqual(['9'])
    expect(process.exitCode).toBe(1)
  })

  it('prints a tally line', async () => {
    mkdirSync(join(dir, 'snippets'))
    writeFileSync(join(dir, 'snippets', '9-x.php'), '<?php\n\nreturn 1;')
    writeFileSync(join(dir, 'snippets', '9-x.json'), JSON.stringify({active: true, id: 9, name: 'X', type: 'php'}))

    const {cmd, logs} = make([], baselineGet())
    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('compared: 0 changed, 1 added, 0 removed'))
  })

  it('isolates a failing resource but still exits non-zero so a CI gate never passes on it', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === 'loopress/v1/snippets') throw new Error('boom')
      if (path === 'loopress/v1/seo/settings') return {}
      if (path === 'loopress/v1/composer/json') return {composerJson: '{}'}
      if (path === 'loopress/v1/composer/lock') throw missingComposerLock()
      return []
    })
    const {cmd} = make([], get)

    const result = await cmd.run()

    expect(result.resources.snippet.error).toBe('boom')
    expect(result.drift).toBe(false)
    expect(result.resources.page.added).toEqual([]) // the other resources still ran
    expect(process.exitCode).toBe(2) // 2 = inconclusive, distinct from 1 = drift
  })

  it('reads local Composer files from an absolute rootDir instead of prefixing the cwd', async () => {
    // cwd is elsewhere; rootDir is the absolute project dir. join() would look under
    // <cwd>/<dir> and wrongly report composer.json as remote-only.
    vi.spyOn(process, 'cwd').mockReturnValue(tmpdir())
    const {cmd} = make([], baselineGet())

    const result = await cmd.run()

    expect(result.resources.composer.removed).toEqual([])
    expect(result.resources.composer.error).toBeUndefined()
  })

  it('stays silent on stdout in --json mode', async () => {
    const {cmd, logs} = make(['--json'], baselineGet())

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalled()
  })

  it('compares only the resources named by --only', async () => {
    const {cmd} = make(['--only', 'snippet', '--only', 'acf'], baselineGet())

    const result = await cmd.run()

    expect(Object.keys(result.resources).sort((a, b) => a.localeCompare(b))).toEqual(['acf', 'snippet'])
  })

  it('compares every resource except those named by --skip', async () => {
    const {cmd} = make(['--skip', 'composer', '--skip', 'seo'], baselineGet())

    const result = await cmd.run()

    expect(Object.keys(result.resources)).not.toContain('composer')
    expect(Object.keys(result.resources)).not.toContain('seo')
    expect(Object.keys(result.resources)).toContain('snippet')
  })

  it('rejects --against pointing at the environment already being compared', async () => {
    const {cmd} = make(['--against', 'staging'], baselineGet())

    await expect(cmd.run()).rejects.toThrow('must be a different environment')
  })

  it('rejects --against naming an unknown environment', async () => {
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
    const {cmd} = make(['--against', 'ghost'], baselineGet())

    await expect(cmd.run()).rejects.toThrow('not found in this project')
  })
})
