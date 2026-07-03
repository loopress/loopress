import {beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/plugin/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

// installAndActivate() and activatePlugin() are private; the casts below are the
// same escape hatch used throughout this suite to unit-test command internals.
interface PushInternals {
  activatePlugin(slug: string): Promise<void>
  failedCount: number
  installAndActivate(slug: string, version: string): Promise<void>
  wpClient: {post: ReturnType<typeof vi.fn>}
}

function make() {
  const cmd = new Push([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const post = vi.fn()
  ;(cmd as unknown as PushInternals).wpClient = {post}
  return {cmd: cmd as unknown as PushInternals, logs, post}
}

describe('plugin push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('installAndActivate', () => {
    it('installs then activates the plugin', async () => {
      const {cmd, post} = make()
      post.mockResolvedValueOnce({message: 'Installed akismet 5.3'}).mockResolvedValueOnce({message: 'Activated akismet'})

      await cmd.installAndActivate('akismet', '5.3')

      expect(post).toHaveBeenNthCalledWith(1, 'loopress/v1/plugins/install', {slug: 'akismet', version: '5.3'})
      expect(post).toHaveBeenNthCalledWith(2, 'loopress/v1/plugins/activate', {slug: 'akismet'})
    })

    it('warns and skips activation when the install fails', async () => {
      const {cmd, logs, post} = make()
      post.mockRejectedValueOnce(new Error('boom'))

      await cmd.installAndActivate('akismet', '5.3')

      expect(post).toHaveBeenCalledOnce()
      expect(logs.warn).toHaveBeenCalledWith('  Failed to install akismet: boom')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('activatePlugin', () => {
    it('warns without throwing when the activation fails', async () => {
      const {cmd, logs, post} = make()
      post.mockRejectedValueOnce(new Error('nope'))

      await cmd.activatePlugin('akismet')

      expect(logs.warn).toHaveBeenCalledWith('  Failed to activate akismet: nope')
      expect(cmd.failedCount).toBe(1)
    })
  })
})
