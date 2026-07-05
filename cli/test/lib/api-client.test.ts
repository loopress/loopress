import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'
import {afterEach, describe, expect, it} from 'vitest'

import {ApiClient} from '../../src/lib/api-client.js'

describe('ApiClient', () => {
  let server: Server | undefined

  afterEach(() => {
    server?.close()
    server = undefined
  })

  async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<ApiClient> {
    server = createServer(handler)
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    return new ApiClient('secret-token', `http://127.0.0.1:${port}`)
  }

  it('POSTs a JSON body with a Bearer token and parses the response', async () => {
    let seenAuth = ''
    let seenBody = ''
    const client = await serve((req, res) => {
      seenAuth = req.headers.authorization ?? ''
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        seenBody = raw
        res.writeHead(201, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({id: 'proj_1', name: 'acme'}))
      })
    })

    const result = await client.post<{id: string; name: string}>('projects', {name: 'acme'})

    expect(result).toEqual({id: 'proj_1', name: 'acme'})
    expect(seenAuth).toBe('Bearer secret-token')
    expect(JSON.parse(seenBody)).toEqual({name: 'acme'})
  })

  it('PUTs a JSON body', async () => {
    let seenMethod = ''
    const client = await serve((req, res) => {
      seenMethod = req.method ?? ''
      res.writeHead(204)
      res.end()
    })

    await client.put('projects/proj_1/environments/env_1/credentials', {password: 'p', username: 'u'})

    expect(seenMethod).toBe('PUT')
  })

  it('formats a 401 response as a re-login prompt', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(401, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({message: 'Unauthorized'}))
    })

    await expect(client.post('projects', {name: 'acme'})).rejects.toThrow('lps login')
  })

  it('formats a 403 response with the server message', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(403, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({message: 'Free plan is limited to 3 projects.'}))
    })

    await expect(client.post('projects', {name: 'acme'})).rejects.toThrow('Free plan is limited to 3 projects.')
  })
})
