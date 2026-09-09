import type * as OclifCore from '@oclif/core'

import {ux} from '@oclif/core'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/option/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

vi.mock('@oclif/core', async (importOriginal) => {
  const actual = await importOriginal<typeof OclifCore>()
  return {...actual, ux: {...actual.ux, action: {start: vi.fn(), stop: vi.fn()}}}
})

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

// Column widths now stretch to fill the terminal (see list.ts), so their exact character count
// varies with the test environment's fallback width; trimming per cell instead of asserting a
// fixed-width block keeps these tests independent of that.
function rowCells(line: string): string[] {
  return line
    .split('│')
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function tableRows(logs: ReturnType<typeof silenceLogs>): string[] {
  const table = logs.log.mock.calls.map((call) => call[0] as string).find((line) => line.includes('┌'))
  return table!.split('\n').filter((line) => line.includes('│'))
}

describe('option list', () => {
  beforeEach(() => {
    vi.mocked(ux.action.start).mockClear()
    vi.mocked(ux.action.stop).mockClear()
  })

  it('fetches the options endpoint and renders name/autoload/core/source/plugin as a bordered table, never the value', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([
      {autoload: 'yes', confirmed: false, core: true, guess: null, name: 'blogname', pluginName: null},
      {autoload: 'no', confirmed: false, core: false, guess: null, name: 'wpseo_titles', pluginName: null},
      {
        autoload: 'auto',
        confirmed: false,
        core: false,
        guess: 'code-snippets',
        name: 'code_snippets_settings',
        pluginName: 'Code Snippets',
      },
      {autoload: 'auto', confirmed: true, core: false, guess: 'rank-math', name: 'rank_math_version', pluginName: 'Rank Math SEO'},
    ])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/options')
    expect(logs.log).toHaveBeenCalledWith('Found 4 options:\n')

    const [header, blognameRow, wpseoRow, codeSnippetsRow, rankMathRow] = tableRows(logs)
    expect(rowCells(header)).toEqual(['NAME', 'AUTOLOAD', 'CORE', 'SOURCE?', 'PLUGIN'])
    expect(rowCells(blognameRow)).toEqual(['blogname', 'yes', 'yes', '', ''])
    expect(rowCells(wpseoRow)).toEqual(['wpseo_titles', 'no', '', '', ''])
    // Unconfirmed guess keeps the "?"; a confirmed one (rank-math, from the always-on scan) drops
    // it, a visible confidence difference the user asked for. PLUGIN is just a label for whichever
    // slug SOURCE? shows, no "?" of its own either way.
    expect(rowCells(codeSnippetsRow)).toEqual(['code_snippets_settings', 'auto', '', 'code-snippets?', 'Code Snippets'])
    expect(rowCells(rankMathRow)).toEqual(['rank_math_version', 'auto', '', 'rank-math', 'Rank Math SEO'])
  })

  it('prints a legend explaining confirmed/guessed before the table, including CORE unless --no-core', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi
      .fn()
      .mockResolvedValueOnce([{autoload: 'yes', confirmed: false, core: true, guess: null, name: 'blogname', pluginName: null}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('■ confirmed   ■ guessed, unconfirmed (?)   ■ WordPress core')
  })

  it('omits the CORE swatch from the legend under --no-core', async () => {
    const {cmd, logs} = makeCmd(['--no-core'])
    const get = vi
      .fn()
      .mockResolvedValueOnce([{autoload: 'auto', confirmed: false, core: false, guess: null, name: 'my_plugin_setting', pluginName: null}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('■ confirmed   ■ guessed, unconfirmed (?)')
  })

  it('shows a spinner while fetching, and stops it even if the request fails', async () => {
    const {cmd} = makeCmd([])
    const get = vi.fn().mockRejectedValueOnce(new Error('boom'))
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await expect(cmd.run()).rejects.toThrow('boom')

    expect(ux.action.start).toHaveBeenCalledWith('Fetching and verifying options')
    expect(ux.action.stop).toHaveBeenCalledOnce()
  })

  // Found live against a real site: a plugin (WPForms) writes filesystem paths into an option
  // name, ~140 chars, which would otherwise stretch the whole NAME column to match that outlier.
  it('truncates a pathologically long name so it does not blow up the column width', async () => {
    const {cmd, logs} = makeCmd([])
    const longName = `_wpforms_transient_wpforms_${'/segment'.repeat(15)}`
    const get = vi
      .fn()
      .mockResolvedValueOnce([{autoload: 'on', confirmed: false, core: false, guess: null, name: longName, pluginName: null}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const [, dataRow] = tableRows(logs)
    const nameCell = rowCells(dataRow)[0]
    expect(nameCell.endsWith('…')).toBe(true)
    expect(nameCell.length).toBeLessThan(longName.length)
  })

  // Piped/redirected output (and this test itself) has no real TTY: without the $COLUMNS
  // fallback the command adds, tty-table assumes an 80-column terminal and wraps every cell of
  // a table this wide into broken multi-line rows instead of rendering it on one line each.
  it('does not wrap rows onto multiple lines when there is no real terminal width available', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi
      .fn()
      .mockResolvedValueOnce([{autoload: 'yes', confirmed: false, core: false, guess: null, name: 'blogname', pluginName: null}])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    const table = logs.log.mock.calls.map((call) => call[0] as string).find((line) => line.includes('blogname'))
    const dataRows = table!.split('\n').filter((line) => line.includes('│'))
    // One header row and one data row: a wrapped cell would split either into two lines instead.
    expect(dataRows).toHaveLength(2)
  })

  it('--no-core hides core rows and the CORE column from both the table and the returned/--json result', async () => {
    const {cmd, logs} = makeCmd(['--no-core'])
    const options = [
      {autoload: 'yes', confirmed: false, core: true, guess: null, name: 'blogname', pluginName: null},
      {autoload: 'auto', confirmed: false, core: false, guess: null, name: 'my_plugin_setting', pluginName: null},
    ]
    const get = vi.fn().mockResolvedValueOnce(options)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual([options[1]])
    const table = logs.log.mock.calls.map((call) => call[0] as string).find((line) => line.includes('NAME'))
    expect(table).not.toContain('blogname')
    expect(table).toContain('my_plugin_setting')
    expect(table).not.toContain('CORE')
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
    const names = [{autoload: 'yes', confirmed: false, core: true, guess: null, name: 'blogname', pluginName: null}]
    const get = vi.fn().mockResolvedValueOnce(names)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual(names)
  })
})
