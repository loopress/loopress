import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Status from '../../../src/commands/plugin/status.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

class TestStatus extends Status {
  setup(config: LoopressLocalConfig, siteConfig: EnvironmentConfig) {
    this.localConfig = config
    this.siteConfig = siteConfig
  }
}

function make(config: LoopressLocalConfig, get: ReturnType<typeof vi.fn>) {
  const cmd = new TestStatus([], fakeOclifConfig)
  cmd.setup(config, makeEnv('production', 'https://acme.com'))
  const logs = silenceLogs(cmd)
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
  return {cmd, logs}
}

const native = (slug: string, version = '1.0.0', status = 'active') => ({
  name: slug,
  plugin: `${slug}/${slug}.php`,
  status,
  version,
})

const lockNotFound = new Error('nf', {cause: {response: {statusCode: 404}}})

function getWith(installed: unknown[], lock: null | string = null) {
  return vi.fn(async (path: string) => {
    if (path === 'loopress/v1/composer/lock') {
      if (lock === null) throw lockNotFound
      return {composerLock: lock}
    }

    return installed
  })
}

function lockManaging(...slugs: string[]): string {
  return JSON.stringify({packages: slugs.map((slug) => ({name: `wpackagist-plugin/${slug}`}))})
}

describe('plugin status', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-plugin-status-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('bails out when the project uses a composer.json', async () => {
    writeFileSync(join(dir, 'composer.json'), '{}')
    const {cmd, logs} = make({plugins: {akismet: '5.3.3'}}, getWith([]))

    const result = await cmd.run()

    expect(result.status).toBe('composer-managed')
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('lps composer'))
  })

  it('reports in-sync when everything matches: installed, managed, active, at the pinned version', async () => {
    const {cmd, logs} = make(
      {plugins: {akismet: '5.3.3'}},
      getWith([native('akismet', '5.3.3', 'active')], lockManaging('akismet')),
    )

    const result = await cmd.run()

    expect(result).toEqual({
      drift: false,
      inactive: [],
      missing: [],
      status: 'in-sync',
      untrackedActive: [],
      wrongVersion: [],
    })
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('In sync with loopress.json'))
  })

  it('flags a manifest plugin that is not installed at all', async () => {
    const {cmd, logs} = make({plugins: {akismet: '5.3.3'}}, getWith([]))

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Not installed: akismet')
  })

  it('flags a version mismatch against a managed plugin', async () => {
    const {cmd, logs} = make(
      {plugins: {akismet: '5.3.3'}},
      getWith([native('akismet', '5.0.0', 'active')], lockManaging('akismet')),
    )

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Version drift: akismet is 5.0.0, loopress.json pins 5.3.3')
  })

  it('flags a pinned plugin that is installed but inactive', async () => {
    const {cmd, logs} = make(
      {plugins: {akismet: '5.3.3'}},
      getWith([native('akismet', '5.3.3', 'inactive')], lockManaging('akismet')),
    )

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Pinned but inactive: akismet')
  })

  it('flags a plugin managed by Loopress but dropped from loopress.json', async () => {
    const {cmd, logs} = make({}, getWith([native('akismet', '5.3.3', 'active')], lockManaging('akismet')))

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Managed by Loopress but dropped from loopress.json: akismet')
  })

  it('flags a collision (installed outside Loopress) separately from "not installed"', async () => {
    const {cmd, logs} = make({plugins: {akismet: '5.3.3'}}, getWith([native('akismet', '5.3.3', 'active')], null))

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Installed outside Loopress (run `plugin push --force`): akismet')
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Not installed'))
  })

  it('reports an untracked-active plugin without treating it as drift (no exit, status stays in-sync)', async () => {
    const {cmd, logs} = make({}, getWith([native('woocommerce', '9.0.0', 'active')], null))

    const result = await cmd.run()

    expect(result).toEqual({
      drift: false,
      inactive: [],
      missing: [],
      status: 'in-sync',
      untrackedActive: ['woocommerce'],
      wrongVersion: [],
    })
    expect(logs.log).toHaveBeenCalledWith('Active but untracked: woocommerce')
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('In sync with loopress.json'))
  })

  it('does not flag an untracked plugin that is installed but inactive', async () => {
    const {cmd, logs} = make({}, getWith([native('woocommerce', '9.0.0', 'inactive')], null))

    const result = await cmd.run()

    expect(result.status).toBe('in-sync')
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('In sync with loopress.json'))
  })

  it('propagates a non-404 error fetching the instance lock', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === 'loopress/v1/composer/lock') throw new Error('server error', {cause: {response: {statusCode: 500}}})
      return []
    })
    const {cmd} = make({plugins: {akismet: '5.3.3'}}, get)

    await expect(cmd.run()).rejects.toThrow('server error')
  })
})
