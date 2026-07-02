import got, {type Got} from 'got'

export const REQUEST_TIMEOUT_MS = 30_000

type HttpMethod = 'get' | 'post' | 'put'

/**
 * HTTP client for a WordPress site's REST API.
 * Paths are relative to `<site>/wp-json/`, e.g. `loopress/v1/plugins`.
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

export function formatWpError(error: unknown, url: string): string {
  const err = error as {message?: string; name?: string; response?: {statusCode?: number}}
  const status = err.response?.statusCode

  if (status === 401 || status === 403) {
    return `Authentication failed (${status}) on ${url}. Check your credentials with \`lps project config\`.`
  }

  if (status === 404) {
    return `Endpoint not found (404) on ${url}. Is the required plugin installed and up to date on the site?`
  }

  if (status !== undefined) {
    return `Request failed (${status}) on ${url}.`
  }

  if (err.name === 'TimeoutError') {
    return `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s on ${url}. Is the site reachable?`
  }

  return `Request to ${url} failed: ${err.message ?? String(error)}`
}
