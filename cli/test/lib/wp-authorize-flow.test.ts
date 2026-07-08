import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {openBrowser} from '../../src/lib/open-browser.js'
import {authorizeWithBrowser} from '../../src/lib/wp-authorize-flow.js'

vi.mock('../../src/lib/open-browser.js', () => ({openBrowser: vi.fn()}))

async function waitForOpenUrl(): Promise<URL> {
  await vi.waitFor(() => {
    expect(openBrowser).toHaveBeenCalled()
  })
  return new URL(vi.mocked(openBrowser).mock.calls[0][0])
}

describe('authorizeWithBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the api.loopress.dev relay URL with callbackUrl and wpUrl params', async () => {
    authorizeWithBrowser('https://my-wp-site.com', () => {})
    const relayUrl = await waitForOpenUrl()

    expect(relayUrl.origin).toBe('https://api.loopress.dev')
    expect(relayUrl.pathname).toBe('/auth/wp-authorize')
    expect(relayUrl.searchParams.get('wpUrl')).toBe('https://my-wp-site.com')
    expect(relayUrl.searchParams.get('callbackUrl')).toMatch(/^http:\/\/localhost:\d+$/)
  })

  it('resolves with password and userLogin received via POST body', async () => {
    const resultPromise = authorizeWithBrowser('https://example.com', () => {})
    const relayUrl = await waitForOpenUrl()
    const callbackUrl = relayUrl.searchParams.get('callbackUrl')!

    await got(`${callbackUrl}/callback`, {
      method: 'POST',
      // eslint-disable-next-line camelcase
      form: {password: 'app-pass-123', user_login: 'admin'},
    })

    await expect(resultPromise).resolves.toEqual({password: 'app-pass-123', userLogin: 'admin'})
  })

  it('rejects when the user cancels authorization in WordPress', async () => {
    const resultPromise = authorizeWithBrowser('https://example.com', () => {})
    const relayUrl = await waitForOpenUrl()
    const callbackUrl = relayUrl.searchParams.get('callbackUrl')!

    const assertion = expect(resultPromise).rejects.toThrow(/rejected/i)
    await got(`${callbackUrl}/callback?cancelled=1`)
    await assertion
  })
})
