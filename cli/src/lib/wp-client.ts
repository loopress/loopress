import got, {type Got} from 'got'

export const REQUEST_TIMEOUT_MS = 30_000

type HttpMethod = 'get' | 'post' | 'put'

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

  async get<T>(path: string): Promise<T> {
    return this.request<T>('get', path)
  }

  async post<T = unknown>(path: string, json?: Record<string, unknown>): Promise<T> {
    return this.request<T>('post', path, json)
  }

  async put<T = unknown>(path: string, json?: Record<string, unknown>): Promise<T> {
    return this.request<T>('put', path, json)
  }

  private async request<T>(method: HttpMethod, path: string, json?: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.client(path, {json, method})
      return (response.body ? JSON.parse(response.body) : undefined) as T
    } catch (error) {
      throw new Error(formatWpError(error, `${this.siteUrl}/wp-json/${path}`), {cause: error})
    }
  }
}

export function isNotFoundError(error: unknown): boolean {
  const cause = (error as {cause?: {response?: {statusCode?: number}}})?.cause
  return cause?.response?.statusCode === 404
}

export function formatWpError(error: unknown, url: string): string {
  const err = error as {message?: string; name?: string; response?: {body?: string; statusCode?: number}}
  const status = err.response?.statusCode

  if (status === 401 || status === 403) {
    return `Authentication failed (${status}) on ${url}. Check your credentials with \`lps project config\`.`
  }

  if (status === 404) {
    return `Endpoint not found (404) on ${url}. Is the required plugin installed and up to date on the site?`
  }

  if (status !== undefined) {
    const reason = extractServerErrorMessage(err.response?.body)
    return reason ? `Request failed (${status}) on ${url}: ${reason}` : `Request failed (${status}) on ${url}.`
  }

  if (err.name === 'TimeoutError') {
    return `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s on ${url}. Is the site reachable?`
  }

  return `Request to ${url} failed: ${err.message ?? String(error)}`
}

// The Loopress plugin's own controllers reply with `{"error": "..."}`; a WP_Error-based
// core response (e.g. an uncaught fatal formatted by WordPress itself) uses `{"message": "..."}`.
// Surfacing this is what makes a deliberately clear server-side error (e.g. "Multiple snippet
// plugins are active...") actually reach the user instead of a bare, unhelpful status code.
function extractServerErrorMessage(body: string | undefined): string | undefined {
  if (!body) return undefined

  try {
    const parsed = JSON.parse(body) as {error?: unknown; message?: unknown}
    const reason = parsed.error ?? parsed.message
    return typeof reason === 'string' && reason.trim() ? reason : undefined
  } catch {
    return undefined
  }
}
