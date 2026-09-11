import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {waitForLocalCallback} from '../../src/lib/local-callback-server.js'
import {openBrowser} from '../../src/lib/open-browser.js'

vi.mock('../../src/lib/open-browser.js', () => ({openBrowser: vi.fn()}))

/** Start a callback wait whose handler resolves as soon as it sees a `token` query param. */
// eslint-disable-next-line @typescript-eslint/promise-function-async -- callers want the pending handle, not an awaited value
function startTokenWait(): Promise<{token: string}> {
  return waitForLocalCallback<{token: string}>({
    allowedOrigins: ['https://relay.example'],
    buildUrl: (base, state) => `${base}/callback?state=${state}`,
    handleRequest(url, {resolveWithPage, respondBadRequest}) {
      const token = url.searchParams.get('token')
      if (!token) {
        respondBadRequest('missing token')
        return
      }

      resolveWithPage('<html>ok</html>', {token})
    },
    log: () => undefined,
    openingMessage: '',
    timeoutMessage: 'timed out',
  })
}

async function openedCallbackUrl(): Promise<string> {
  await vi.waitFor(() => {
    expect(openBrowser).toHaveBeenCalled()
  })
  return vi.mocked(openBrowser).mock.calls.at(-1)![0]
}

describe('waitForLocalCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts a top-level navigation (no Origin header) that carries the state', async () => {
    const result = startTokenWait()
    const callbackUrl = new URL(await openedCallbackUrl())
    callbackUrl.searchParams.set('token', 'abc123')

    await got(callbackUrl.href)

    await expect(result).resolves.toEqual({token: 'abc123'})
  })

  it('ignores a bare request with no state and no body without shutting down', async () => {
    const result = startTokenWait()
    const callbackUrl = new URL(await openedCallbackUrl())

    const favicon = await got(`${callbackUrl.origin}/favicon.ico`, {throwHttpErrors: false})
    expect(favicon.statusCode).toBe(400)

    callbackUrl.searchParams.set('token', 'abc123')
    await got(callbackUrl.href)
    await expect(result).resolves.toEqual({token: 'abc123'})
  })

  it('rejects a request that carries a body but the wrong state', async () => {
    const result = startTokenWait()
    const callbackUrl = new URL(await openedCallbackUrl())
    callbackUrl.searchParams.set('state', 'nope')

    // Captured before the triggering request, see wp-authorize-flow.test.ts: the rejection
    // happens synchronously inside the request handler, before `got.post` below resolves.
    const assertion = expect(result).rejects.toThrow(/state/i)
    const res = await got.post(callbackUrl.href, {form: {token: 'stolen'}, throwHttpErrors: false})
    expect(res.statusCode).toBe(403)
    await assertion
  })
})
