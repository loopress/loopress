import got from 'got'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {type CallbackHelpers, renderResultPage, waitForLocalCallback} from '../../src/lib/local-callback-server.js'
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

  describe('other callback outcomes', () => {
    // eslint-disable-next-line @typescript-eslint/promise-function-async -- callers want the pending handle
    function startWait<T>(
      handleRequest: (url: URL, helpers: CallbackHelpers<T>) => void,
      extra: {log?: (m: string) => void; timeoutMs?: number} = {},
    ) {
      return waitForLocalCallback<T>({
        allowedOrigins: ['https://relay.example'],
        buildUrl: (base, state) => `${base}/callback?state=${state}`,
        handleRequest,
        log: extra.log ?? (() => undefined),
        openingMessage: 'Opening your browser...',
        timeoutMessage: 'timed out',
        timeoutMs: extra.timeoutMs,
      })
    }

    it('hands the parsed form body of a POST with the right state to the handler', async () => {
      const result = startWait<Record<string, string>>((_url, {body, resolveWithPage}) => {
        resolveWithPage('ok', body)
      })
      const callbackUrl = await openedCallbackUrl()

      const res = await got.post(callbackUrl, {
        form: {password: 'p w', user: 'admin'},
        headers: {origin: 'https://relay.example'},
      })

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
      expect(res.body).toBe('ok')
      await expect(result).resolves.toEqual({password: 'p w', user: 'admin'})
    })

    it('rejects a callback coming from an origin that is not allowlisted', async () => {
      let handled = false
      const result = startWait(() => {
        handled = true
      })
      const callbackUrl = await openedCallbackUrl()

      const assertion = expect(result).rejects.toThrow('Rejected a cross-origin request to the login callback server.')
      const res = await got.post(callbackUrl, {
        form: {token: 'x'},
        headers: {origin: 'https://evil.example'},
        throwHttpErrors: false,
      })

      expect(res.statusCode).toBe(403)
      expect(res.body).toBe('Rejected a cross-origin request to the login callback server.')
      await assertion
      expect(handled).toBe(false)
    })

    it('rejects a callback that carries a body but no state at all', async () => {
      const result = startWait(() => {})
      const callbackUrl = new URL(await openedCallbackUrl())
      callbackUrl.searchParams.delete('state')

      const assertion = expect(result).rejects.toThrow(
        'Rejected a login callback with a missing or invalid state value.',
      )
      await got.post(callbackUrl.href, {form: {token: 'x'}, throwHttpErrors: false})
      await assertion
    })

    it("rejects with the handler's error while still serving its page", async () => {
      const result = startWait((_url, {rejectWithPage}) => {
        rejectWithPage('denied page', new Error('user denied'))
      })
      const callbackUrl = await openedCallbackUrl()

      const assertion = expect(result).rejects.toThrow('user denied')
      const res = await got(callbackUrl)

      expect(res.body).toBe('denied page')
      await assertion
    })

    it('answers 500 and rejects when the handler itself throws', async () => {
      const result = startWait(() => {
        throw new Error('handler crashed')
      })
      const callbackUrl = await openedCallbackUrl()

      const assertion = expect(result).rejects.toThrow('handler crashed')
      const res = await got(callbackUrl, {throwHttpErrors: false})

      expect(res.statusCode).toBe(500)
      expect(res.body).toBe('Internal error')
      await assertion
    })

    it('wraps a non-Error thrown by the handler into an Error', async () => {
      const result = startWait(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test
        throw 'plain string'
      })
      const callbackUrl = await openedCallbackUrl()

      const assertion = expect(result).rejects.toThrow('plain string')
      await got(callbackUrl, {throwHttpErrors: false})
      await assertion
    })

    it('rejects with the timeout message when no callback arrives in time', async () => {
      await expect(startWait(() => {}, {timeoutMs: 20})).rejects.toThrow('timed out')
    })

    it('logs the opening message and the URL to visit manually, then opens that same URL', async () => {
      const logged: string[] = []
      const log = (message: string): void => {
        logged.push(message)
      }

      const result = startWait(
        (_url, {resolveWithPage}) => {
          resolveWithPage('ok', 1)
        },
        {log},
      )
      const callbackUrl = await openedCallbackUrl()

      expect(callbackUrl).toMatch(/^http:\/\/localhost:\d+\/callback\?state=[\da-f]{64}$/)
      expect(logged).toEqual([
        'Opening your browser...',
        `\nIf it doesn't open automatically, visit:\n${callbackUrl}\n`,
      ])

      await got(callbackUrl)
      await result
    })
  })

  describe('renderResultPage', () => {
    it('fills every slot of the page template', () => {
      const html = renderResultPage({
        background: '#abc',
        heading: 'Logged in',
        headingColor: '#123',
        icon: '✅',
        tabTitle: 'Done',
      })

      expect(html).toContain('<title>Loopress: Done</title>')
      expect(html).toContain('background: #abc;')
      expect(html).toContain('h1 { color: #123;')
      expect(html).toContain('<div class="icon">✅</div>')
      expect(html).toContain('<h1>Logged in</h1>')
    })
  })
})
