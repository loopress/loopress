import got from 'got'

export const WPORG_INFO = 'https://api.wordpress.org/plugins/info/1.2/'

// The WordPress.org plugin_information answer for one slug, or null when the plugin isn't
// listed there (zip, premium) or the API can't be reached.
export async function fetchPluginInfo(slug: string): Promise<null | Record<string, unknown>> {
  try {
    const body = await got(WPORG_INFO, {
      searchParams: {action: 'plugin_information', 'request[slug]': slug},
      timeout: {request: 10_000},
    }).json<Record<string, unknown>>()
    return typeof body === 'object' && !('error' in body) ? body : null
  } catch {
    return null
  }
}
