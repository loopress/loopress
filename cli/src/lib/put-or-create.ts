import {isNotFoundError, type WpClient} from './wp-client.js'

type PutOrCreateOptions = {
  id: null | number
  payload: Record<string, unknown>
  postEndpoint: string
  // Defaults to `payload`; pass a distinct one when the POST body must differ (e.g. a stale
  // `id` field stripped before create, see commands/page/push.ts).
  postPayload?: Record<string, unknown>
  putEndpoint: (id: number) => string
}

// Update-or-create dance shared by every id-based resource (form, page, seo redirect,
// snippet, unlike ACF which is key-based and only ever POSTs): PUT to the known id, and only
// fall back to POST when the site doesn't recognize that id (404), e.g. a fresh install or a
// database reset.
export async function putOrCreate<T>(wp: WpClient, options: PutOrCreateOptions): Promise<{body: T; created: boolean}> {
  const {id, payload, postEndpoint, postPayload = payload, putEndpoint} = options

  if (id !== null) {
    try {
      const body = await wp.put<T>(putEndpoint(id), payload)
      return {body, created: false}
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
  }

  return {body: await wp.post<T>(postEndpoint, postPayload), created: true}
}
