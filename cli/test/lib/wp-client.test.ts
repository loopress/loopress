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
    let seenMethod = ''
    const client = await serve((req, res) => {
      seenUrl = req.url ?? ''
      seenAuth = req.headers.authorization ?? ''
      seenMethod = req.method ?? ''
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify([{slug: 'akismet'}]))
    })

    const result = await client.get<Array<{slug: string}>>('loopress/v1/plugins')

    expect(result).toEqual([{slug: 'akismet'}])
    expect(seenUrl).toBe('/wp-json/loopress/v1/plugins')
    expect(seenAuth).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`)
    expect(seenMethod).toBe('GET')
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

  it('DELETEs a path', async () => {
    let seenMethod = ''
    let seenUrl = ''
    const client = await serve((req, res) => {
      seenMethod = req.method ?? ''
      seenUrl = req.url ?? ''
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({deleted: true}))
    })

    const result = await client.delete<{deleted: boolean}>('wp/v2/users/5?reassign=1&force=true')

    expect(result).toEqual({deleted: true})
    expect(seenMethod).toBe('DELETE')
    expect(seenUrl).toBe('/wp-json/wp/v2/users/5?reassign=1&force=true')
  })

  it('tolerates an empty response body', async () => {
    const client = await serve((req, res) => {
      res.writeHead(200)
      res.end()
    })

    await expect(client.post('loopress/v1/composer/sync', {})).resolves.toBeUndefined()
  })

  it('applies a per-request timeout when one is passed', async () => {
    const client = await serve(() => {
      // accept the request, never respond
    })

    await expect(client.post('loopress/v1/composer/sync', {}, {timeoutMs: 100})).rejects.toThrow(
      /timed out after 0\.1s/,
    )
  })

  it('maps a 401 to a friendly credentials error', async () => {
    const client = await serve((req, res) => {
      res.writeHead(401)
      res.end('{}')
    })

    await expect(client.get('loopress/v1/plugins')).rejects.toThrow(/Authentication failed \(401\).*lps project config/)
  })

  it('maps a 404 with no error body to a friendly missing-plugin error', async () => {
    const client = await serve((req, res) => {
      res.writeHead(404)
      res.end('{}')
    })

    await expect(client.get('loopress/v1/plugins')).rejects.toThrow(/Endpoint not found \(404\)/)
  })

  it("surfaces the server's own error message on a 404 instead of the generic missing-plugin one", async () => {
    const client = await serve((req, res) => {
      res.writeHead(404, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({error: 'composer.lock not found'}))
    })

    await expect(client.get('loopress/v1/composer/lock')).rejects.toThrow(/composer\.lock not found/)
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


describe('formatWpError', () => {
  const url = 'https://example.com/wp-json/loopress/v1/plugins'

  it('suggests lps project config on 401 and 403', () => {
    for (const statusCode of [401, 403]) {
      const message = formatWpError({response: {statusCode}}, url)
      expect(message).toContain(`Authentication failed (${statusCode})`)
      expect(message).toContain('lps project config')
    }
  })

  it('mentions the plugin on a 404 with no error body', () => {
    expect(formatWpError({response: {body: '{}', statusCode: 404}}, url)).toContain('Is the required plugin installed')
  })

  // Regression coverage: a Loopress controller can legitimately return 404 with its own
  // {error} body for an applicative "not found" (e.g. composer/lock on a site that never
  // had dependencies pushed). That message must win over the generic missing-plugin one.
  it("prefers the server's own {error} message over the generic missing-plugin one on a 404", () => {
    const body = JSON.stringify({error: 'composer.lock not found'})
    const message = formatWpError({response: {body, statusCode: 404}}, url)
    expect(message).toContain('composer.lock not found')
    expect(message).not.toContain('Is the required plugin installed')
  })

  it("includes the server's own {error} message for other status codes", () => {
    const body = JSON.stringify({error: 'Multiple snippet plugins are active at once.'})
    const message = formatWpError({response: {body, statusCode: 500}}, url)
    expect(message).toContain('Request failed (500)')
    expect(message).toContain('Multiple snippet plugins are active at once.')
  })

  // Regression coverage: ComposerController::sync() (and others) pair a short, generic
  // {error} ("Sync failed.") with the real Composer trace in a separate {output} field.
  // Reading only {error} hid the one piece of text that actually explains the failure.
  it("includes the server's {output} field alongside a generic {error} summary", () => {
    const body = JSON.stringify({
      error: 'Sync failed.',
      output: 'In PluginManager.php line 821:\n  composer/installers contains a Composer plugin which is blocked...',
    })
    const message = formatWpError({response: {body, statusCode: 500}}, url)
    expect(message).toContain('Sync failed.')
    expect(message).toContain('PluginManager.php line 821')
  })

  it('falls back to the {output} field alone when there is no {error} field', () => {
    const body = JSON.stringify({output: 'Some raw tool output with no summary.'})
    const message = formatWpError({response: {body, statusCode: 500}}, url)
    expect(message).toContain('Some raw tool output with no summary.')
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

  // Regression coverage: `err.message ?? String(error)` only distinguishes itself from
  // `err.message && String(error)` when message is actually absent, an Error's message is
  // always truthy in the test above so both operators produce a message containing the same
  // text. A thrown value with no `.message` at all is the case that tells them apart.
  it('falls back to String(error) when the thrown value has no message property at all', () => {
    expect(formatWpError('a plain string error', url)).toBe('Request to https://example.com/wp-json/loopress/v1/plugins failed: a plain string error')
  })

  it('treats a whitespace-only {error} field the same as an absent one', () => {
    const message = formatWpError({response: {body: JSON.stringify({error: '   '}), statusCode: 500}}, url)
    expect(message).toBe(`Request failed (500) on ${url}.`)
  })

  it('treats a whitespace-only {output} field the same as an absent one', () => {
    const message = formatWpError({response: {body: JSON.stringify({output: '   '}), statusCode: 500}}, url)
    expect(message).toBe(`Request failed (500) on ${url}.`)
  })

  it('falls back to the generic message when the response has no body at all (not even an empty one)', () => {
    const message = formatWpError({response: {statusCode: 500}}, url)
    expect(message).toBe(`Request failed (500) on ${url}.`)
  })
})
