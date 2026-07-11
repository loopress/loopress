import {renderResultPage, waitForLocalCallback} from './local-callback-server.js'

export type AuthorizeResult = {password: string; userLogin: string}

/**
 * Relays the authorization through the Loopress API so that WordPress's
 * `success_url` / `reject_url` can be valid HTTPS URLs.  The API receives the
 * redirect from WordPress and forwards the credentials back to a local callback
 * server via a form POST (keeping them out of the browser's address bar).
 *
 * Flow:
 *   1. Start a local HTTP server on `127.0.0.1`.
 *   2. Open the browser to `https://api.loopress.dev/auth/wp-authorize` with the local
 *      callback URL and the target WordPress site as query params.
 *   3. That page redirects the user to WordPress's authorize-application.php,
 *      passing the API's callback endpoint as `success_url` (HTTPS).
 *   4. After the user approves, WordPress redirects to the API callback.
 *   5. The API callback returns an HTML page that POSTs a form with the
 *      Application Password to the local callback server.
 *   6. The local server extracts the credentials and resolves the promise.
 */
export function authorizeWithBrowser(siteUrl: string, log: (message: string) => void): Promise<AuthorizeResult> {
  return waitForLocalCallback<AuthorizeResult>({
    buildUrl(callbackBaseUrl) {
      const relayUrl = 'https://api.loopress.dev/auth/wp-authorize'
      const params = new URLSearchParams({
        callbackUrl: callbackBaseUrl,
        wpUrl: siteUrl,
      })
      return `${relayUrl}?${params}`
    },
    handleRequest(url, {resolveWithPage, rejectWithPage, respondBadRequest, body}) {
      if (url.searchParams.has('cancelled') || body.cancelled) {
        rejectWithPage(
          REJECTED_PAGE,
          new Error('Authorization rejected in WordPress.'),
        )
        return
      }

      const password = body.password || url.searchParams.get('password') || ''
      const userLogin = body.user_login || url.searchParams.get('user_login') || ''

      if (!password || !userLogin) {
        respondBadRequest('Missing password or user_login')
        return
      }

      resolveWithPage(SUCCESS_PAGE, {password, userLogin})
    },
    log,
    openingMessage: 'Opening WordPress in your browser to authorize Loopress...',
    timeoutMessage: 'Authorization timed out after 5 minutes.',
  })
}

const SUCCESS_PAGE = renderResultPage({
  background: '#f0fdf4',
  heading: 'Authorization successful!',
  headingColor: '#15803d',
  icon: '&#10003;',
  tabTitle: 'Authorized',
})

const REJECTED_PAGE = renderResultPage({
  background: '#fef2f2',
  heading: 'Authorization rejected',
  headingColor: '#b91c1c',
  icon: '&#10007;',
  tabTitle: 'Authorization rejected',
})
