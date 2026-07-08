import {Command} from '@oclif/core'

import {authManager} from '../config/auth.manager.js'
import {renderResultPage, waitForLocalCallback} from '../lib/local-callback-server.js'

const CONSOLE_URL = 'https://console.loopress.dev'

export default class Login extends Command {
  static description = 'Log in to the Loopress console'
  static examples = ['$ lps login']

  async run(): Promise<void> {
    const {email, token} = await this.waitForCallback()

    authManager.setAuth({email, savedAt: new Date().toISOString(), token})

    this.log(`\nLogged in${email ? ` as ${email}` : ''}. You're all set!`)
  }

  private waitForCallback(): Promise<{email?: string; token: string}> {
    return waitForLocalCallback<{email?: string; token: string}>({
      buildUrl: (callbackBaseUrl) =>
        `${CONSOLE_URL}/cli-auth?callbackUrl=${encodeURIComponent(`${callbackBaseUrl}/callback`)}`,
      handleRequest(url, {resolveWithPage, respondBadRequest}) {
        const token = url.searchParams.get('token')
        const email = url.searchParams.get('email') ?? undefined

        if (!token) {
          respondBadRequest('Missing token')
          return
        }

        resolveWithPage(SUCCESS_PAGE, {email, token})
      },
      log: (message) => this.log(message),
      openingMessage: 'Opening Loopress console in your browser...',
      timeoutMessage: 'Login timed out after 5 minutes. Please try again.',
    })
  }
}

const SUCCESS_PAGE = renderResultPage({
  background: '#f0fdf4',
  heading: 'Login successful!',
  headingColor: '#15803d',
  icon: '✅',
  tabTitle: 'Logged in',
})
