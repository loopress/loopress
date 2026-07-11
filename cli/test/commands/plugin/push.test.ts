import {beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/plugin/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

// installPlugin() and activatePlugin() are private; the casts below are the same escape hatch
// used throughout this suite to unit-test command internals.
interface PushInternals {
  activatePlugin(file: string, slug: string): Promise<void>
  failedCount: number
  installPlugin(slug: string): Promise<void>
  wpClient: {post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

function make() {
  const cmd = new Push([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const post = vi.fn()
  const put = vi.fn()
  ;(cmd as unknown as PushInternals).wpClient = {post, put}
  return {cmd: cmd as unknown as PushInternals, logs, post, put}
}

describe('plugin push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('installPlugin', () => {
    it('installs and activates the plugin in a single native call', async () => {
      const {cmd, post} = make()
      post.mockResolvedValueOnce({plugin: 'akismet/akismet', status: 'active'})

      await cmd.installPlugin('akismet')

      expect(post).toHaveBeenCalledWith('wp/v2/plugins', {slug: 'akismet', status: 'active'})
    })

    it('warns and rethrows when the install fails', async () => {
      const {cmd, logs, post} = make()
      post.mockRejectedValueOnce(new Error('boom'))

      await expect(cmd.installPlugin('akismet')).rejects.toThrow('boom')

      expect(logs.warn).toHaveBeenCalledWith('  Failed to install akismet: boom')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('activatePlugin', () => {
    it('activates the plugin by its native file id', async () => {
      const {cmd, put} = make()
      put.mockResolvedValueOnce({plugin: 'akismet/akismet', status: 'active'})

      await cmd.activatePlugin('akismet/akismet', 'akismet')

      expect(put).toHaveBeenCalledWith('wp/v2/plugins/akismet/akismet', {status: 'active'})
    })

    it('warns and rethrows when the activation fails, so Listr marks the task as failed', async () => {
      const {cmd, logs, put} = make()
      put.mockRejectedValueOnce(new Error('nope'))

      await expect(cmd.activatePlugin('akismet/akismet', 'akismet')).rejects.toThrow('nope')

      expect(logs.warn).toHaveBeenCalledWith('  Failed to activate akismet: nope')
      expect(cmd.failedCount).toBe(1)
    })
  })
})
