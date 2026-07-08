import {randomBytes} from 'node:crypto'
import {createServer, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'

import {openBrowser} from './open-browser.js'

const APP_NAME = 'Loopress'
const TIMEOUT_MS = 5 * 60 * 1000

export type AuthorizeResult = {password: string; userLogin: string}

function respondBadRequest(res: ServerResponse, message: string): void {
  res.writeHead(400, {'Content-Type': 'text/plain'})
  res.end(message)
}

/**
 * Runs WordPress's native "authorize application" flow: opens a local callback server,
 * sends the user to `<siteUrl>/wp-admin/authorize-application.php`, and resolves with the
 * generated Application Password once WordPress redirects back.
 */
export function authorizeWithBrowser(siteUrl: string, log: (message: string) => void): Promise<AuthorizeResult> {
  const state = randomBytes(32).toString('hex')

  return new Promise((resolve, reject) => {
    function finish(res: ServerResponse, page: string, settle: () => void): void {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
      res.end(page)
      clearTimeout(timer)
      server.close()
      settle()
    }

    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')

        if (url.searchParams.get('state') !== state) {
          respondBadRequest(res, 'Invalid or missing state')
          return
        }

        if (url.pathname === '/reject') {
          finish(res, REJECTED_PAGE, () => {
            reject(new Error('Authorization rejected in WordPress. You can enter credentials manually instead.'))
          })
          return
        }

        const userLogin = url.searchParams.get('user_login')
        const password = url.searchParams.get('password')

        if (!userLogin || !password) {
          respondBadRequest(res, 'Missing user_login or password')
          return
        }

        finish(res, SUCCESS_PAGE, () => resolve({password, userLogin}))
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
      reject(new Error('Authorization timed out after 5 minutes. You can enter credentials manually instead.'))
    }, TIMEOUT_MS)

    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo
      const successUrl = `http://localhost:${port}/callback?state=${state}`
      const rejectUrl = `http://localhost:${port}/reject?state=${state}`
      const authorizeUrl =
        `${siteUrl}/wp-admin/authorize-application.php?app_name=${encodeURIComponent(APP_NAME)}` +
        `&success_url=${encodeURIComponent(successUrl)}&reject_url=${encodeURIComponent(rejectUrl)}`

      log('Opening WordPress in your browser to authorize Loopress...')
      log(`\nIf it doesn't open automatically, visit:\n${authorizeUrl}\n`)

      openBrowser(authorizeUrl)
    })
  })
}

function renderResultPage(options: {
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

const SUCCESS_PAGE = renderResultPage({
  background: '#f0fdf4',
  heading: 'Authorization successful!',
  headingColor: '#15803d',
  icon: '✅',
  tabTitle: 'Authorized',
})

const REJECTED_PAGE = renderResultPage({
  background: '#fef2f2',
  heading: 'Authorization rejected',
  headingColor: '#b91c1c',
  icon: '✕',
  tabTitle: 'Authorization rejected',
})
