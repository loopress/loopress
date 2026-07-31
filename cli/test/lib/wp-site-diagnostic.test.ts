import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {diagnoseWpSite} from '../../src/lib/wp-site-diagnostic.js'

vi.mock('got', () => ({
  default: {
    get: vi.fn(),
  },
}))

function mockIndex(body: unknown) {
  vi.mocked(got.get).mockReturnValueOnce({json: () => Promise.resolve(body)} as never)
}

describe('diagnoseWpSite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a plain http:// URL (WordPress does not require HTTPS for Application Passwords, e.g. local dev sites)', async () => {
    mockIndex({authentication: {'application-passwords': {endpoints: {authorization: 'http://example.local/wp-admin/authorize-application.php'}}}})

    const result = await diagnoseWpSite('http://example.local')

    expect(result).toEqual({ok: true})
    expect(got.get).toHaveBeenCalledWith('http://example.local/wp-json/', expect.objectContaining({timeout: expect.anything()}))
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
})
