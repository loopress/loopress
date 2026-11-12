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

  it('returns the objects grouped by type so oclif can print them as JSON under --json', async () => {
    const {cmd} = makeCmd(['--json', '--type', 'field-groups'])
    const get = vi.fn().mockResolvedValueOnce([{key: 'group_1', title: 'One'}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual({'field-groups': [{key: 'group_1', title: 'One'}]})
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

  it('falls back to a placeholder for an untitled object and a keyless one', async () => {
    const {cmd, logs} = makeCmd(['--type', 'field-groups'])
    const get = vi.fn().mockResolvedValueOnce([{title: 5}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  (no key). (untitled)')
  })

  it('prints a blank line after each type and no "(none)" for a populated one', async () => {
    const {cmd, logs} = makeCmd(['--type', 'field-groups', 'post-types'])
    const get = vi.fn().mockResolvedValueOnce([{key: 'g', title: 'G'}]).mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log.mock.calls.map((call) => String(call[0]))).toEqual(['field-groups (1):', '  g. G', '', 'post-types (0):', '  (none)', ''])
  })
})
