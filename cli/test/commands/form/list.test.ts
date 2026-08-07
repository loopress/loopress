import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/form/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('form list', () => {
  it('fetches the forms endpoint and lists id + title in the default (human-readable) output', async () => {
    const {cmd, logs} = makeCmd([])
     
    const get = vi.fn().mockResolvedValueOnce([{id: 3, settings: {form_title: 'Contact'}}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/forms')
    expect(logs.log).toHaveBeenCalledWith('Forms (1):')
    expect(logs.log).toHaveBeenCalledWith('  3. Contact')
  })

  it('shows "(no id)" for a form with no usable id', async () => {
    const {cmd, logs} = makeCmd([])
     
    const get = vi.fn().mockResolvedValueOnce([{settings: {form_title: 'No Id'}}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  (no id). No Id')
  })

  it('prints "(none)" when there are no forms', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Forms (0):')
    expect(logs.log).toHaveBeenCalledWith('  (none)')
  })

  it('outputs valid JSON of the raw forms array when --json is passed', async () => {
    const {cmd, logs} = makeCmd(['--json'])
     
    const forms = [{id: 3, settings: {form_title: 'Contact'}}]
    const get = vi.fn().mockResolvedValueOnce(forms)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const jsonCall = logs.log.mock.calls.find(([arg]: [string]) => arg.startsWith('['))
    expect(jsonCall).toBeDefined()
    expect(JSON.parse(jsonCall![0])).toEqual(forms)
  })

  it('does not print the "Forms (n):" header when --json is passed', async () => {
    const {cmd, logs} = makeCmd(['--json'])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Forms ('))
  })
})
