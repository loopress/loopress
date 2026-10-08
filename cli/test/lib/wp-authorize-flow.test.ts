import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {openBrowser} from '../../src/lib/open-browser.js'
import {authorizeWithBrowser} from '../../src/lib/wp-authorize-flow.js'

vi.mock('../../src/lib/open-browser.js', () => ({openBrowser: vi.fn()}))

/** The authorize-application.php URL the CLI opened, and its success/reject URLs. */
async function openedAuthorizeUrl(): Promise<{authorizeUrl: URL; rejectUrl: URL; successUrl: URL}> {
  await vi.waitFor(() => {
    expect(openBrowser).toHaveBeenCalled()
  })
  const authorizeUrl = new URL(vi.mocked(openBrowser).mock.calls[0][0])
  return {
    authorizeUrl,
    rejectUrl: new URL(authorizeUrl.searchParams.get('reject_url')!),
    successUrl: new URL(authorizeUrl.searchParams.get('success_url')!),
  }
}

/** What WordPress does on approval: redirect to success_url with the credentials appended. */
function approvedBy(successUrl: URL, credentials: {password: string; user_login: string}): string {
  const url = new URL(successUrl)
  url.searchParams.set('site_url', 'https://example.com')
  url.searchParams.set('user_login', credentials.user_login)
  url.searchParams.set('password', credentials.password)
  return url.href
}

describe('authorizeWithBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("opens the site's own authorize-application.php, with no relay in between", async () => {
    const result = authorizeWithBrowser('https://my-wp-site.com', () => {})
    const {authorizeUrl, successUrl} = await openedAuthorizeUrl()

    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe('https://my-wp-site.com/wp-admin/authorize-application.php')
    expect(authorizeUrl.searchParams.get('app_name')).toBe('Loopress')

    await got(approvedBy(successUrl, {password: 'p', user_login: 'u'}))
    await result
  })

  // WordPress 7.0+ exempts the literal 127.0.0.1 (not `localhost`) from its HTTPS requirement.
  it('uses a 127.0.0.1 loopback success_url carrying an unguessable state', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {successUrl} = await openedAuthorizeUrl()

    expect(successUrl.protocol).toBe('http:')
    expect(successUrl.hostname).toBe('127.0.0.1')
    expect(successUrl.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/)

    await got(approvedBy(successUrl, {password: 'p', user_login: 'u'}))
    await result
  })

  it('resolves with the credentials WordPress appends to success_url', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {successUrl} = await openedAuthorizeUrl()

    const res = await got(approvedBy(successUrl, {password: 'abcd efgh ijkl', user_login: 'admin'}))

    expect(res.body).toContain('Authorization successful!')
    await expect(result).resolves.toEqual({password: 'abcd efgh ijkl', userLogin: 'admin'})
  })

  it('answers 400 and keeps waiting when the credentials are incomplete', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {successUrl} = await openedAuthorizeUrl()

    const incomplete = new URL(successUrl)
    incomplete.searchParams.set('user_login', 'admin')
    const res = await got(incomplete.href, {throwHttpErrors: false})
    expect(res.statusCode).toBe(400)

    await got(approvedBy(successUrl, {password: 'p', user_login: 'admin'}))
    await expect(result).resolves.toEqual({password: 'p', userLogin: 'admin'})
  })

  it('rejects and stops the server when the state does not match', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {successUrl} = await openedAuthorizeUrl()

    const forged = new URL(successUrl)
    forged.searchParams.set('state', 'deadbeef'.repeat(8))
    // Assertion listed before the triggering request: the server rejects `result` synchronously
    // while handling it, so attaching it after `await got(...)` is a real race, an unhandled
    // rejection between the reject and the assertion, not just a style preference.
    const [, res] = await Promise.all([
      expect(result).rejects.toThrow(/state/i),
      got(approvedBy(forged, {password: 'evil', user_login: 'attacker'}), {throwHttpErrors: false}),
    ])
    expect(res.statusCode).toBe(403)

    await expect(got(approvedBy(successUrl, {password: 'p', user_login: 'u'}), {retry: {limit: 0}})).rejects.toThrow()
  })

  it('rejects a request sent by a page script (any Origin header), since WordPress redirects without one', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {successUrl} = await openedAuthorizeUrl()

    const [, res] = await Promise.all([
      expect(result).rejects.toThrow(/cross-origin/i),
      got(approvedBy(successUrl, {password: 'evil', user_login: 'attacker'}), {
        headers: {origin: 'https://evil.example'},
        throwHttpErrors: false,
      }),
    ])
    expect(res.statusCode).toBe(403)
  })

  it('rejects when the user cancels authorization in WordPress', async () => {
    const result = authorizeWithBrowser('https://example.com', () => {})
    const {rejectUrl} = await openedAuthorizeUrl()

    // WordPress appends `success=false` to reject_url.
    rejectUrl.searchParams.set('success', 'false')
    await Promise.all([expect(result).rejects.toThrow(/rejected/i), got(rejectUrl.href, {throwHttpErrors: false})])
  })
})
