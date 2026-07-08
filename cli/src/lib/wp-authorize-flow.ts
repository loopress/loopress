import {waitForLocalCallback} from './local-callback-server.js'
import {openBrowser} from './open-browser.js'

const APP_NAME = 'Loopress'

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

const SUCCESS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loopress: Authorized</title>
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
    <div class="icon">&#10003;</div>
    <h1>Authorization successful!</h1>
    <p>You can close this tab and return to your terminal.</p>
  </div>
</body>
</html>`

const REJECTED_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loopress: Authorization rejected</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #fef2f2;
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
    h1 { color: #b91c1c; font-size: 1.5rem; margin-bottom: .5rem; }
    p { color: #6b7280; font-size: .95rem; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10007;</div>
    <h1>Authorization rejected</h1>
    <p>You can close this tab and return to your terminal.</p>
  </div>
</body>
</html>`
