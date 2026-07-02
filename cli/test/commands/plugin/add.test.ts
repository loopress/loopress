import {beforeEach, describe, expect, it, vi} from 'vitest'

import {resolvePluginVersion} from '../../../src/commands/plugin/add.js'

const {get} = vi.hoisted(() => ({get: vi.fn()}))

vi.mock('got', () => ({
  default: {
    extend: vi.fn(() => vi.fn()),
    get,
  },
}))

describe('resolvePluginVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a pinned version as-is without calling WordPress.org', async () => {
    await expect(resolvePluginVersion('woocommerce', '8.9.1')).resolves.toBe('8.9.1')
    expect(get).not.toHaveBeenCalled()
  })

  it('resolves "latest" through the WordPress.org API', async () => {
    get.mockReturnValue({json: async () => ({slug: 'woocommerce', version: '9.0.0'})})

    await expect(resolvePluginVersion('woocommerce', 'latest')).resolves.toBe('9.0.0')
    expect(get).toHaveBeenCalledOnce()
  })

  it('throws a friendly error when the API request fails', async () => {
    get.mockReturnValue({
      async json() {
        throw new Error('network down')
      },
    })

    await expect(resolvePluginVersion('ghost-plugin', 'latest')).rejects.toThrow(
      'Plugin "ghost-plugin" not found on WordPress.org.',
    )
  })

  it('throws a friendly error when the API reports an unknown plugin', async () => {
    get.mockReturnValue({json: async () => ({error: 'Plugin not found.'})})

    await expect(resolvePluginVersion('ghost-plugin', 'latest')).rejects.toThrow(
      'Plugin "ghost-plugin" not found on WordPress.org.',
    )
  })
})
