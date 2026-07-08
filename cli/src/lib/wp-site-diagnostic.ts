import got from 'got'

export const REQUEST_TIMEOUT_MS = 10_000

export type DiagnosticResult = {ok: false; reason: string} | {ok: true}

/**
 * Pre-flight checks run before starting the browser authorization flow, so failures
 * (unreachable site, blocked REST API, WordPress too old) surface as an actionable
 * message instead of a confusing timeout once the browser is already open.
 */
export async function diagnoseWpSite(siteUrl: string): Promise<DiagnosticResult> {
  try {
    await got.get(`${siteUrl}/wp-json/`, {timeout: {request: REQUEST_TIMEOUT_MS}})
  } catch (error) {
    return {
      ok: false,
      reason: `Could not reach the WordPress REST API at ${siteUrl}/wp-json/. The site may be unreachable, or a security plugin may be blocking it. (${describe(error)})`,
    }
  }

  try {
    const response = await got.head(`${siteUrl}/wp-admin/authorize-application.php`, {
      throwHttpErrors: false,
      timeout: {request: REQUEST_TIMEOUT_MS},
    })

    if (response.statusCode === 404) {
      return {
        ok: false,
        reason: `The application authorization page was not found on ${siteUrl}. This WordPress site may be older than 5.6, or the feature may be disabled by a plugin.`,
      }
    }
  } catch (error) {
    return {
      ok: false,
      reason: `Could not reach ${siteUrl}/wp-admin/authorize-application.php. (${describe(error)})`,
    }
  }

  return {ok: true}
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
