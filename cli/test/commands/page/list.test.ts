import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/page/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('page list', () => {
  it('fetches the capped, unpaginated page list endpoint', async () => {
    const {cmd} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('wp/v2/pages?per_page=100')
  })

  it('prints id and title in the default (human-readable) output', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{id: 2, title: {rendered: 'Sample Page'}}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Pages (1):')
    expect(logs.log).toHaveBeenCalledWith('  2. Sample Page')
  })

  it('outputs valid JSON when --json is passed', async () => {
    const {cmd, logs} = makeCmd(['--json'])
    const pages = [{id: 2, title: {rendered: 'Sample Page'}}]
    const get = vi.fn().mockResolvedValueOnce(pages)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(JSON.parse(logs.log.mock.calls[0][0] as string)).toEqual(pages)
  })

  it('prints "(none)" when there are no pages', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  (none)')
  })
})
