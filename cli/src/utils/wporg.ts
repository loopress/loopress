import got from 'got'

export const WPORG_INFO = 'https://api.wordpress.org/plugins/info/1.2/'

// The WordPress.org plugin_information answer for one slug, or null when the plugin isn't
// listed there (zip, premium). Throws when the API can't be reached or answers with an error.
// `versions` adds every released version (`versions`: version -> download URL) to the answer.
export async function requestPluginInfo(
  slug: string,
  {versions = false}: {versions?: boolean} = {},
): Promise<null | Record<string, unknown>> {
  try {
    const body = await got(WPORG_INFO, {
      searchParams: {
        action: 'plugin_information',
        'request[slug]': slug,
        ...(versions && {'request[fields][versions]': '1'}),
      },
      timeout: {request: 10_000},
    }).json<Record<string, unknown>>()
    return typeof body === 'object' && !('error' in body) ? body : null
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

// Same lookup, but an unreachable API is reported as null too.
export async function fetchPluginInfo(slug: string): Promise<null | Record<string, unknown>> {
  try {
    return await requestPluginInfo(slug)
  } catch {
    return null
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) return false
  const {response} = error
  return typeof response === 'object' && response !== null && 'statusCode' in response && response.statusCode === 404
}
