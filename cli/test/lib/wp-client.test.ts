import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {type AddressInfo} from 'node:net'
import {afterEach, describe, expect, it} from 'vitest'

import {formatWpError, WpClient} from '../../src/lib/wp-client.js'

describe('WpClient', () => {
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

  it('GETs a wp-json path with basic auth and parses the JSON response', async () => {
    let seenUrl = ''
    let seenAuth = ''
    const client = await serve((req, res) => {
      seenUrl = req.url ?? ''
      seenAuth = req.headers.authorization ?? ''
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify([{slug: 'akismet'}]))
    })

    const result = await client.get<Array<{slug: string}>>('loopress/v1/plugins')

    expect(result).toEqual([{slug: 'akismet'}])
    expect(seenUrl).toBe('/wp-json/loopress/v1/plugins')
    expect(seenAuth).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
  })

  it('POSTs a JSON body', async () => {
    let seenBody = ''
    let seenMethod = ''
    const client = await serve((req, res) => {
      seenMethod = req.method ?? ''
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        seenBody = raw
        res.writeHead(200, {'Content-Type': 'application/json'})
        res.end(JSON.stringify({message: 'ok'}))
      })
    })

    const result = await client.post<{message: string}>('loopress/v1/plugins/activate', {slug: 'akismet'})

    expect(result).toEqual({message: 'ok'})
    expect(seenMethod).toBe('POST')
    expect(JSON.parse(seenBody)).toEqual({slug: 'akismet'})
  })

  it('tolerates an empty response body', async () => {
    const client = await serve((req, res) => {
      res.writeHead(200)
      res.end()
    })

    await expect(client.post('loopress/v1/composer/sync', {})).resolves.toBeUndefined()
  })

  it('maps a 401 to a friendly credentials error', async () => {
    const client = await serve((req, res) => {
      res.writeHead(401)
      res.end('{}')
    })

    await expect(client.get('loopress/v1/plugins')).rejects.toThrow(/Authentication failed \(401\).*lps project config/)
  })

  it('maps a 404 to a friendly missing-plugin error', async () => {
    const client = await serve((req, res) => {
      res.writeHead(404)
      res.end('{}')
    })

    await expect(client.get('loopress/v1/plugins')).rejects.toThrow(/Endpoint not found \(404\)/)
  })

  it('maps other HTTP errors to a generic message with the status code', async () => {
    const client = await serve((req, res) => {
      res.writeHead(500)
      res.end('{}')
    })

    await expect(client.get('loopress/v1/plugins')).rejects.toThrow(/Request failed \(500\)/)
  })

  it("surfaces the server's own error message alongside the status code", async () => {
    const client = await serve((req, res) => {
      res.writeHead(500, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({error: 'Multiple snippet plugins are active at once.'}))
    })

    await expect(client.get('loopress/v1/snippets')).rejects.toThrow(
      /Request failed \(500\).*Multiple snippet plugins are active at once\./,
    )
  })
})

// eslint-disable-next-line mocha/max-top-level-suites -- one suite per exported symbol of wp-client.ts
describe('formatWpError', () => {
  const url = 'https://example.com/wp-json/loopress/v1/plugins'

  it('suggests lps project config on 401 and 403', () => {
    for (const statusCode of [401, 403]) {
      const message = formatWpError({response: {statusCode}}, url)
      expect(message).toContain(`Authentication failed (${statusCode})`)
      expect(message).toContain('lps project config')
    }
  })

  it('mentions the plugin on 404', () => {
    expect(formatWpError({response: {statusCode: 404}}, url)).toContain('Is the required plugin installed')
  })

  it("includes the server's own {error} message for other status codes", () => {
    const body = JSON.stringify({error: 'Multiple snippet plugins are active at once.'})
    const message = formatWpError({response: {body, statusCode: 500}}, url)
    expect(message).toContain('Request failed (500)')
    expect(message).toContain('Multiple snippet plugins are active at once.')
  })

  it("includes the server's own {message} field when there is no {error} field", () => {
    const body = JSON.stringify({message: 'Something else went wrong.'})
    const message = formatWpError({response: {body, statusCode: 500}}, url)
    expect(message).toContain('Something else went wrong.')
  })

  it('falls back to the generic message when the body has neither field', () => {
    const message = formatWpError({response: {body: '{}', statusCode: 500}}, url)
    expect(message).toBe(`Request failed (500) on ${url}.`)
  })

  it('falls back to the generic message when the body is not valid JSON', () => {
    const message = formatWpError({response: {body: 'not json', statusCode: 500}}, url)
    expect(message).toBe(`Request failed (500) on ${url}.`)
  })

  it('mentions the timeout duration on TimeoutError', () => {
    expect(formatWpError({name: 'TimeoutError'}, url)).toContain('timed out after 30s')
  })

  it('falls back to the original message for network errors', () => {
    expect(formatWpError(new Error('ECONNREFUSED'), url)).toContain('ECONNREFUSED')
  })
})
