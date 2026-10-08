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

  it('ignores a bare request with no query string without shutting down', async () => {
    const result = startTokenWait()
    const callbackUrl = new URL(await openedCallbackUrl())

    const favicon = await got(`${callbackUrl.origin}/favicon.ico`, {throwHttpErrors: false})
    expect(favicon.statusCode).toBe(400)

    callbackUrl.searchParams.set('token', 'abc123')
    await got(callbackUrl.href)
    await expect(result).resolves.toEqual({token: 'abc123'})
  })

  it('rejects a request that carries credentials but the wrong state', async () => {
    const result = startTokenWait()
    const callbackUrl = new URL(await openedCallbackUrl())
    callbackUrl.searchParams.set('state', 'nope')
    callbackUrl.searchParams.set('token', 'stolen')

    // Assertion listed before the triggering request, see wp-authorize-flow.test.ts: the
    // rejection happens synchronously inside the request handler, before `got` resolves.
    const [, res] = await Promise.all([
      expect(result).rejects.toThrow(/state/i),
      got(callbackUrl.href, {throwHttpErrors: false}),
    ])
    expect(res.statusCode).toBe(403)
  })

  describe('other callback outcomes', () => {
    // eslint-disable-next-line @typescript-eslint/promise-function-async -- callers want the pending handle
    function startWait<T>(
      handleRequest: (url: URL, helpers: CallbackHelpers<T>) => void,
      extra: {callbackHost?: string; log?: (m: string) => void; timeoutMs?: number} = {},
    ) {
      return waitForLocalCallback<T>({
        allowedOrigins: ['https://relay.example'],
        buildUrl: (base, state) => `${base}/callback?state=${state}`,
        callbackHost: extra.callbackHost,
        handleRequest,
        log: extra.log ?? (() => undefined),
        openingMessage: 'Opening your browser...',
        timeoutMessage: 'timed out',
        timeoutMs: extra.timeoutMs,
      })
    }

    it("serves the handler's page as HTML and resolves with its value", async () => {
      const result = startWait<string>((url, {resolveWithPage}) => {
        resolveWithPage('ok', url.searchParams.get('password')!)
      })
      const callbackUrl = new URL(await openedCallbackUrl())
      callbackUrl.searchParams.set('password', 'p w')

      const res = await got(callbackUrl.href)

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
      expect(res.body).toBe('ok')
      await expect(result).resolves.toBe('p w')
    })

    it('advertises callbackHost in the callback URL instead of localhost', async () => {
      const result = startWait((_url, {resolveWithPage}) => {
        resolveWithPage('ok', 1)
      }, {callbackHost: '127.0.0.1'})
      const callbackUrl = await openedCallbackUrl()

      expect(callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback\?state=[\da-f]{64}$/)

      await got(callbackUrl)
      await result
    })

    it('rejects a callback coming from an origin that is not allowlisted', async () => {
      let handled = false
      const result = startWait(() => {
        handled = true
      })
      const callbackUrl = await openedCallbackUrl()

      const [, res] = await Promise.all([
        expect(result).rejects.toThrow('Rejected a cross-origin request to the login callback server.'),
        got(callbackUrl, {
          headers: {origin: 'https://evil.example'},
          throwHttpErrors: false,
        }),
      ])

      expect(res.statusCode).toBe(403)
      expect(res.body).toBe('Rejected a cross-origin request to the login callback server.')
      expect(handled).toBe(false)
    })

    // Credentials are read from the query string, so a query without `state` must still go
    // through the state check rather than straight to the handler.
    it('rejects a callback whose query carries credentials but no state at all', async () => {
      let handled = false
      const result = startWait(() => {
        handled = true
      })
      const callbackUrl = new URL(await openedCallbackUrl())
      callbackUrl.searchParams.delete('state')
      callbackUrl.searchParams.set('password', 'forged')

      await Promise.all([
        expect(result).rejects.toThrow('Rejected a login callback with a missing or invalid state value.'),
        got(callbackUrl.href, {throwHttpErrors: false}),
      ])
      expect(handled).toBe(false)
    })

    it("rejects with the handler's error while still serving its page", async () => {
      const result = startWait((_url, {rejectWithPage}) => {
        rejectWithPage('denied page', new Error('user denied'))
      })
      const callbackUrl = await openedCallbackUrl()

      const [, res] = await Promise.all([expect(result).rejects.toThrow('user denied'), got(callbackUrl)])

      expect(res.body).toBe('denied page')
    })

    it('answers 500 and rejects when the handler itself throws', async () => {
      const result = startWait(() => {
        throw new Error('handler crashed')
      })
      const callbackUrl = await openedCallbackUrl()

      const [, res] = await Promise.all([
        expect(result).rejects.toThrow('handler crashed'),
        got(callbackUrl, {throwHttpErrors: false}),
      ])

      expect(res.statusCode).toBe(500)
      expect(res.body).toBe('Internal error')
    })

    it('wraps a non-Error thrown by the handler into an Error', async () => {
      const result = startWait(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test
        throw 'plain string'
      })
      const callbackUrl = await openedCallbackUrl()

      await Promise.all([
        expect(result).rejects.toThrow('plain string'),
        got(callbackUrl, {throwHttpErrors: false}),
      ])
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

    it('rewrites its own URL so the callback query does not stay in the browser history', () => {
      const html = renderResultPage({background: '', heading: '', headingColor: '', icon: '', tabTitle: ''})

      expect(html).toContain("history.replaceState(null, '', '/')")
    })
  })
})
