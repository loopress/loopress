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
    const {cmd, logs} = make([], baselineGet())

    const result = await cmd.run()

    expect(result.drift).toBe(false)
    expect(result.left).toBe('staging')
    expect(result.right).toBe('local')
    expect(process.exitCode).not.toBe(1)
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('in sync'))
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('inconclusive'))
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

  it('prints a tally line and renders the added item in its section', async () => {
    mkdirSync(join(dir, 'snippets'))
    writeFileSync(join(dir, 'snippets', '9-x.php'), '<?php\n\nreturn 1;')
    writeFileSync(join(dir, 'snippets', '9-x.json'), JSON.stringify({active: true, id: 9, name: 'X', type: 'php'}))

    const {cmd, logs} = make([], baselineGet())
    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('compared: 0 changed, 1 added, 0 removed'))
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('+ 9'))
  })

  it('tallies changed and removed counts accurately, not just added', async () => {
    mkdirSync(join(dir, 'acf', 'field-groups'), {recursive: true})
    writeFileSync(join(dir, 'acf', 'field-groups', 'group_1.json'), JSON.stringify({key: 'group_1', title: 'Old'}))

    const get = vi.fn(async (path: string) => {
      if (path === 'loopress/v1/acf/field-groups') return [{key: 'group_1', title: 'New'}]
      if (path === 'loopress/v1/forms') return [{id: 9, settings: {form_title: 'Gone'}}]
      if (path === 'loopress/v1/seo/settings') return {}
      if (path === 'loopress/v1/composer/json') return {composerJson: '{}'}
      if (path === 'loopress/v1/composer/lock') throw missingComposerLock()
      return []
    })
    const {cmd, logs} = make([], get)

    const result = await cmd.run()

    expect(result.resources.acf.changed.map((c) => c.id)).toEqual(['field-groups/group_1'])
    expect(result.resources.form.removed).toEqual(['9'])
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('8 compared: 1 changed, 0 added, 1 removed'))
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('~ field-groups/group_1'))
  })

  it('isolates a failing resource but still exits non-zero so a CI gate never passes on it', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === 'loopress/v1/snippets') throw new Error('boom')
      if (path === 'loopress/v1/seo/settings') return {}
      if (path === 'loopress/v1/composer/json') return {composerJson: '{}'}
      if (path === 'loopress/v1/composer/lock') throw missingComposerLock()
      return []
    })
    const {cmd, logs} = make([], get)

    const result = await cmd.run()

    expect(result.resources.snippet.error).toBe('boom')
    expect(result.resources.snippet.added).toEqual([])
    expect(result.resources.snippet.changed).toEqual([])
    expect(result.resources.snippet.removed).toEqual([])
    expect(result.drift).toBe(false)
    expect(result.resources.form.added).toEqual([]) // the other resources still ran
    expect(process.exitCode).toBe(2) // 2 = inconclusive, distinct from 1 = drift
    // 7, not 8: the failed resource is excluded from "compared".
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('7 compared: 0 changed, 0 added, 0 removed'))
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('inconclusive'))
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

  it('rejects --against an environment with no configured token', async () => {
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue({addedAt: '2024-01-01', name: 'staging2', token: '', url: 'https://x.com'})
    const {cmd} = make(['--against', 'staging2'], baselineGet())

    await expect(cmd.run()).rejects.toThrow(/No credentials configured/)
  })

  it('renders diff patches with the real environment names, not blank labels', async () => {
    writeFileSync(join(dir, 'composer.json'), '{"a":2}\n')
    const get = vi.fn(async (path: string) => {
      if (path === 'loopress/v1/composer/json') return {composerJson: '{"a":1}\n'}
      if (path === 'loopress/v1/composer/lock') throw missingComposerLock()
      if (path === 'loopress/v1/seo/settings') return {}
      return []
    })
    const {cmd, logs} = make([], get)

    await cmd.run()

    const output = logs.log.mock.calls.map((call) => String(call[0])).join('\n')
    // Checked as one contiguous block, not two separate toContain calls: the unified-diff
    // header carries the label after a tab (a blank labels object would drop it), the leading
    // 4 spaces are indentPatch's own indent, and the embedded "\n" between the two lines
    // confirms indentPatch joins with a real newline rather than concatenating everything.
    expect(output).toContain('    --- composer.json\tstaging\n    +++ composer.json\tlocal')
  })
})
