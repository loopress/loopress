import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {openBrowser} from '../../src/lib/open-browser.js'
import {authorizeWithBrowser} from '../../src/lib/wp-authorize-flow.js'

vi.mock('../../src/lib/open-browser.js', () => ({openBrowser: vi.fn()}))

const RELAY_ORIGIN = 'https://api.loopress.dev'

async function relayCallback(): Promise<{callbackUrl: string; state: string}> {
  await vi.waitFor(() => {
    expect(openBrowser).toHaveBeenCalled()
  })
  const relayUrl = new URL(vi.mocked(openBrowser).mock.calls[0][0])
  const callbackUrl = relayUrl.searchParams.get('callbackUrl')!
  const state = new URL(callbackUrl).searchParams.get('state')!
  return {callbackUrl, state}
}

describe('authorizeWithBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the relay URL with a callbackUrl carrying an unguessable state', async () => {
    const result = authorizeWithBrowser('https://my-wp-site.com', () => {})
    const {callbackUrl} = await relayCallback()

    const relayUrl = new URL(vi.mocked(openBrowser).mock.calls[0][0])
    expect(relayUrl.origin).toBe(RELAY_ORIGIN)
    expect(relayUrl.pathname).toBe('/auth/wp-authorize')
    expect(relayUrl.searchParams.get('wpUrl')).toBe('https://my-wp-site.com')

    const parsed = new URL(callbackUrl)
    expect(parsed.host).toMatch(/^localhost:\d+$/)
    expect(parsed.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/)

    await got.post(callbackUrl, {form: {password: 'p', user_login: 'u'}, headers: {origin: RELAY_ORIGIN}})
    await result
  })

  it('resolves on a POST from the relay origin that echoes the state', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {callbackUrl} = await relayCallback()

    await got.post(callbackUrl, {
      form: {password: 'app-pass-123', user_login: 'admin'},
      headers: {origin: RELAY_ORIGIN},
    })

    await expect(result).resolves.toEqual({password: 'app-pass-123', userLogin: 'admin'})
  })

  it('does not accept credentials passed in the query string', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {callbackUrl} = await relayCallback()

    const probe = new URL(callbackUrl)
    probe.searchParams.set('password', 'app-pass-123')
    probe.searchParams.set('user_login', 'admin')
    const res = await got(probe.href, {headers: {origin: RELAY_ORIGIN}, throwHttpErrors: false})
    expect(res.statusCode).toBe(400)

    await got.post(callbackUrl, {form: {password: 'real', user_login: 'admin'}, headers: {origin: RELAY_ORIGIN}})
    await expect(result).resolves.toEqual({password: 'real', userLogin: 'admin'})
  })

  it('rejects and stops the server when the state does not match', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {callbackUrl} = await relayCallback()

    const forged = new URL(callbackUrl)
    forged.searchParams.set('state', 'deadbeef'.repeat(8))
    // Captured before the triggering request: the server rejects `result` synchronously while
    // handling it, so attaching this after `await got.post(...)` below is a real race, an
    // unhandled rejection between the reject and this line, not just a style preference.
    const assertion = expect(result).rejects.toThrow(/state/i)
    const res = await got.post(forged.href, {
      form: {password: 'evil', user_login: 'attacker'},
      headers: {origin: RELAY_ORIGIN},
      throwHttpErrors: false,
    })
    expect(res.statusCode).toBe(403)
    await assertion

    await expect(
      got.post(callbackUrl, {form: {password: 'p', user_login: 'u'}, headers: {origin: RELAY_ORIGIN}, retry: {limit: 0}}),
    ).rejects.toThrow()
  })

  it('rejects a POST whose Origin is not the relay', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {callbackUrl} = await relayCallback()

    const assertion = expect(result).rejects.toThrow(/cross-origin/i)
    const res = await got.post(callbackUrl, {
      form: {password: 'evil', user_login: 'attacker'},
      headers: {origin: 'https://evil.example'},
      throwHttpErrors: false,
    })
    expect(res.statusCode).toBe(403)
    await assertion
  })

  it('rejects when the user cancels authorization in WordPress', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {callbackUrl} = await relayCallback()

    const cancelUrl = new URL(callbackUrl)
    cancelUrl.searchParams.set('cancelled', '1')
    const assertion = expect(result).rejects.toThrow(/rejected/i)
    await got(cancelUrl.href, {throwHttpErrors: false})
    await assertion
  })
})
