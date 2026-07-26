import got, {type Got} from 'got'

import {REQUEST_TIMEOUT_MS} from './wp-client.js'

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
      const response = await this.client(path, {json, method})
      return (response.body ? JSON.parse(response.body) : undefined) as T
    } catch (error) {
      throw new Error(formatApiError(error, `${this.baseUrl}/${path}`, this.timeoutMs), {cause: error})
    }
  }
}

function formatApiError(error: unknown, url: string, timeoutMs: number): string {
  const err = error as {message?: string; name?: string; response?: {body?: string; statusCode?: number}}
  const status = err.response?.statusCode

  if (status === 401) {
    return `Not logged in or session expired on ${url}. Run \`lps login\` again.`
  }

  if (status === 403) {
    return `Request rejected (${status}) on ${url}: ${err.response?.body ?? err.message}`
  }

  if (err.name === 'TimeoutError') {
    return `Request timed out after ${timeoutMs / 1000}s on ${url}. Check your network connection, or the Loopress API may be temporarily unreachable.`
  }

  return err.message ?? String(error)
}
