import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/option/push.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {type LocalOption} from '../../../src/utils/option-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PushInternals = {
  dryRun: boolean
  failedCount: number
  pushOption(option: LocalOption, task?: {output: string}): Promise<void>
  wpClient: {get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PushInternals} {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return {cmd: cmd as unknown as PushInternals}
}

// Mirrors WpClient.isNotFoundError()'s expected shape (see lib/wp-client.ts).
function notFoundError(): Error {
  return new Error('not found', {cause: {response: {statusCode: 404}}})
}

describe('option push', () => {
  describe('pushOption', () => {
    it('reads the option’s current revision first, then PUTs the value, autoload, and that revision as a precondition (#234)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({autoload: 'no', name: 'wpseo_titles', revision: 'rev-1', value: {titleSep: '_'}})
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {get, put}
      const task = {output: ''}

      await cmd.pushOption({autoload: 'no', name: 'wpseo_titles', value: {titleSep: '-'}}, task)

      expect(get).toHaveBeenCalledWith('loopress/v1/options/wpseo_titles')
      expect(put).toHaveBeenCalledWith('loopress/v1/options/wpseo_titles', {
        autoload: 'no',
        expectedRevision: 'rev-1',
        value: {titleSep: '-'},
      })
      expect(task.output).toBe('Pushed: wpseo_titles')
    })

    it('omits expectedRevision for an option that does not exist remotely yet (a first push)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {get, put}
      const task = {output: ''}

      await cmd.pushOption({autoload: 'yes', name: 'brand_new_option', value: 'first value'}, task)

      expect(put).toHaveBeenCalledWith('loopress/v1/options/brand_new_option', {autoload: 'yes', value: 'first value'})
      expect(task.output).toBe('Pushed: brand_new_option')
    })

    it('sends the declared refs so WordPress turns the paths back into IDs', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(notFoundError())
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {get, put}
      const refs = {purchase_page: 'page'}

      await cmd.pushOption({autoload: 'yes', name: 'edd_settings', refs, value: {purchase_page: 'checkout'}})

      expect(put).toHaveBeenCalledWith('loopress/v1/options/edd_settings', {autoload: 'yes', refs, value: {purchase_page: 'checkout'}})
    })

    it('does nothing in dry-run mode, not even reading the current revision', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const get = vi.fn()
      const put = vi.fn()
      cmd.wpClient = {get, put}
      const task = {output: ''}

      await cmd.pushOption({autoload: 'yes', name: 'blogname', value: 'Hello'}, task)

      expect(get).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
      expect(task.output).toContain('[dry-run]')
    })

    it('records the failure and rethrows so Listr marks the task failed when the write is refused as stale (412)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockResolvedValueOnce({autoload: 'yes', name: 'blogname', revision: 'rev-1', value: 'Hello'})
      const put = vi
        .fn()
        .mockRejectedValueOnce(new Error('Request failed (412) on .../options/blogname: "blogname" changed on WordPress since it was last read.'))
      cmd.wpClient = {get, put}
      const task = {output: ''}

      await expect(cmd.pushOption({autoload: 'yes', name: 'blogname', value: 'Hello'}, task)).rejects.toThrow('412')

      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })

    it('records the failure and rethrows when reading the current revision itself fails (not a 404)', async () => {
      const {cmd} = makeCmd()
      const get = vi.fn().mockRejectedValueOnce(new Error('server error', {cause: {response: {statusCode: 500}}}))
      const put = vi.fn()
      cmd.wpClient = {get, put}
      const task = {output: ''}

      await expect(cmd.pushOption({autoload: 'yes', name: 'blogname', value: 'Hello'}, task)).rejects.toThrow('server error')

      expect(put).not.toHaveBeenCalled()
      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('run', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-option-push-test-'))
      mkdirSync(join(dir, 'options'), {recursive: true})
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    class TestPush extends Push {
      protected override async guardProductionPush(): Promise<void> {}
      protected override async recordDeployment(): Promise<void> {}

      setup(config: LoopressLocalConfig, siteConfig: EnvironmentConfig) {
        this.localConfig = config
        this.siteConfig = siteConfig
        this.dryRun = false
      }
    }

    function makeRunCmd() {
      const cmd = new TestPush([], fakeOclifConfig)
      cmd.setup({rootDir: dir}, makeEnv('production', 'https://acme.com'))
      const logs = silenceLogs(cmd)
      const get = vi.fn().mockRejectedValue(notFoundError())
      const put = vi.fn().mockResolvedValue({})
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, put}
      return {cmd, logs, put}
    }

    function writeOption(option: Record<string, unknown>): void {
      writeFileSync(join(dir, 'options', `${String(option.name)}.json`), JSON.stringify(option))
    }

    it('pushes every writable option, skips readonly ones, and returns both lists', async () => {
      writeOption({autoload: 'yes', name: 'blogname', value: 'Hello'})
      writeOption({autoload: 'no', name: 'siteurl', readonly: true, value: 'https://acme.com'})
      writeOption({autoload: 'no', name: 'home', readonly: true, value: 'https://acme.com'})
      const {cmd, logs, put} = makeRunCmd()

      const result = await cmd.run()

      expect(result).toEqual({pushed: ['blogname'], skipped: ['home', 'siteurl'], status: 'success'})
      expect(put).toHaveBeenCalledTimes(1)
      expect(put).toHaveBeenCalledWith('loopress/v1/options/blogname', {autoload: 'yes', value: 'Hello'})
      expect(logs.log).toHaveBeenCalledWith('Pushing tracked options to https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`Options path: ${join(dir, 'options')}`)
      expect(logs.log).toHaveBeenCalledWith('Skipping 2 readonly options: home, siteurl')
      expect(logs.log).toHaveBeenCalledWith('Found 1 option to push')
      expect(logs.log).toHaveBeenCalledWith('All options pushed.')
    })

    it('does not log a "Skipping" line when no option is readonly', async () => {
      writeOption({autoload: 'yes', name: 'blogname', value: 'Hello'})
      const {cmd, logs} = makeRunCmd()

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Skipping'))
    })

    it('warns about an unparseable file instead of aborting the rest', async () => {
      writeOption({autoload: 'yes', name: 'blogname', value: 'Hello'})
      writeFileSync(join(dir, 'options', 'broken.json'), JSON.stringify({autoload: 'yes', value: 1}))
      const {cmd, logs, put} = makeRunCmd()

      await cmd.run()

      expect(put).toHaveBeenCalledTimes(1)
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('broken.json'))
    })

    it('reports a dry-run status and does not report success on a dry run', async () => {
      writeOption({autoload: 'yes', name: 'blogname', value: 'Hello'})
      const {cmd, logs, put} = makeRunCmd()
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true

      const result = await cmd.run()

      expect(result).toEqual({pushed: ['blogname'], skipped: [], status: 'dry-run'})
      expect(put).not.toHaveBeenCalled()
      expect(logs.log).not.toHaveBeenCalledWith('All options pushed.')
    })

    it('errors with the failed count instead of reporting success', async () => {
      writeOption({autoload: 'yes', name: 'blogname', value: 'Hello'})
      writeOption({autoload: 'yes', name: 'blogdescription', value: 'Tagline'})
      const {cmd, logs, put} = makeRunCmd()
      put.mockRejectedValueOnce(new Error('boom'))

      await expect(cmd.run()).rejects.toThrow('1 option failed to push.')
      expect(logs.log).not.toHaveBeenCalledWith('All options pushed.')
    })
  })
})
