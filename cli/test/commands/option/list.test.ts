import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/option/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('option list', () => {
  it('fetches the options endpoint and renders name/autoload/core/source as an aligned table, never the value', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([
      {autoload: 'yes', core: true, guess: null, name: 'blogname'},
      {autoload: 'no', core: false, guess: null, name: 'wpseo_titles'},
      {autoload: 'auto', core: false, guess: 'code-snippets', name: 'code_snippets_settings'},
    ])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/options')
    expect(logs.log).toHaveBeenCalledWith('Found 3 options:\n')
    expect(logs.log).toHaveBeenCalledWith(
      [
        '  NAME                    AUTOLOAD  CORE  SOURCE?       ',
        '  ----------------------  --------  ----  --------------',
        '  blogname                yes       yes                 ',
        '  wpseo_titles            no                            ',
        '  code_snippets_settings  auto            code-snippets?',
      ].join('\n'),
    )
  })

  // Found live against a real site: a plugin (WPForms) writes filesystem paths into an option
  // name, ~140 chars, which would otherwise stretch the NAME column to match that one outlier.
  it('truncates a pathologically long name so it does not blow up the column width', async () => {
    const {cmd, logs} = makeCmd([])
    const longName = `_wpforms_transient_wpforms_${'/segment'.repeat(15)}`
    const get = vi.fn().mockResolvedValueOnce([{autoload: 'on', core: false, guess: null, name: longName}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const table = logs.log.mock.calls.map((call) => call[0] as string).find((line) => line.includes('…'))
    expect(table).toBeDefined()
    const nameCell = table!.split('\n', 3)[2].trim().split(/\s{2,}/, 1)[0]
    expect(nameCell).toHaveLength(60)
    expect(nameCell.endsWith('…')).toBe(true)
  })

  it('prints "No options found" when there are none', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('No options found')
  })

  it('returns the raw list so oclif can print it as JSON under --json', async () => {
    const {cmd} = makeCmd(['--json'])
    const names = [{autoload: 'yes', core: true, guess: null, name: 'blogname'}]
    const get = vi.fn().mockResolvedValueOnce(names)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual(names)
  })
})
