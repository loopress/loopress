import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {diagnoseWpSite} from '../../src/lib/wp-site-diagnostic.js'

vi.mock('got', () => ({
  default: {
    get: vi.fn(),
    head: vi.fn(),
  },
}))

describe('diagnoseWpSite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a plain http:// URL (WordPress does not require HTTPS for Application Passwords, e.g. local dev sites)', async () => {
    vi.mocked(got.get).mockResolvedValueOnce({} as never)
    vi.mocked(got.head).mockResolvedValueOnce({statusCode: 200} as never)

    const result = await diagnoseWpSite('http://example.local')

    expect(result).toEqual({ok: true})
    expect(got.get).toHaveBeenCalledWith('http://example.local/wp-json/', expect.anything())
  })

  it('reports an unreachable or blocked REST API', async () => {
    vi.mocked(got.get).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: false, reason: expect.stringContaining('wp-json')})
    expect(got.get).toHaveBeenCalledWith('https://example.com/wp-json/', expect.objectContaining({timeout: expect.anything()}))
    expect(got.head).not.toHaveBeenCalled()
  })

  it('reports a missing authorize-application.php page as too-old WordPress or a blocking plugin', async () => {
    vi.mocked(got.get).mockResolvedValueOnce({} as never)
    vi.mocked(got.head).mockResolvedValueOnce({statusCode: 404} as never)

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: false, reason: expect.stringContaining('5.6')})
  })

  it('reports an unreachable authorize-application.php page', async () => {
    vi.mocked(got.get).mockResolvedValueOnce({} as never)
    vi.mocked(got.head).mockRejectedValueOnce(new Error('ETIMEDOUT'))

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: false, reason: expect.stringContaining('authorize-application.php')})
  })

  it('passes when the REST API and the authorization page are both reachable', async () => {
    vi.mocked(got.get).mockResolvedValueOnce({} as never)
    vi.mocked(got.head).mockResolvedValueOnce({statusCode: 200} as never)

    const result = await diagnoseWpSite('https://example.com')

    expect(result).toEqual({ok: true})
  })
})
