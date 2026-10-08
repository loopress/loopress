import got from 'got'

export const REQUEST_TIMEOUT_MS = 10_000

/**
 * WordPress 7.0 is the first version that accepts a loopback `http://127.0.0.1` success_url on
 * authorize-application.php whatever the site's environment type (wp_is_authorize_application_redirect_url_valid).
 * Earlier versions only accept it when WP_ENVIRONMENT_TYPE is `local`, which isn't exposed publicly,
 * so a 6.x site is sent to manual entry even though a local one would have worked.
 */
const MIN_BROWSER_AUTH_MAJOR = 7

export type DiagnosticResult = {ok: false; reason: string} | {ok: true}

type WpIndexResponse = undefined | {authentication?: Record<string, unknown>}

/**
 * Pre-flight checks run before starting the browser authorization flow, so failures
 * (unreachable site, blocked REST API, Application Passwords disabled) surface as an
 * actionable message instead of a confusing timeout once the browser is already open.
 *
 * Whether Application Passwords are enabled can only be read from the `wp-json/` index:
 * WordPress adds `authentication['application-passwords']` there when the feature is on
 * (WP core, rest_add_application_passwords_to_index). The authorize-application.php page
 * can't be probed for this instead, it sits behind the admin login wall, so an unauthenticated
 * request just gets redirected to wp-login.php and never reaches the check that would say
 * whether the feature is disabled.
 */
export async function diagnoseWpSite(siteUrl: string): Promise<DiagnosticResult> {
  let index: WpIndexResponse
  try {
    index = await got.get(`${siteUrl}/wp-json/`, {timeout: {request: REQUEST_TIMEOUT_MS}}).json<WpIndexResponse>()
  } catch (error) {
    return {
      ok: false,
      reason: `Could not reach the WordPress REST API at ${siteUrl}/wp-json/. The site may be unreachable, or a security plugin may be blocking it. (${describe(error)})`,
    }
  }

  if (!index?.authentication?.['application-passwords']) {
    return {
      ok: false,
      reason: `Application Passwords are not available on ${siteUrl}. The site may be older than WordPress 5.6, require HTTPS, or have the feature disabled by a plugin or filter.`,
    }
  }

  const version = await detectWpVersion(siteUrl)
  if (version && Number(version.split('.')[0]) < MIN_BROWSER_AUTH_MAJOR) {
    return {
      ok: false,
      reason: `${siteUrl} runs WordPress ${version}. Before WordPress ${MIN_BROWSER_AUTH_MAJOR}.0, WordPress refuses to send the Application Password back to the CLI on this machine (http://127.0.0.1), so authorizing in the browser is not possible. Create an Application Password in wp-admin (Users > Profile) and enter it below.`,
    }
  }

  return {ok: true}
}

/**
 * Best effort, from the public generator tag: the feed's `<generator>` first, then the home page
 * `<meta name="generator">`. Security plugins often strip both, in which case this returns
 * undefined and the browser flow is attempted anyway.
 */
async function detectWpVersion(siteUrl: string): Promise<string | undefined> {
  const sources = [
    {pattern: /<generator>[^<]*[?&]v=(\d+(?:\.\d+)*)/, url: `${siteUrl}/feed/`},
    {pattern: /<meta name="generator" content="WordPress (\d+(?:\.\d+)*)/, url: `${siteUrl}/`},
  ]

  for (const {pattern, url} of sources) {
    try {
      const body = await got.get(url, {timeout: {request: REQUEST_TIMEOUT_MS}}).text()
      const version = pattern.exec(body)?.[1]
      if (version) return version
    } catch {
      // Feed disabled or page unreachable: try the next source.
    }
  }

  return undefined
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
