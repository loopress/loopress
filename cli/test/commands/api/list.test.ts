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

  it('outputs valid JSON of the raw files array when --json is passed', async () => {
    const {cmd, logs} = makeCmd(['--json'])
    const files = [{content: '<?php', filename: 'products'}]
    const get = vi.fn().mockResolvedValueOnce(files)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const jsonCall = logs.log.mock.calls.find(([arg]: [string]) => arg.startsWith('['))
    expect(jsonCall).toBeDefined()
    expect(JSON.parse(jsonCall![0])).toEqual(files)
  })

  it('does not print the "Found" summary when --json is passed', async () => {
    const {cmd, logs} = makeCmd(['--json'])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Found'))
    expect(logs.log).not.toHaveBeenCalledWith('No API route files found')
  })
})
