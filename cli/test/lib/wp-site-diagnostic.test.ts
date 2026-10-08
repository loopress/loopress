import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {diagnoseWpSite} from '../../src/lib/wp-site-diagnostic.js'

vi.mock('got', () => ({
  default: {
    get: vi.fn(),
  },
}))

function mockIndex(body: unknown) {
  vi.mocked(got.get).mockReturnValueOnce({json: async () => body} as never)
}

const APP_PASSWORDS_INDEX = {authentication: {'application-passwords': {endpoints: {authorization: 'https://example.com/wp-admin/authorize-application.php'}}}}

/** Mocks the version sources, in the order they're read: `/feed/`, then the home page. */
function mockVersionSources(feed: Error | string, home: Error | string = new Error('not reached')) {
  for (const body of [feed, home]) {
    vi.mocked(got.get).mockReturnValueOnce({
      async text() {
        if (body instanceof Error) throw body
        return body
      },
    } as never)
  }
}

describe('diagnoseWpSite', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('accepts a plain http:// URL (WordPress does not require HTTPS for Application Passwords, e.g. local dev sites)', async () => {
    mockIndex({authentication: {'application-passwords': {endpoints: {authorization: 'https://example.local/wp-admin/authorize-application.php'}}}})

    const result = await diagnoseWpSite('https://example.local')

    expect(result).toEqual({ok: true})
    expect(got.get).toHaveBeenCalledWith('https://example.local/wp-json/', expect.objectContaining({timeout: expect.anything()}))
  })

  it('reports an unreachable or blocked REST API', async () => {
    vi.mocked(got.get).mockImplementationOnce(() => {
      throw new Error('ECONNREFUSED')
    })

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: false, reason: expect.stringContaining('wp-json')})
  })

  it('reports Application Passwords as unavailable when the index omits them (disabled by a filter, or WordPress older than 5.6)', async () => {
    mockIndex({authentication: {}})

    const result = await diagnoseWpSite('https://no-app-password.example.com')

    expect(result).toEqual({ok: false, reason: expect.stringContaining('Application Passwords')})
  })

  it('reports Application Passwords as unavailable when the index has no authentication key at all', async () => {
    mockIndex({})

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: false, reason: expect.stringContaining('Application Passwords')})
  })

  // Regression coverage: got's .json<T>() cast is unchecked, a server that literally returns
  // the JSON document `null` (a misbehaving proxy or security plugin) used to crash with a
  // TypeError instead of reaching this diagnostic.
  it('reports Application Passwords as unavailable instead of throwing when the index body is null', async () => {
    mockIndex(null)

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: false, reason: expect.stringContaining('Application Passwords')})
  })

  it('passes when the index advertises application-passwords authentication', async () => {
    mockIndex({authentication: {'application-passwords': {endpoints: {authorization: 'https://example.com/wp-admin/authorize-application.php'}}}})

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: true})
  })

  describe('WordPress version gate (loopback success_url only accepted from 7.0)', () => {
    it('sends a WordPress 6.x site to manual entry, naming the version found in the feed', async () => {
      mockIndex(APP_PASSWORDS_INDEX)
      mockVersionSources('<generator>https://wordpress.org/?v=6.9.4</generator>')

      const result = await diagnoseWpSite('https://example.com')

      expect(result).toEqual({ok: false, reason: expect.stringContaining('WordPress 6.9.4')})
      expect(got.get).toHaveBeenCalledWith('https://example.com/feed/', expect.anything())
    })

    it('accepts WordPress 7.0 and later', async () => {
      mockIndex(APP_PASSWORDS_INDEX)
      mockVersionSources('<generator>https://wordpress.org/?v=7.0</generator>')

      expect(await diagnoseWpSite('https://example.com')).toEqual({ok: true})
    })

    it('falls back to the home page generator meta when the feed is unavailable', async () => {
      mockIndex(APP_PASSWORDS_INDEX)
      mockVersionSources(new Error('404'), '<meta name="generator" content="WordPress 6.8.1" />')

      const result = await diagnoseWpSite('https://example.com')

      expect(result).toEqual({ok: false, reason: expect.stringContaining('WordPress 6.8.1')})
      expect(got.get).toHaveBeenCalledWith('https://example.com/', expect.anything())
    })

    it('lets the browser flow be tried when the version is hidden (generator stripped)', async () => {
      mockIndex(APP_PASSWORDS_INDEX)
      mockVersionSources('<rss></rss>', '<html></html>')

      expect(await diagnoseWpSite('https://example.com')).toEqual({ok: true})
    })
  })
})
