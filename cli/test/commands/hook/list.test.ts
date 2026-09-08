import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/hook/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('hook list', () => {
  it('fetches the hook-files endpoint and lists filenames in the default (human-readable) output', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([{content: '<?php', filename: 'content-hooks'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/hook-files')
    expect(logs.log).toHaveBeenCalledWith('Found 1 hook file:')
    expect(logs.log).toHaveBeenCalledWith('  content-hooks')
  })

  it('uses singular/plural correctly for more than one file', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([
      {content: '<?php', filename: 'content-hooks'},
      {content: '<?php', filename: 'cleanup-cron'},
    ])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Found 2 hook files:')
  })

  it('prints "No hook files found" when there are none', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('No hook files found')
  })

  it('returns the raw files array so oclif can print it as JSON under --json', async () => {
    const {cmd} = makeCmd(['--json'])
    const files = [{content: '<?php', filename: 'content-hooks'}]
    const get = vi.fn().mockResolvedValueOnce(files)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual(files)
  })
})
