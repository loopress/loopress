import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/acf/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('acf list', () => {
  it('groups objects by type in the default (human-readable) output', async () => {
    const {cmd, logs} = makeCmd(['--type', 'field-groups'])
    const get = vi.fn().mockResolvedValueOnce([{key: 'group_1', title: 'One'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/acf/field-groups')
    expect(logs.log).toHaveBeenCalledWith('field-groups (1):')
    expect(logs.log).toHaveBeenCalledWith('  group_1. One')
  })

  it('outputs valid JSON grouped by type when --json is passed', async () => {
    const {cmd, logs} = makeCmd(['--json', '--type', 'field-groups'])
    const get = vi.fn().mockResolvedValueOnce([{key: 'group_1', title: 'One'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const jsonCall = logs.log.mock.calls.find(([arg]: [string]) => arg.startsWith('{'))
    expect(jsonCall).toBeDefined()
    expect(JSON.parse(jsonCall![0])).toEqual({'field-groups': [{key: 'group_1', title: 'One'}]})
  })

  it('prints "(none)" for a type with no objects', async () => {
    const {cmd, logs} = makeCmd(['--type', 'taxonomies'])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  (none)')
  })

  it('only fetches the types passed via --type', async () => {
    const {cmd} = makeCmd(['--type', 'post-types'])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('loopress/v1/acf/post-types')
  })

  it('fetches all four types when --type is omitted', async () => {
    const {cmd} = makeCmd([])
    const get = vi.fn().mockResolvedValue([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledTimes(4)
  })
})
