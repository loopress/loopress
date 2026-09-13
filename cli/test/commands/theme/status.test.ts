import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Status from '../../../src/commands/theme/status.js'
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

const native = (stylesheet: string, version = '1.0.0', status: 'active' | 'inactive' = 'inactive') => ({
  status,
  stylesheet,
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
  return JSON.stringify({packages: slugs.map((slug) => ({name: `wpackagist-theme/${slug}`}))})
}

describe('theme status', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-theme-status-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('bails out when the project uses a composer.json', async () => {
    writeFileSync(join(dir, 'composer.json'), '{}')
    const {cmd, logs} = make({themes: {generatepress: '3.4.0'}}, getWith([]))

    const result = await cmd.run()

    expect(result).toEqual({drift: false, missing: [], status: 'composer-managed', wrongVersion: []})
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('lps composer'))
  })

  it('reports in-sync when everything matches', async () => {
    const {cmd, logs} = make(
      {themes: {generatepress: '3.4.0'}},
      getWith([native('generatepress', '3.4.0')], lockManaging('generatepress')),
    )

    const result = await cmd.run()

    expect(result).toEqual({drift: false, missing: [], status: 'in-sync', wrongVersion: []})
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('In sync with loopress.json'))
  })

  it('flags a manifest theme not installed at all, and exits 1', async () => {
    const {cmd, logs} = make({themes: {generatepress: '3.4.0'}}, getWith([]))

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Not installed: generatepress')
  })

  it('folds a collision into "missing" too, but logs it under its own line', async () => {
    const {cmd, logs} = make({themes: {generatepress: '3.4.0'}}, getWith([native('generatepress', '3.4.0')], null))

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Installed outside Loopress: generatepress')
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Not installed'))
  })

  it('flags a version mismatch against a managed theme', async () => {
    const {cmd, logs} = make(
      {themes: {generatepress: '3.4.0'}},
      getWith([native('generatepress', '3.0.0')], lockManaging('generatepress')),
    )

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Version drift: generatepress is 3.0.0, loopress.json pins 3.4.0')
  })

  it('flags a theme managed by Loopress but dropped from loopress.json', async () => {
    const {cmd, logs} = make({}, getWith([native('astra', '4.0.0')], lockManaging('astra')))

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith('Managed by Loopress but dropped from loopress.json: astra')
  })

  it('does not treat an installed-but-unmanaged theme absent from the manifest as drift', async () => {
    const {cmd, logs} = make({}, getWith([native('twentytwentyfive', '1.0.0')]))

    const result = await cmd.run()

    expect(result.status).toBe('in-sync')
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('In sync with loopress.json'))
  })

  it('propagates a non-404 error fetching the instance lock', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === 'loopress/v1/composer/lock') throw new Error('server error', {cause: {response: {statusCode: 500}}})
      return []
    })
    const {cmd} = make({themes: {generatepress: '3.4.0'}}, get)

    await expect(cmd.run()).rejects.toThrow('server error')
  })
})
