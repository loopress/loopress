import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/option/pull.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LocalOption} from '../../../src/utils/option-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PullInternals = {
  dryRun: boolean
  pullOption(dir: string, option: LocalOption): Promise<LocalOption | null>
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
}

function makeCmd(argv: string[]) {
  const cmd = new Pull(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as PullInternals
  internals.siteConfig = makeEnv('staging', 'https://staging.acme.com')
  return {cmd, internals, logs}
}

function notFound(): Error {
  return new Error('Not Found', {cause: {response: {statusCode: 404}}})
}

describe('option pull', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-option-pull-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('pullOption', () => {
    it('writes the refreshed value, preserving the local readonly flag', async () => {
      const {internals} = makeCmd([])
      const get = vi.fn().mockResolvedValueOnce({autoload: 'yes', name: 'wpseo_titles', value: {new: true}})
      internals.wpClient = {get}

      const result = await internals.pullOption(dir, {autoload: 'no', name: 'wpseo_titles', readonly: true, value: {old: true}})

      expect(get).toHaveBeenCalledWith('loopress/v1/options/wpseo_titles')
      expect(result).toMatchObject({autoload: 'yes', name: 'wpseo_titles', readonly: true, value: {new: true}})
      const written = JSON.parse(readFileSync(join(dir, 'wpseo_titles.json'), 'utf8')) as Record<string, unknown>
      expect(written).toMatchObject({readonly: true, value: {new: true}})
    })

    it('returns null (does not write) when the option 404s on this environment', async () => {
      const {internals} = makeCmd([])
      const get = vi.fn().mockRejectedValueOnce(notFound())
      internals.wpClient = {get}

      const result = await internals.pullOption(dir, {autoload: 'yes', name: 'ghost', value: 'x'})

      expect(result).toBeNull()
      expect(existsSync(join(dir, 'ghost.json'))).toBe(false)
    })

    it('rethrows any non-404 error', async () => {
      const {internals} = makeCmd([])
      const get = vi.fn().mockRejectedValueOnce(new Error('boom'))
      internals.wpClient = {get}

      await expect(internals.pullOption(dir, {autoload: 'yes', name: 'blogname', value: 'x'})).rejects.toThrow('boom')
    })
  })

  describe('run', () => {
    it('logs and returns early when nothing is tracked locally', async () => {
      const {cmd, internals, logs} = makeCmd([dir])
      const get = vi.fn()
      internals.wpClient = {get}

      const result = await cmd.run()

      expect(get).not.toHaveBeenCalled()
      expect(result).toEqual([])
      expect(logs.log).toHaveBeenCalledWith('Nothing tracked locally. Run `lps option add <name>` first.')
    })

    it('removes the local file for a tracked option no longer found on WordPress', async () => {
      writeFileSync(join(dir, 'ghost.json'), JSON.stringify({autoload: 'yes', name: 'ghost', value: 'x'}))
      const {cmd, internals} = makeCmd([dir, '--yes'])
      internals.wpClient = {get: vi.fn().mockRejectedValueOnce(notFound())}

      await cmd.run()

      expect(existsSync(join(dir, 'ghost.json'))).toBe(false)
    })

    it('does not call the API on a dry run', async () => {
      writeFileSync(join(dir, 'blogname.json'), JSON.stringify({autoload: 'yes', name: 'blogname', value: 'Old'}))
      const {cmd, internals} = makeCmd([dir])
      internals.dryRun = true
      const get = vi.fn()
      internals.wpClient = {get}

      await cmd.run()

      expect(get).not.toHaveBeenCalled()
    })
  })
})
