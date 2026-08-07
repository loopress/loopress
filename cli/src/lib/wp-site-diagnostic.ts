import got from 'got'

export const REQUEST_TIMEOUT_MS = 10_000

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

  return {ok: true}
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
