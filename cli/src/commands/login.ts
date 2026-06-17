import {Command} from '@oclif/core'
import {exec} from 'node:child_process'
import {createServer} from 'node:http'
import {type AddressInfo} from 'node:net'

import {authManager} from '../config/auth.manager.js'

const CONSOLE_URL = 'https://console.wordpressdx.dev'
const TIMEOUT_MS = 5 * 60 * 1000

export default class Login extends Command {
  static description = 'Log in to WordPress DX via the console'
  static examples = ['$ wdx login']

  async run(): Promise<void> {
    const {email, token} = await this.waitForCallback()

    authManager.setAuth({email, savedAt: new Date().toISOString(), token})

    this.log(`\n✅ Logged in${email ? ` as ${email}` : ''}. You're all set!`)
  }

  private openBrowser(url: string): void {
    const cmds: Record<string, string> = {
      darwin: `open "${url}"`,
      linux: `xdg-open "${url}"`,
      win32: `start "" "${url}"`,
    }

    const cmd = cmds[process.platform]
    if (cmd) exec(cmd)
  }

  private waitForCallback(): Promise<{email?: string; token: string}> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const token = url.searchParams.get('token')
          const email = url.searchParams.get('email') ?? undefined

          if (!token) {
            res.writeHead(400, {'Content-Type': 'text/plain'})
            res.end('Missing token')
            return
          }

          res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
          res.end(SUCCESS_PAGE)
          clearTimeout(timer)
          server.close()
          resolve({email, token})
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
        reject(new Error('Login timed out after 5 minutes. Please try again.'))
      }, TIMEOUT_MS)

      server.listen(0, '127.0.0.1', () => {
        const {port} = server.address() as AddressInfo
        const callbackUrl = `http://localhost:${port}/callback`
        const loginUrl = `${CONSOLE_URL}/cli-auth?callbackUrl=${encodeURIComponent(callbackUrl)}`

        this.log('Opening WordPress DX console in your browser...')
        this.log(`\nIf it doesn't open automatically, visit:\n${loginUrl}\n`)

        this.openBrowser(loginUrl)
      })
    })
  }
}

const SUCCESS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WordPress DX: Logged in</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #f0fdf4;
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
    h1 { color: #15803d; font-size: 1.5rem; margin-bottom: .5rem; }
    p { color: #6b7280; font-size: .95rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Login successful!</h1>
    <p>You can close this tab and return to your terminal.</p>
  </div>
</body>
</html>`
