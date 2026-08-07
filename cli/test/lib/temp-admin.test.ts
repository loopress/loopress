import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'
import {afterEach, describe, expect, it} from 'vitest'

import {createTempAdmin, deleteTempAdmin} from '../../src/lib/temp-admin.js'
import {WpClient} from '../../src/lib/wp-client.js'

describe('createTempAdmin / deleteTempAdmin', () => {
  let server: Server | undefined

  afterEach(() => {
    server?.close()
    server = undefined
  })

  async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<WpClient> {
    server = createServer(handler)
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    return new WpClient(`http://127.0.0.1:${port}`, 'user:pass')
  }

  it('creates an administrator with a generated username, password, and .invalid email', async () => {
    let seenBody = ''
    const wp = await serve((req, res) => {
      let raw = ''
      req.on('data', (chunk: Uint8Array) => {
        raw += chunk.toString()
      })
      req.on('end', () => {
        seenBody = raw
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 42}))
      })
    })

    const admin = await createTempAdmin(wp)
    const payload = JSON.parse(seenBody)

    expect(admin.id).toBe(42)
    expect(admin.username).toMatch(/^lps-temp-[\da-z]+$/)
    expect(admin.password.length).toBeGreaterThan(20)
    expect(payload).toEqual({
      email: `${admin.username}@lps-temp.invalid`,
      password: admin.password,
      roles: ['administrator'],
      username: admin.username,
    })
  })

  it('reassigns to the real user and deletes, then verifies the account is gone', async () => {
    const calls: string[] = []
    const wp = await serve((req, res) => {
      calls.push(`${req.method} ${req.url}`)
      if (req.url === '/wp-json/wp/v2/users/me') {
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 1}))
        return
      }

      if (req.method === 'DELETE') {
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({deleted: true}))
        return
      }

      // Post-delete verification GET: the account should be gone.
      res.writeHead(404, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({code: 'rest_user_invalid_id'}))
    })

    await expect(deleteTempAdmin(wp, {id: 7, password: 'x', username: 'lps-temp-abc'})).resolves.toBeUndefined()

    expect(calls).toEqual([
      'GET /wp-json/wp/v2/users/me',
      'DELETE /wp-json/wp/v2/users/7?reassign=1&force=true',
      'GET /wp-json/wp/v2/users/7',
    ])
  })

  it('throws, naming the account, when the DELETE call itself fails', async () => {
    const wp = await serve((req, res) => {
      if (req.url === '/wp-json/wp/v2/users/me') {
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 1}))
        return
      }

      res.writeHead(500)
      res.end('{}')
    })

    await expect(deleteTempAdmin(wp, {id: 7, password: 'x', username: 'lps-temp-abc'})).rejects.toThrow(
      /lps-temp-abc.*id 7/,
    )
  })

  it('throws, naming the account, when the account still exists after deletion', async () => {
    const wp = await serve((req, res) => {
      if (req.url === '/wp-json/wp/v2/users/me') {
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 1}))
        return
      }

      // DELETE "succeeds" but a subsequent GET still finds the account (WP core reported
      // success without actually removing it, or hidden replication lag).
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({id: 7}))
    })

    await expect(deleteTempAdmin(wp, {id: 7, password: 'x', username: 'lps-temp-abc'})).rejects.toThrow(
      /still exists after deletion/,
    )
  })
})
