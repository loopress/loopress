import got, {type Got} from 'got'

import {errorMessage, isRecord} from './narrow.js'
import {withSpinner} from './spinner.js'
import {parseBody, REQUEST_TIMEOUT_MS, responseOf} from './wp-client.js'

export const API_URL = process.env.LPS_API_URL ?? 'https://api.loopress.dev'

type HttpMethod = 'get' | 'post' | 'put'

/**
 * HTTP client for the Loopress cloud API (projects, environments, credentials).
 * Authenticated with the console token obtained via `lps login`.
 */
export class ApiClient {
  private readonly baseUrl: string
  private readonly client: Got
  private readonly timeoutMs: number

  constructor(token: string, baseUrl: string = API_URL, timeoutMs: number = REQUEST_TIMEOUT_MS) {
    this.baseUrl = baseUrl
    this.timeoutMs = timeoutMs
    this.client = got.extend({
      headers: {Authorization: `Bearer ${token}`},
      prefixUrl: baseUrl,
      timeout: {request: timeoutMs},
    })
  }

  async get<T = unknown>(path: string): Promise<T> {
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
      const response = await withSpinner('Waiting for the Loopress API', async () => this.client(path, {json, method}))
      // The API contract boundary: each endpoint's shape is the caller's `T`, not checked here.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- see above
      return (response.body ? JSON.parse(response.body) : undefined) as T
    } catch (error) {
      throw new Error(formatApiError(error, `${this.baseUrl}/${path}`, this.timeoutMs), {cause: error})
    }
  }
}

function formatApiError(error: unknown, url: string, timeoutMs: number): string {
  const {body, statusCode: status} = responseOf(error)

  if (status === 401) {
    return `Not logged in or session expired on ${url}. Run \`lps login\` again.`
  }

  const reason = nestErrorMessage(body)

  if (status === 403) {
    // An empty body (not just a missing one) falls back to got's message too, never a bare ": ".
    return `Request rejected (${status}) on ${url}: ${reason ?? (body === '' ? undefined : body) ?? errorMessage(error)}`
  }

  // Any other API refusal (a 400 validation error, a 409 conflict) carries its explanation in
  // the body; got's own message ("Request failed with status code 400") never does.
  if (status !== undefined && reason) {
    return `Request failed (${status}) on ${url}: ${reason}`
  }

  if (isRecord(error) && error.name === 'TimeoutError') {
    return `Request timed out after ${timeoutMs / 1000}s on ${url}. Check your network connection, or the Loopress API may be temporarily unreachable.`
  }

  return errorMessage(error)
}

// NestJS's HttpException body: `{statusCode, message, error}`, where `message` is a list for a
// ValidationPipe failure (one entry per invalid field).
function nestErrorMessage(body: string | undefined): string | undefined {
  // Not JSON (a proxy's HTML error page) reads as no fields: nothing to extract.
  const {message} = parseBody(body)
  if (typeof message === 'string' && message.trim()) return message
  if (Array.isArray(message) && message.length > 0) return message.join('; ')
  return undefined
}
