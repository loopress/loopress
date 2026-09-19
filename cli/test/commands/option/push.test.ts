import {describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/option/push.js'
import {type LocalOption} from '../../../src/utils/option-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

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
})
