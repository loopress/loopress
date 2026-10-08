import {renderResultPage, waitForLocalCallback} from './local-callback-server.js'

export type AuthorizeResult = {password: string; userLogin: string}

/**
 * Asks WordPress for an Application Password through its own authorize-application.php page,
 * with the CLI's loopback server as `success_url` / `reject_url`:
 *
 *   1. Start a local HTTP server on 127.0.0.1.
 *   2. Open the browser on `<site>/wp-admin/authorize-application.php`.
 *   3. After the user approves, WordPress redirects to the loopback URL with `user_login` and
 *      `password` appended to its query string (`state` is kept, WordPress only adds params).
 *
 * The callback host must be the literal `127.0.0.1`, not `localhost`: WordPress 7.0+ only exempts
 * `127.0.0.1` and `[::1]` from its HTTPS requirement on these URLs. Older versions are screened
 * out beforehand by `diagnoseWpSite`. The credentials land in the browser history as part of the
 * callback URL, so the result page rewrites that history entry (see `renderResultPage`).
 */
export async function authorizeWithBrowser(siteUrl: string, log: (message: string) => void): Promise<AuthorizeResult> {
  return waitForLocalCallback<AuthorizeResult>({
    // WordPress reaches the callback through a top-level GET redirect, which carries no Origin,
    // so any request that does carry one isn't WordPress.
    allowedOrigins: [],
    buildUrl(callbackBaseUrl, state) {
      const callbackUrl = `${callbackBaseUrl}/?state=${state}`
      const params = new URLSearchParams({
        app_name: 'Loopress',
        reject_url: `${callbackUrl}&cancelled=1`,
        success_url: callbackUrl,
      })
      return `${siteUrl}/wp-admin/authorize-application.php?${params}`
    },
    callbackHost: '127.0.0.1',
    handleRequest(url, {resolveWithPage, rejectWithPage, respondBadRequest}) {
      if (url.searchParams.has('cancelled')) {
        rejectWithPage(
          REJECTED_PAGE,
          new Error('Authorization rejected in WordPress.'),
        )
        return
      }

      const password = url.searchParams.get('password')
      const userLogin = url.searchParams.get('user_login')

      if (!password || !userLogin) {
        respondBadRequest('Missing password or user_login')
        return
      }

      resolveWithPage(SUCCESS_PAGE, {password, userLogin})
    },
    log,
    openingMessage:
      'Opening WordPress in your browser to authorize Loopress...\nIf WordPress says the URL must be served over a secure connection (WordPress older than 7.0), press Ctrl-C and run `lps project config` again, choosing manual entry.',
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
