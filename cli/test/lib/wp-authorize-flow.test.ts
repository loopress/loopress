import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {openBrowser} from '../../src/lib/open-browser.js'
import {authorizeWithBrowser} from '../../src/lib/wp-authorize-flow.js'

vi.mock('../../src/lib/open-browser.js', () => ({openBrowser: vi.fn()}))

async function waitForAuthorizeUrl(): Promise<URL> {
  await vi.waitFor(() => {
    expect(openBrowser).toHaveBeenCalled()
  })
  return new URL(vi.mocked(openBrowser).mock.calls[0][0])
}

// The server only binds to the 127.0.0.1 interface; resolving "localhost" can flakily
// hit the ::1 (IPv6) stack instead and fail to connect, so tests dial the IP directly.
function toLoopbackIp(url: string): string {
  return url.replace('localhost', '127.0.0.1')
}

describe('authorizeWithBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens authorize-application.php with app_name, success_url, and reject_url pointing at a local callback server', async () => {
    const resultPromise = authorizeWithBrowser('https://example.com', () => {})
    const authorizeUrl = await waitForAuthorizeUrl()

    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe('https://example.com/wp-admin/authorize-application.php')
    expect(authorizeUrl.searchParams.get('app_name')).toBe('Loopress')
    expect(authorizeUrl.searchParams.get('success_url')).toMatch(/^http:\/\/localhost:\d+\/callback$/)
    expect(authorizeUrl.searchParams.get('reject_url')).toMatch(/^http:\/\/localhost:\d+\/reject$/)

    await got(toLoopbackIp(authorizeUrl.searchParams.get('success_url')!), {
      searchParams: {password: 'secret', 'user_login': 'admin'},
    })
    await resultPromise
  })

  it('resolves with the user_login and password sent to the success callback', async () => {
    const resultPromise = authorizeWithBrowser('https://example.com', () => {})
    const authorizeUrl = await waitForAuthorizeUrl()
    const successUrl = toLoopbackIp(authorizeUrl.searchParams.get('success_url')!)

    await got(successUrl, {searchParams: {password: 'app pass 1234', 'user_login': 'admin'}})

    await expect(resultPromise).resolves.toEqual({password: 'app pass 1234', userLogin: 'admin'})
  })

  it('closes the local server immediately after receiving the callback', async () => {
    const resultPromise = authorizeWithBrowser('https://example.com', () => {})
    const authorizeUrl = await waitForAuthorizeUrl()
    const successUrl = toLoopbackIp(authorizeUrl.searchParams.get('success_url')!)

    await got(successUrl, {searchParams: {password: 'secret', 'user_login': 'admin'}})
    await resultPromise

    await expect(got(successUrl)).rejects.toThrow()
  })

  it('rejects with a clear error when the user declines authorization in WordPress', async () => {
    const resultPromise = authorizeWithBrowser('https://example.com', () => {})
    const authorizeUrl = await waitForAuthorizeUrl()
    const rejectUrl = toLoopbackIp(authorizeUrl.searchParams.get('reject_url')!)

    // Attach the rejection assertion before triggering the callback: the server rejects
    // `resultPromise` synchronously while handling the request, which can race ahead of
    // `got(rejectUrl)`'s own promise settling and get reported as an unhandled rejection
    // if nothing is listening on `resultPromise` yet.
    const assertion = expect(resultPromise).rejects.toThrow(/rejected/i)
    await got(rejectUrl)
    await assertion
  })

  it('never logs the received password', async () => {
    const logs: string[] = []
    const resultPromise = authorizeWithBrowser('https://example.com', (message) => logs.push(message))
    const authorizeUrl = await waitForAuthorizeUrl()
    const successUrl = toLoopbackIp(authorizeUrl.searchParams.get('success_url')!)

    await got(successUrl, {searchParams: {password: 'super-secret-app-password', 'user_login': 'admin'}})
    await resultPromise

    expect(logs.join('\n')).not.toContain('super-secret-app-password')
  })
})
