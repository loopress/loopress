import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/snippet/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('snippet list', () => {
  it('fetches the snippets endpoint and lists normalized snippets in the default output', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{active: true, id: 3, name: 'Cookie Banner', type: 'js'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/snippets')
    expect(logs.log).toHaveBeenCalledWith('Found 1 snippet:')
    expect(logs.log).toHaveBeenCalledWith('  3. Cookie Banner')
    expect(logs.log).toHaveBeenCalledWith('     Active: yes')
  })

  it('uses singular/plural correctly for more than one snippet', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([
      {id: 1, name: 'One'},
      {id: 2, name: 'Two'},
    ])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Found 2 snippets:')
  })

  it('shows "Active: no" for an inactive snippet', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{active: false, id: 1, name: 'Inactive'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('     Active: no')
  })

  it('shows tags joined by comma when present', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{id: 1, name: 'Tagged', tags: ['a', 'b']}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('     Tags: a, b')
  })

  it('omits the tags line when there are none', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{id: 1, name: 'No Tags', tags: []}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Tags:'))
  })

  it('shows the description line when present', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{description: 'A helpful snippet', id: 1, name: 'Described'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('     Description: A helpful snippet')
  })

  it('omits the description line when empty', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{description: '', id: 1, name: 'No Description'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Description:'))
  })

  it('prints "No snippets found" when there are none', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('No snippets found')
  })

  it('returns the normalized snippets so oclif can print them as JSON under --json', async () => {
    const {cmd} = makeCmd(['--json'])
    const get = vi.fn().mockResolvedValueOnce([{active: true, id: 3, name: 'Cookie Banner', type: 'js'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const snippets = await cmd.run()

    expect(snippets).toHaveLength(1)
    expect(snippets[0]).toMatchObject({active: true, id: 3, name: 'Cookie Banner'})
  })
})
