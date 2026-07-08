import {randomBytes} from 'node:crypto'

import {renderResultPage, waitForLocalCallback} from './local-callback-server.js'

const APP_NAME = 'Loopress'

export type AuthorizeResult = {password: string; userLogin: string}

/**
 * Runs WordPress's native "authorize application" flow: opens a local callback server,
 * sends the user to `<siteUrl>/wp-admin/authorize-application.php`, and resolves with the
 * generated Application Password once WordPress redirects back.
 */
export function authorizeWithBrowser(siteUrl: string, log: (message: string) => void): Promise<AuthorizeResult> {
  const state = randomBytes(32).toString('hex')

  return waitForLocalCallback<AuthorizeResult>({
    buildUrl(callbackBaseUrl) {
      const successUrl = `${callbackBaseUrl}/callback?state=${state}`
      const rejectUrl = `${callbackBaseUrl}/reject?state=${state}`
      return (
        `${siteUrl}/wp-admin/authorize-application.php?app_name=${encodeURIComponent(APP_NAME)}` +
        `&success_url=${encodeURIComponent(successUrl)}&reject_url=${encodeURIComponent(rejectUrl)}`
      )
    },
    handleRequest(url, {rejectWithPage, resolveWithPage, respondBadRequest}) {
      if (url.searchParams.get('state') !== state) {
        respondBadRequest('Invalid or missing state')
        return
      }

      if (url.pathname === '/reject') {
        rejectWithPage(
          REJECTED_PAGE,
          new Error('Authorization rejected in WordPress. You can enter credentials manually instead.'),
        )
        return
      }

      const userLogin = url.searchParams.get('user_login')
      const password = url.searchParams.get('password')

      if (!userLogin || !password) {
        respondBadRequest('Missing user_login or password')
        return
      }

      resolveWithPage(SUCCESS_PAGE, {password, userLogin})
    },
    log,
    openingMessage: 'Opening WordPress in your browser to authorize Loopress...',
    timeoutMessage: 'Authorization timed out after 5 minutes. You can enter credentials manually instead.',
  })
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
