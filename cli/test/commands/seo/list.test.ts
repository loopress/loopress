import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/seo/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('seo list', () => {
  it('groups posts by type and lists redirects when the active plugin supports them', async () => {
    const {cmd, logs} = makeCmd(['--post-type', 'page'])
    const get = vi
      .fn()
      .mockResolvedValueOnce([{meta: {}, slug: 'about', title: 'About'}])
      .mockResolvedValueOnce([{createdAt: null, headerCode: 301, hits: 0, id: 1, sources: [], status: 'active', updatedAt: null, urlTo: '/new'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page')
    expect(get).toHaveBeenCalledWith('loopress/v1/seo/redirects')
    expect(logs.log).toHaveBeenCalledWith('page (1):')
    expect(logs.log).toHaveBeenCalledWith('  about. About')
    expect(logs.log).toHaveBeenCalledWith('redirects (1):')
    expect(logs.log).toHaveBeenCalledWith('  1. [active] 301 -> /new')
  })

  // The active plugin (e.g. Yoast) not supporting redirects must not break the rest of the
  // listing, and must say so rather than silently printing "redirects (0)".
  it('reports why redirects are unavailable instead of failing the whole command', async () => {
    const {cmd, logs} = makeCmd(['--post-type', 'page'])
    const get = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Redirects are not supported by the active SEO plugin.'))
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('redirects: Redirects are not supported by the active SEO plugin.')
  })

  it('outputs valid JSON when --json is passed', async () => {
    const posts = [{meta: {}, slug: 'about', title: 'About'}]
    const {cmd, logs} = makeCmd(['--json', '--post-type', 'page'])
    const get = vi.fn().mockResolvedValueOnce(posts).mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const jsonCall = logs.log.mock.calls.find(([arg]: [string]) => arg.startsWith('{'))
    expect(jsonCall).toBeDefined()
    expect(JSON.parse(jsonCall![0])).toEqual({postMeta: {page: posts}, redirects: []})
  })

  it('prints "(none)" for a post type with no posts', async () => {
    const {cmd, logs} = makeCmd(['--post-type', 'page'])
    const get = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  (none)')
  })

  it('fetches post and page when --post-type is omitted', async () => {
    const {cmd} = makeCmd([])
    const get = vi.fn().mockResolvedValue([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/seo/post-meta/post')
    expect(get).toHaveBeenCalledWith('loopress/v1/seo/post-meta/page')
  })
})
