import {Buffer} from 'node:buffer'
import {randomBytes, timingSafeEqual} from 'node:crypto'
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'

import {openBrowser} from './open-browser.js'

/** Constant-time compare that also tolerates a length mismatch without throwing. */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
}

export type CallbackHelpers<T> = {
  rejectWithPage: (page: string, error: Error) => void
  resolveWithPage: (page: string, value: T) => void
  respondBadRequest: (message: string) => void
}

/**
 * Sends the user to a URL in their browser and catches the resulting redirect on a short-lived
 * local server; this factors out the server setup, timeout, and browser-opening boilerplate.
 *
 * The loopback server is unauthenticated, so any local process or web page open during the wait
 * could otherwise send forged credentials to it (RFC 8252 section 8.9). Two guards close that:
 *
 * - a 32-byte `state` generated here, threaded into the authorize URL by `buildUrl`, and required
 *   back (constant-time compare) on any request with a query string, the only place credentials
 *   are read from;
 * - an `Origin` allowlist: the legitimate callbacks are top-level redirects, which send no
 *   `Origin`, so a request from a page script (carrying its own origin) is rejected. That's
 *   defense in depth, `state` is the primary control.
 *
 * The first request that looks like a callback (valid or not) shuts the server down, so a
 * failed guess gets no second try within the window.
 */
export async function waitForLocalCallback<T>(options: {
  allowedOrigins: string[]
  buildUrl: (callbackBaseUrl: string, state: string) => string
  /** Host advertised in the callback URL; the server itself always listens on 127.0.0.1. */
  callbackHost?: string
  handleRequest: (url: URL, helpers: CallbackHelpers<T>) => void
  log: (message: string) => void
  openingMessage: string
  timeoutMessage: string
  timeoutMs?: number
}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000
  const state = randomBytes(32).toString('hex')

  return new Promise((resolve, reject) => {
    function finish(res: ServerResponse, page: string): void {
      // `Connection: close` (here and below): server.close() only refuses new connections, a
      // kept-alive socket would otherwise still reach this handler after the shutdown.
      res.writeHead(200, {Connection: 'close', 'Content-Type': 'text/html; charset=utf-8'})
      res.end(page)
      clearTimeout(timer)
      server.close()
    }

    function rejectRequest(res: ServerResponse, message: string): void {
      res.writeHead(403, {Connection: 'close', 'Content-Type': 'text/plain'})
      res.end(message)
      clearTimeout(timer)
      server.close()
      reject(new Error(message))
    }

    function handleIncoming(req: IncomingMessage, res: ServerResponse): void {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')

        // Any query string counts, not just one carrying `state`: credentials are read from the
        // query, so a request with `password=` but no `state` must not slip past the check.
        const looksLikeCallback = url.search !== ''
        if (looksLikeCallback) {
          const {origin} = req.headers
          if (origin !== undefined && !options.allowedOrigins.includes(origin)) {
            rejectRequest(res, 'Rejected a cross-origin request to the login callback server.')
            return
          }

          if (!safeEqual(url.searchParams.get('state') ?? '', state)) {
            rejectRequest(res, 'Rejected a login callback with a missing or invalid state value.')
            return
          }
        }

        options.handleRequest(url, {
          rejectWithPage(page, error) {
            finish(res, page)
            reject(error)
          },
          resolveWithPage(page, value) {
            finish(res, page)
            resolve(value)
          },
          respondBadRequest(message) {
            res.writeHead(400, {'Content-Type': 'text/plain'})
            res.end(message)
          },
        })
      } catch (error) {
        res.writeHead(500)
        res.end('Internal error')
        server.close()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const server = createServer(handleIncoming)

    server.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    const timer = setTimeout(() => {
      server.close()
      reject(new Error(options.timeoutMessage))
    }, timeoutMs)

    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo
      const targetUrl = options.buildUrl(`http://${options.callbackHost ?? 'localhost'}:${port}`, state)

      options.log(options.openingMessage)
      options.log(`\nIf it doesn't open automatically, visit:\n${targetUrl}\n`)

      openBrowser(targetUrl)
    })
  })
}

/**
 * The page rewrites its own URL to `/` on load, so the callback query string (an Application
 * Password, a console token) doesn't stay in the browser history or address bar.
 */
export function renderResultPage(options: {
  background: string
  heading: string
  headingColor: string
  icon: string
  tabTitle: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loopress: ${options.tabTitle}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: ${options.background};
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 2.5rem 3rem;
      text-align: center;
      box-shadow: 0 4px 32px rgba(0, 0, 0, .08);
      max-width: 420px;
      width: 90%;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { color: ${options.headingColor}; font-size: 1.5rem; margin-bottom: .5rem; }
    p { color: #6b7280; font-size: .95rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${options.icon}</div>
    <h1>${options.heading}</h1>
    <p>You can close this tab and return to your terminal.</p>
  </div>
  <script>history.replaceState(null, '', '/')</script>
</body>
</html>`
}
