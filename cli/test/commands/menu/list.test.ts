import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/menu/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[] = []) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('menu list', () => {
  it('prints each menu with its total item count, including nested children', async () => {
    const {cmd, logs} = makeCmd()
    const get = vi
      .fn()
      .mockResolvedValueOnce([
        {
          items: [
            {
              children: [{children: [], classes: [], description: '', object: null, objectSlug: null, target: '', title: '', type: 'custom', url: '/x', xfn: ''}],
              classes: [],
              description: '',
              object: 'page',
              objectSlug: 'about',
              target: '',
              title: '',
              type: 'post_type',
              url: null,
              xfn: '',
            },
          ],
          name: 'Main Menu',
          slug: 'main',
          warnings: [],
        },
      ])
      .mockResolvedValueOnce({primary: 'main'})
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/menus')
    expect(get).toHaveBeenCalledWith('loopress/v1/menu-locations')
    expect(logs.log).toHaveBeenCalledWith('main (Main Menu): 2 item(s)')
    expect(logs.log).toHaveBeenCalledWith('  primary: main')
  })

  it('prints "(no menus)" when there are none', async () => {
    const {cmd, logs} = makeCmd()
    const get = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({})
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('(no menus)')
  })

  it('reports an unassigned location explicitly', async () => {
    const {cmd, logs} = makeCmd()
    const get = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({footer: null})
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  footer: (unassigned)')
  })

  it('warns for every menu-level warning returned by the server', async () => {
    const {cmd, logs} = makeCmd()
    const get = vi
      .fn()
      .mockResolvedValueOnce([{items: [], name: 'Main', slug: 'main', warnings: ['item 4 references a deleted page']}])
      .mockResolvedValueOnce({})
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.warn).toHaveBeenCalledWith('main: item 4 references a deleted page')
  })

  it('returns menus and locations for --json', async () => {
    const {cmd} = makeCmd(['--json'])
    const get = vi
      .fn()
      .mockResolvedValueOnce([{items: [], name: 'Main', slug: 'main', warnings: []}])
      .mockResolvedValueOnce({primary: 'main'})
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual({
      locations: {primary: 'main'},
      menus: [{items: [], name: 'Main', slug: 'main', warnings: []}],
    })
  })
})
