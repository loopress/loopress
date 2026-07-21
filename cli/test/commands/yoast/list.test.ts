import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/yoast/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('yoast list', () => {
  it('groups posts by type in the default (human-readable) output', async () => {
    const {cmd, logs} = makeCmd(['--post-type', 'page'])
    const get = vi.fn().mockResolvedValueOnce([{meta: {}, slug: 'about', title: 'About'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/yoast/post-meta/page')
    expect(logs.log).toHaveBeenCalledWith('page (1):')
    expect(logs.log).toHaveBeenCalledWith('  about. About')
  })

  it('outputs valid JSON grouped by type when --json is passed', async () => {
    const {cmd, logs} = makeCmd(['--json', '--post-type', 'page'])
    const get = vi.fn().mockResolvedValueOnce([{meta: {}, slug: 'about', title: 'About'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const jsonCall = logs.log.mock.calls.find(([arg]: [string]) => arg.startsWith('{'))
    expect(jsonCall).toBeDefined()
    expect(JSON.parse(jsonCall![0])).toEqual({page: [{meta: {}, slug: 'about', title: 'About'}]})
  })

  it('prints "(none)" for a type with no posts', async () => {
    const {cmd, logs} = makeCmd(['--post-type', 'page'])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  (none)')
  })

  it('fetches post and page when --post-type is omitted', async () => {
    const {cmd} = makeCmd([])
    const get = vi.fn().mockResolvedValue([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenCalledWith('loopress/v1/yoast/post-meta/post')
    expect(get).toHaveBeenCalledWith('loopress/v1/yoast/post-meta/page')
  })
})
