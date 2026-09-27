import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/page/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(pages: unknown[]) {
  const cmd = new List([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const get = vi.fn().mockResolvedValueOnce(pages)
  ;(cmd as unknown as ListWithWpClient).wpClient = {get}
  return {cmd, get, logs}
}

describe('page list', () => {
  it('prints one line per page and returns the pages without their HTML', async () => {
    const {cmd, get, logs} = makeCmd([
      {html: '<p>About</p>', link: 'https://acme.com/about', slug: 'about', status: 'publish'},
      {html: '<p>Draft</p>', link: 'https://acme.com/draft', slug: 'draft', status: 'draft'},
    ])

    const result = await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/pages')
    expect(result).toEqual([
      {link: 'https://acme.com/about', slug: 'about', status: 'publish'},
      {link: 'https://acme.com/draft', slug: 'draft', status: 'draft'},
    ])
    expect(logs.log.mock.calls.map(([line]) => line)).toEqual([
      'Found 2 pages:',
      '',
      '  about  publish  https://acme.com/about',
      '  draft  draft  https://acme.com/draft',
    ])
  })

  it('says so when no page is managed by Loopress', async () => {
    const {cmd, logs} = makeCmd([])

    const result = await cmd.run()

    expect(result).toEqual([])
    expect(logs.log.mock.calls.map(([line]) => line)).toEqual(['No pages managed by Loopress'])
  })
})
