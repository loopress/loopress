import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Diff from '../../src/commands/diff.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

class TestDiff extends Diff {
  setup(siteConfig: EnvironmentConfig, rootDir?: string) {
    this.siteConfig = siteConfig
    this.projectId = 'id-acme'
    this.localConfig = rootDir === undefined ? {} : {rootDir}
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

function make(argv: string[], get: ReturnType<typeof vi.fn>, rootDir?: string) {
  const cmd = new TestDiff(argv, fakeOclifConfig)
  cmd.setup(makeEnv('staging', 'https://staging.acme.com'), rootDir)
  const logs = silenceLogs(cmd)
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
  return {cmd, logs}
}

describe('diff', () => {
  let dir: string
  let cwd: string

  beforeEach(() => {
    vi.clearAllMocks()
    cwd = process.cwd()
    dir = mkdtempSync(join(tmpdir(), 'lps-diff-cmd-'))
    process.chdir(dir)
    writeFileSync(join(dir, 'composer.json'), '{}')
    // SEO settings always exist server-side; a clean baseline needs the local counterpart.
    mkdirSync(join(dir, 'seo'))
    writeFileSync(join(dir, 'seo', 'settings.json'), '{}')
    process.exitCode = 0
  })

  afterEach(() => {
    process.chdir(cwd)
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
    expect(process.exitCode).toBe(1)
  })

  it('reads local Composer files from an absolute rootDir instead of prefixing the cwd', async () => {
    // cwd is elsewhere; rootDir is the absolute project dir. join() would look under
    // <cwd>/<dir> and wrongly report composer.json as remote-only.
    process.chdir(tmpdir())
    const {cmd} = make([], baselineGet(), dir)

    const result = await cmd.run()

    expect(result.resources.composer.removed).toEqual([])
    expect(result.resources.composer.error).toBeUndefined()
  })

  it('stays silent on stdout in --json mode', async () => {
    const {cmd, logs} = make(['--json'], baselineGet())

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalled()
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
