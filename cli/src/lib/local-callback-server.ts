import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'

import {openBrowser} from './open-browser.js'

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function parseFormData(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body))
}

export type CallbackHelpers<T> = {
  body: Record<string, string>
  rejectWithPage: (page: string, error: Error) => void
  resolveWithPage: (page: string, value: T) => void
  respondBadRequest: (message: string) => void
}

/**
 * Sends the user to a URL in their browser and catches the resulting redirect on a short-lived
 * local server; this factors out the server setup, timeout, and browser-opening boilerplate.
 */
export function waitForLocalCallback<T>(options: {
  buildUrl: (callbackBaseUrl: string) => string
  handleRequest: (url: URL, helpers: CallbackHelpers<T>) => void
  log: (message: string) => void
  openingMessage: string
  timeoutMessage: string
  timeoutMs?: number
}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000

  return new Promise((resolve, reject) => {
    function finish(res: ServerResponse, page: string, settle: () => void): void {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
      res.end(page)
      clearTimeout(timer)
      server.close()
      settle()
    }

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const body: Record<string, string> =
          req.method === 'POST' ? parseFormData(await readBody(req)) : {}

        options.handleRequest(url, {
          rejectWithPage: (page, error) => finish(res, page, () => reject(error)),
          resolveWithPage: (page, value) => finish(res, page, () => resolve(value)),
          respondBadRequest(message) {
            res.writeHead(400, {'Content-Type': 'text/plain'})
            res.end(message)
          },
          body,
        })
      } catch (error) {
        res.writeHead(500)
        res.end('Internal error')
        server.close()
        reject(error)
      }
    })

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
      const targetUrl = options.buildUrl(`http://localhost:${port}`)

      options.log(options.openingMessage)
      options.log(`\nIf it doesn't open automatically, visit:\n${targetUrl}\n`)

      openBrowser(targetUrl)
    })
  })
}

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
</body>
</html>`
}
