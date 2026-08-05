import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/api/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('api list', () => {
  it('fetches the api-files endpoint and lists filenames in the default (human-readable) output', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{content: '<?php', filename: 'products'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/api-files')
    expect(logs.log).toHaveBeenCalledWith('Found 1 route file:')
    expect(logs.log).toHaveBeenCalledWith('  products')
  })

  it('uses singular/plural correctly for more than one file', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([
      {content: '<?php', filename: 'products'},
      {content: '<?php', filename: 'orders'},
    ])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Found 2 route files:')
  })

  it('prints "No API route files found" when there are none', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('No API route files found')
  })

  it('returns the raw files array so oclif can print it as JSON under --json', async () => {
    const {cmd} = makeCmd(['--json'])
    const files = [{content: '<?php', filename: 'products'}]
    const get = vi.fn().mockResolvedValueOnce(files)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual(files)
  })
})
