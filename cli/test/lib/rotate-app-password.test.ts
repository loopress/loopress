import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'
import {afterEach, describe, expect, it} from 'vitest'

import {isAppPasswordStale, rotateAppPassword} from '../../src/lib/rotate-app-password.js'
import {type EnvironmentConfig} from '../../src/types/config.js'

const OLD_TOKEN = 'user:old-pass'
const NEW_TOKEN_PASSWORD = 'new-pass-123'
const OLD_UUID = 'old-uuid'
const NEW_UUID = 'new-uuid'

describe('isAppPasswordStale', () => {
  it('is false for a recently added environment', () => {
    expect(isAppPasswordStale(new Date().toISOString())).toBe(false)
  })

  it('is true past 90 days', () => {
    const addedAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString()
    expect(isAppPasswordStale(addedAt)).toBe(true)
  })
})

describe('rotateAppPassword', () => {
  let server: Server | undefined
  let requests: Array<{auth: string; method: string; url: string}>
  let isVerifyShouldFail: boolean
  let isCreateOmitsPassword: boolean

  afterEach(() => {
    server?.close()
    server = undefined
  })

  async function serve(): Promise<{env: EnvironmentConfig & {token: string}; url: string}> {
    requests = []
    isVerifyShouldFail = false
    isCreateOmitsPassword = false

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      requests.push({auth: req.headers.authorization ?? '', method: req.method ?? '', url: req.url ?? ''})
      const auth = req.headers.authorization ?? ''
      const isNewToken = auth === `Basic ${Buffer.from(`user:${NEW_TOKEN_PASSWORD}`).toString('base64')}`

      res.writeHead(isVerifyShouldFail && isNewToken ? 401 : 200, {'Content-Type': 'application/json'})

      if (req.method === 'GET' && req.url?.endsWith('/introspect')) {
        res.end(JSON.stringify({uuid: isNewToken ? NEW_UUID : OLD_UUID}))
      } else if (req.method === 'POST') {
        res.end(JSON.stringify(isCreateOmitsPassword ? {uuid: NEW_UUID} : {password: NEW_TOKEN_PASSWORD, uuid: NEW_UUID}))
      } else if (req.method === 'DELETE') {
        res.end(JSON.stringify({deleted: true}))
      } else {
        res.end('{}')
      }
    })

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    const url = `http://127.0.0.1:${port}`

    return {env: {addedAt: '2024-01-01T00:00:00.000Z', name: 'production', token: OLD_TOKEN, url}, url}
  }

  it('creates, verifies, then revokes the old credential, in that order', async () => {
    const {env} = await serve()

    const rotated = await rotateAppPassword(env)

    expect(rotated.token).toBe(`user:${NEW_TOKEN_PASSWORD}`)
    expect(rotated.addedAt).not.toBe(env.addedAt)

    const methods = requests.map((r) => `${r.method} ${r.url}`)
    expect(methods).toEqual([
      'GET /wp-json/wp/v2/users/me/application-passwords/introspect',
      'POST /wp-json/wp/v2/users/me/application-passwords',
      'GET /wp-json/wp/v2/users/me/application-passwords/introspect',
      `DELETE /wp-json/wp/v2/users/me/application-passwords/${OLD_UUID}`,
    ])

    // the introspect used to find what to delete authenticated with the OLD credential,
    // the verify + delete steps both used the NEW one, never the old one for the delete
    expect(requests[0].auth).toBe(`Basic ${Buffer.from(OLD_TOKEN).toString('base64')}`)
    expect(requests[3].auth).toBe(`Basic ${Buffer.from(`user:${NEW_TOKEN_PASSWORD}`).toString('base64')}`)
  })

  it('never revokes the old credential when the new one fails to verify, and cleans up the orphan instead', async () => {
    const {env} = await serve()
    isVerifyShouldFail = true

    await expect(rotateAppPassword(env)).rejects.toThrow()

    const deletes = requests.filter((r) => r.method === 'DELETE')
    expect(deletes).toHaveLength(1)
    expect(deletes[0].url).toBe(`/wp-json/wp/v2/users/me/application-passwords/${NEW_UUID}`)
    // cleaned up with the still-valid OLD credentials, since the new ones just failed to verify
    expect(deletes[0].auth).toBe(`Basic ${Buffer.from(OLD_TOKEN).toString('base64')}`)
  })

  it('throws a clear error, without ever calling the new credential, when creation omits a password', async () => {
    const {env} = await serve()
    isCreateOmitsPassword = true

    await expect(rotateAppPassword(env)).rejects.toThrow('did not return a password')

    const methods = requests.map((r) => `${r.method} ${r.url}`)
    expect(methods).toEqual([
      'GET /wp-json/wp/v2/users/me/application-passwords/introspect',
      'POST /wp-json/wp/v2/users/me/application-passwords',
    ])
  })
})
