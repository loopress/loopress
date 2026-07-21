import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/rankmath/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('rankmath list', () => {
  it('prints each redirect in human-readable form', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([
      {createdAt: null, headerCode: 301, hits: 0, id: 1, sources: [], status: 'active', updatedAt: null, urlTo: '/new'},
    ])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/rankmath/redirects')
    expect(logs.log).toHaveBeenCalledWith('redirects (1):')
    expect(logs.log).toHaveBeenCalledWith('  1. [active] 301 -> /new')
  })

  it('outputs valid JSON when --json is passed', async () => {
    const redirects = [{createdAt: null, headerCode: 301, hits: 0, id: 1, sources: [], status: 'active', updatedAt: null, urlTo: '/new'}]
    const {cmd, logs} = makeCmd(['--json'])
    const get = vi.fn().mockResolvedValueOnce(redirects)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const jsonCall = logs.log.mock.calls.find(([arg]: [string]) => arg.startsWith('['))
    expect(jsonCall).toBeDefined()
    expect(JSON.parse(jsonCall![0])).toEqual(redirects)
  })

  it('prints "(none)" when there are no redirects', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  (none)')
  })
})
