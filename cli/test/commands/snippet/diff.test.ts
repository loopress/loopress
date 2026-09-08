import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Diff from '../../../src/commands/snippet/diff.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

class TestDiff extends Diff {
  setup(siteConfig: EnvironmentConfig) {
    this.siteConfig = siteConfig
    this.projectId = 'id-acme'
    this.localConfig = {}
  }
}

function make(argv: string[], get: ReturnType<typeof vi.fn>) {
  const cmd = new TestDiff(argv, fakeOclifConfig)
  cmd.setup(makeEnv('staging', 'https://staging.acme.com'))
  const logs = silenceLogs(cmd)
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
  return {cmd, logs}
}

function writeSnippet(dir: string, base: string, code: string, meta: Record<string, unknown>): void {
  writeFileSync(join(dir, `${base}.php`), code)
  writeFileSync(join(dir, `${base}.json`), JSON.stringify(meta))
}

describe('snippet diff', () => {
  let dir: string
  let cwd: string

  beforeEach(() => {
    vi.clearAllMocks()
    cwd = process.cwd()
    dir = mkdtempSync(join(tmpdir(), 'lps-snippet-diff-'))
    process.chdir(dir)
    process.exitCode = 0
  })

  afterEach(() => {
    process.chdir(cwd)
    rmSync(dir, {force: true, recursive: true})
    process.exitCode = 0
  })

  it('compares only snippets and reports no drift when they match', async () => {
    mkdirSync(join(dir, 'snippets'))
    writeSnippet(join(dir, 'snippets'), '7-hero', '<?php\n\nreturn 1;', {active: true, id: 7, name: 'Hero', type: 'php'})
    const get = vi.fn(async () => [{active: true, code: 'return 1;', id: 7, name: 'Hero', type: 'php'}])
    const {cmd} = make([], get)

    const result = await cmd.run()

    expect(Object.keys(result.resources)).toEqual(['snippet'])
    expect(result.drift).toBe(false)
    expect(process.exitCode).not.toBe(1)
  })

  it('flags a local-only snippet and exits non-zero', async () => {
    mkdirSync(join(dir, 'snippets'))
    writeSnippet(join(dir, 'snippets'), '9-x', '<?php\n\nreturn 2;', {active: true, id: 9, name: 'X', type: 'php'})
    const {cmd} = make([], vi.fn(async () => []))

    const result = await cmd.run()

    expect(result.resources.snippet.added).toEqual(['9'])
    expect(result.drift).toBe(true)
    expect(process.exitCode).toBe(1)
  })

  it('honours the [PATH] argument', async () => {
    mkdirSync(join(dir, 'elsewhere'))
    writeSnippet(join(dir, 'elsewhere'), '5-a', '<?php\n\nreturn 3;', {active: true, id: 5, name: 'A', type: 'php'})
    const {cmd} = make(['elsewhere'], vi.fn(async () => []))

    const result = await cmd.run()

    expect(result.resources.snippet.added).toEqual(['5'])
  })

  it('rejects --against pointing at the environment already being compared', async () => {
    const {cmd} = make(['--against', 'staging'], vi.fn(async () => []))

    await expect(cmd.run()).rejects.toThrow('must be a different environment')
  })

  it('sets the right label to the --against environment', async () => {
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(makeEnv('production', 'https://acme.com'))
    const {cmd} = make(['--against', 'production'], vi.fn(async () => []))

    // The against-side WpClient is real; stub its transport so no request leaves the test.
    const {WpClient} = await import('../../../src/lib/wp-client.js')
    vi.spyOn(WpClient.prototype, 'get').mockResolvedValue([])

    const result = await cmd.run()

    expect(result.left).toBe('staging')
    expect(result.right).toBe('production')
  })
})
