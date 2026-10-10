import type {APIRequestContext, APIResponse} from '@playwright/test'

import type {WpCredentials} from './environment.js'

// Basic auth with the app password: the same auth path the CLI's WpClient uses, so a REST
// assertion here sees exactly what the CLI would (see the requestUtils fixture's comment).
export function authHeader(wp: WpCredentials): string {
  return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`
}

export function restGet(request: APIRequestContext, wp: WpCredentials, path: string): Promise<APIResponse> {
  return request.get(`${wp.url}/wp-json/${path}`, {headers: {Authorization: authHeader(wp)}})
}

export function restPost(request: APIRequestContext, wp: WpCredentials, path: string, data: unknown): Promise<APIResponse> {
  return request.post(`${wp.url}/wp-json/${path}`, {data, headers: {Authorization: authHeader(wp)}})
}

export function restPut(request: APIRequestContext, wp: WpCredentials, path: string, data: unknown): Promise<APIResponse> {
  return request.put(`${wp.url}/wp-json/${path}`, {data, headers: {Authorization: authHeader(wp)}})
}

export function restDelete(request: APIRequestContext, wp: WpCredentials, path: string): Promise<APIResponse> {
  return request.delete(`${wp.url}/wp-json/${path}`, {headers: {Authorization: authHeader(wp)}})
}

// A short, unique, lowercase slug: post type slugs max out at 20 characters.
export function uniqueSlug(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`
}
