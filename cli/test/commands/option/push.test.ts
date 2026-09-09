import {describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/option/push.js'
import {type LocalOption} from '../../../src/utils/option-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type PushInternals = {
  dryRun: boolean
  failedCount: number
  pushOption(option: LocalOption, task?: {output: string}): Promise<void>
  wpClient: {put: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PushInternals} {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return {cmd: cmd as unknown as PushInternals}
}

describe('option push', () => {
  describe('pushOption', () => {
    it('PUTs the value and autoload to the option endpoint', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn().mockResolvedValueOnce({})
      cmd.wpClient = {put}
      const task = {output: ''}

      await cmd.pushOption({autoload: 'no', name: 'wpseo_titles', value: {titleSep: '-'}}, task)

      expect(put).toHaveBeenCalledWith('loopress/v1/options/wpseo_titles', {autoload: 'no', value: {titleSep: '-'}})
      expect(task.output).toBe('Pushed: wpseo_titles')
    })

    it('does nothing in dry-run mode', async () => {
      const {cmd} = makeCmd()
      cmd.dryRun = true
      const put = vi.fn()
      cmd.wpClient = {put}
      const task = {output: ''}

      await cmd.pushOption({autoload: 'yes', name: 'blogname', value: 'Hello'}, task)

      expect(put).not.toHaveBeenCalled()
      expect(task.output).toContain('[dry-run]')
    })

    it('records the failure and rethrows so Listr marks the task failed', async () => {
      const {cmd} = makeCmd()
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      cmd.wpClient = {put}
      const task = {output: ''}

      await expect(cmd.pushOption({autoload: 'yes', name: 'blogname', value: 'Hello'}, task)).rejects.toThrow('boom')

      expect(task.output).toContain('Failed to push')
      expect(cmd.failedCount).toBe(1)
    })
  })
})
