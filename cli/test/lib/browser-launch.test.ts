import {chromium} from 'playwright-core'
import {describe, expect, it, vi} from 'vitest'

import {launchLocalBrowser} from '../../src/lib/browser-launch.js'

vi.mock('playwright-core', () => ({chromium: {launch: vi.fn()}}))

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }

  throw new Error('expected a rejection')
}

describe('launchLocalBrowser', () => {
  it('returns the first channel that launches, headless', async () => {
    const browser = {}
    vi.mocked(chromium.launch)
      .mockReset()
      .mockResolvedValueOnce(browser as never)

    await expect(launchLocalBrowser()).resolves.toBe(browser)
    expect(chromium.launch).toHaveBeenCalledTimes(1)
    expect(chromium.launch).toHaveBeenCalledWith({channel: 'chrome', headless: true})
  })

  it('falls back to Edge, then Chromium, in that order', async () => {
    const browser = {}
    vi.mocked(chromium.launch)
      .mockReset()
      .mockRejectedValueOnce(new Error('no chrome'))
      .mockRejectedValueOnce(new Error('no edge'))
      .mockResolvedValueOnce(browser as never)

    await expect(launchLocalBrowser()).resolves.toBe(browser)
    expect(vi.mocked(chromium.launch).mock.calls.map(([options]) => options?.channel)).toEqual([
      'chrome',
      'msedge',
      'chromium',
    ])
  })

  it('throws an actionable error carrying the last launch failure when no browser is installed', async () => {
    const last = new Error('no chromium')
    vi.mocked(chromium.launch)
      .mockReset()
      .mockRejectedValueOnce(new Error('no chrome'))
      .mockRejectedValueOnce(new Error('no edge'))
      .mockRejectedValueOnce(last)

    const error = await rejectionOf(launchLocalBrowser())

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toMatch(/^No local Chrome, Edge, or Chromium install found\./)
    expect(error.cause).toBe(last)
  })
})
