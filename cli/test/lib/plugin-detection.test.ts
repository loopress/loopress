import {createServer, type Server} from 'node:http'
import {type AddressInfo} from 'node:net'
import {afterEach, describe, expect, it} from 'vitest'

import {isLoopressFullActive} from '../../src/lib/plugin-detection.js'
import {WpClient} from '../../src/lib/wp-client.js'

describe('isLoopressFullActive', () => {
  let server: Server | undefined

  afterEach(() => {
    server?.close()
    server = undefined
  })

  async function clientReturning(body: unknown): Promise<WpClient> {
    server = createServer((req, res) => {
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify(body))
    })
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', resolve)
    })
    const {port} = server.address() as AddressInfo
    return new WpClient(`http://127.0.0.1:${port}`, 'user:pass')
  }

  it('is true when loopress-full is active', async () => {
    const wp = await clientReturning([
      {name: 'Loopress Full', plugin: 'loopress-full/loopress.php', status: 'active', version: '1.0'},
    ])

    await expect(isLoopressFullActive(wp)).resolves.toBe(true)
  })

  it('is false when loopress-full is present but inactive', async () => {
    const wp = await clientReturning([
      {name: 'Loopress Full', plugin: 'loopress-full/loopress.php', status: 'inactive', version: '1.0'},
    ])

    await expect(isLoopressFullActive(wp)).resolves.toBe(false)
  })

  it('is false when loopress-full is absent', async () => {
    const wp = await clientReturning([
      {name: 'Akismet', plugin: 'akismet/akismet.php', status: 'active', version: '5.0'},
    ])

    await expect(isLoopressFullActive(wp)).resolves.toBe(false)
  })

  it('does not match loopress-light as loopress-full', async () => {
    const wp = await clientReturning([
      {name: 'Loopress Light', plugin: 'loopress-light/loopress.php', status: 'active', version: '1.0'},
    ])

    await expect(isLoopressFullActive(wp)).resolves.toBe(false)
  })
})
