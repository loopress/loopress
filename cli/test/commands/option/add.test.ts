import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Add from '../../../src/commands/option/add.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type AddInternals = {
  dryRun: boolean
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
}

function makeCmd(argv: string[]) {
  const cmd = new Add(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as AddInternals
  internals.siteConfig = makeEnv('staging', 'https://staging.acme.com')
  return {cmd, internals, logs}
}

function notFound(): Error {
  return new Error('Not Found', {cause: {response: {statusCode: 404}}})
}

describe('option add', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-option-add-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('writes a local file, defaulting readonly to false for an ordinary option', async () => {
    const {cmd, internals} = makeCmd(['wpseo_titles', '--path', dir])
    const get = vi.fn().mockResolvedValueOnce({autoload: 'no', name: 'wpseo_titles', value: {titleSep: '-'}})
    internals.wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/options/wpseo_titles')
    const written = JSON.parse(readFileSync(join(dir, 'wpseo_titles.json'), 'utf8')) as Record<string, unknown>
    expect(written).toMatchObject({autoload: 'no', name: 'wpseo_titles', readonly: false, value: {titleSep: '-'}})
  })

  // siteurl is environment-owned (see option-format.ts's READONLY_BY_DEFAULT_OPTION_NAMES):
  // pushing a value copied from another environment would repoint the target site's own URL.
  it('defaults readonly to true for an environment-owned option like siteurl', async () => {
    const {cmd, internals} = makeCmd(['siteurl', '--path', dir])
    const get = vi.fn().mockResolvedValueOnce({autoload: 'yes', name: 'siteurl', value: 'https://example.com'})
    internals.wpClient = {get}

    await cmd.run()

    const written = JSON.parse(readFileSync(join(dir, 'siteurl.json'), 'utf8')) as Record<string, unknown>
    expect(written.readonly).toBe(true)
  })

  it('refuses a name already owned by the plugin/theme resources, without calling the API', async () => {
    const {cmd, internals} = makeCmd(['active_plugins', '--path', dir])
    const get = vi.fn()
    internals.wpClient = {get}

    await expect(cmd.run()).rejects.toThrow('lps plugin')
    expect(get).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'active_plugins.json'))).toBe(false)
  })

  it('errors clearly when the option does not exist on the site', async () => {
    const {cmd, internals} = makeCmd(['does_not_exist', '--path', dir])
    const get = vi.fn().mockRejectedValueOnce(notFound())
    internals.wpClient = {get}

    await expect(cmd.run()).rejects.toThrow('was not found')
    expect(existsSync(join(dir, 'does_not_exist.json'))).toBe(false)
  })

  it('does not write anything on a dry run', async () => {
    const {cmd, internals} = makeCmd(['blogname', '--path', dir])
    internals.dryRun = true
    const get = vi.fn().mockResolvedValueOnce({autoload: 'yes', name: 'blogname', value: 'Hello'})
    internals.wpClient = {get}

    await cmd.run()

    expect(existsSync(join(dir, 'blogname.json'))).toBe(false)
  })
})
