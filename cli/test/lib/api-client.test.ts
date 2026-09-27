import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'
import {afterEach, describe, expect, it} from 'vitest'

import {ApiClient} from '../../src/lib/api-client.js'

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }

  throw new Error('expected a rejection')
}

describe('ApiClient', () => {
  let server: Server | undefined

  afterEach(() => {
    server?.close()
    server = undefined
  })

  async function serve(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
    timeoutMs?: number,
  ): Promise<ApiClient> {
    server = createServer(handler)
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    return new ApiClient('secret-token', `http://127.0.0.1:${port}`, timeoutMs)
  }

  it('POSTs a JSON body with a Bearer token and parses the response', async () => {
    let seenAuth = ''
    let seenBody = ''
    const client = await serve((req, res) => {
      seenAuth = req.headers.authorization ?? ''
      let raw = ''
      req.on('data', (chunk: Uint8Array) => {
        raw += chunk.toString()
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

  it("surfaces the API's own message on other refusals, joining validation errors", async () => {
    const client = await serve((_req, res) => {
      res.writeHead(400, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({error: 'Bad Request', message: ['name must be a string', 'url must be a URL'], statusCode: 400}))
    })

    await expect(client.post('projects', {name: 1})).rejects.toThrow(
      /Request failed \(400\) on http:\/\/127\.0\.0\.1:\d+\/projects: name must be a string; url must be a URL/,
    )
  })

  it('shows only the message of a 403, not the raw JSON body', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(403, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({error: 'Forbidden', message: 'Free plan is limited to 3 projects.', statusCode: 403}))
    })

    await expect(client.post('projects', {name: 'acme'})).rejects.toThrow(/projects: Free plan is limited to 3 projects\.$/)
  })

  it('times out with an actionable message instead of hanging when the API does not respond', async () => {
    const client = await serve(() => {
      // accept the request, never respond
    }, 100)

    await expect(client.post('projects', {name: 'acme'})).rejects.toThrow(
      /timed out after 0\.1s on http:\/\/127\.0\.0\.1:\d+\/projects.*network connection/,
    )
  })

  it('GETs a path under the base URL and parses the JSON body', async () => {
    let seen = ''
    const client = await serve((req, res) => {
      seen = `${req.method} ${req.url}`
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify([{id: 'p1'}]))
    })

    await expect(client.get('projects')).resolves.toEqual([{id: 'p1'}])
    expect(seen).toBe('GET /projects')
  })

  it('resolves to undefined on an empty response body', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(204)
      res.end()
    })

    await expect(client.put('projects/p1', {name: 'x'})).resolves.toBeUndefined()
  })

  it('formats a 401 exactly, naming the URL', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(401)
      res.end()
    })

    await expect(client.get('me')).rejects.toThrow(/^Not logged in or session expired on http:\/\/127\.0\.0\.1:\d+\/me\. Run `lps login` again\.$/)
  })

  it('falls back to the raw body of a 403 that is not JSON', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(403, {'Content-Type': 'text/html'})
      res.end('<h1>Blocked by proxy</h1>')
    })

    await expect(client.get('projects')).rejects.toThrow(/^Request rejected \(403\) on http:\/\/127\.0\.0\.1:\d+\/projects: <h1>Blocked by proxy<\/h1>$/)
  })

  it('falls back to the error message of a 403 with an empty body', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(403)
      res.end()
    })

    await expect(client.get('projects')).rejects.toThrow(/^Request rejected \(403\) on http:\/\/127\.0\.0\.1:\d+\/projects: \S.*$/)
  })

  it.each([
    ['a blank string message', {message: ' '.repeat(3)}],
    ['an empty message list', {message: []}],
    ['a non-string message', {message: 42}],
  ])('keeps the transport message for a refusal whose JSON body has %s', async (_label, body) => {
    const client = await serve((_req, res) => {
      res.writeHead(409, {'Content-Type': 'application/json'})
      res.end(JSON.stringify(body))
    })

    const error = await rejectionOf(client.post('projects', {name: 'acme'}))

    expect(error.message).not.toMatch(/^Request failed \(409\)/)
    expect(error.message).toContain('409')
  })

  it('keeps the transport message for a refusal with a non-JSON body', async () => {
    const client = await serve((_req, res) => {
      res.writeHead(502, {'Content-Type': 'text/html'})
      res.end('<html>Bad gateway</html>')
    })

    const error = await rejectionOf(client.get('projects'))

    expect(error.message).not.toContain('Bad gateway')
    expect(error.message).toContain('502')
    expect(error.cause).toBeDefined()
  })

  it('reports a connection failure with its own message', async () => {
    const client = await serve((_req, res) => {
      res.end()
    })
    const {port} = server!.address() as AddressInfo
    await new Promise<void>((resolve) => {
      server!.close(() => {
        resolve()
      })
    })
    server = undefined

    await expect(client.get('projects')).rejects.toThrow(new RegExp(`ECONNREFUSED.*${port}|${port}.*ECONNREFUSED`))
  })
})
