import got, {type Got} from 'got'

export const REQUEST_TIMEOUT_MS = 30_000

type HttpMethod = 'delete' | 'get' | 'post' | 'put'

/**
 * HTTP client for a WordPress site's REST API.
 * Paths are relative to `<site>/wp-json/`, e.g. `loopress/v1/snippets` or `wp/v2/plugins`.
 */
export class WpClient {
  private readonly client: Got

  constructor(
    private readonly siteUrl: string,
    token: string,
  ) {
    this.client = got.extend({
      headers: {Authorization: `Basic ${Buffer.from(token).toString('base64')}`},
      prefixUrl: `${siteUrl}/wp-json`,
      timeout: {request: REQUEST_TIMEOUT_MS},
    })
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('delete', path, undefined, options)
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('get', path, undefined, options)
  }

  async post<T = unknown>(path: string, json?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    return this.request<T>('post', path, json, options)
  }

  async put<T = unknown>(path: string, json?: Record<string, unknown>, options?: RequestOptions): Promise<T> {
    return this.request<T>('put', path, json, options)
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    json?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<T> {
    const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
    try {
      const response = await this.client(path, {json, method, timeout: {request: timeoutMs}})
      return (response.body ? JSON.parse(response.body) : undefined) as T
    } catch (error) {
      throw new Error(formatWpError(error, `${this.siteUrl}/wp-json/${path}`, timeoutMs), {cause: error})
    }
  }
}

type RequestOptions = {
  timeoutMs?: number
}

export function isNotFoundError(error: unknown): boolean {
  const cause = (error as {cause?: {response?: {statusCode?: number}}})?.cause
  return cause?.response?.statusCode === 404
}

export function isTimeoutError(error: unknown): boolean {
  const cause = (error as {cause?: {name?: string}})?.cause
  return cause?.name === 'TimeoutError'
}

export function formatWpError(error: unknown, url: string, timeoutMs: number = REQUEST_TIMEOUT_MS): string {
  const err = error as {message?: string; name?: string; response?: {body?: string; statusCode?: number}}
  const status = err.response?.statusCode

  if (status === 401 || status === 403) {
    return `Authentication failed (${status}) on ${url}. Check your credentials with \`lps project config\`.`
  }

  if (status === 404) {
    const reason = extractServerErrorMessage(err.response?.body)
    return reason
      ? `Request failed (404) on ${url}: ${reason}`
      : `Endpoint not found (404) on ${url}. Is the required plugin installed and up to date on the site?`
  }

  if (status !== undefined) {
    const reason = extractServerErrorMessage(err.response?.body)
    return reason ? `Request failed (${status}) on ${url}: ${reason}` : `Request failed (${status}) on ${url}.`
  }

  if (err.name === 'TimeoutError') {
    return `Request timed out after ${timeoutMs / 1000}s on ${url}. Is the site reachable?`
  }

  return `Request to ${url} failed: ${err.message ?? String(error)}`
}

// The Loopress plugin's own controllers reply with `{"error": "..."}`; a WP_Error-based
// core response (e.g. an uncaught fatal formatted by WordPress itself) uses `{"message": "..."}`.
// Surfacing this is what makes a deliberately clear server-side error (e.g. "Multiple snippet
// plugins are active...") actually reach the user instead of a bare, unhelpful status code.
//
// Some controllers (ComposerController::sync(), notably) pair a short, generic `error` (e.g.
// "Sync failed.") with the real detail in a separate `output` field (the raw Composer trace),
// specifically so a caller that only reads `error` doesn't see it — which is exactly what this
// function used to do, hiding the one piece of text that actually explains the failure.
function extractServerErrorMessage(body: string | undefined): string | undefined {
  if (!body) return undefined

  try {
    const parsed = JSON.parse(body) as {code?: unknown; error?: unknown; message?: unknown; output?: unknown}

    // WP core's own generic body for a route it never registered (e.g. a plugin too old to
    // expose this endpoint yet) is never more useful than the "is the plugin up to date?"
    // fallback below; surfacing it verbatim buries a version-skew mismatch behind text that
    // reads like the endpoint doesn't exist at all, pointing the user in the wrong direction.
    if (parsed.code === 'rest_no_route') return undefined

    const reason = parsed.error ?? parsed.message
    const summary = typeof reason === 'string' && reason.trim() ? reason : undefined
    const detail = typeof parsed.output === 'string' && parsed.output.trim() ? parsed.output.trim() : undefined

    if (summary && detail) return `${summary}\n${detail}`
    return summary ?? detail
  } catch {
    return undefined
  }
}
