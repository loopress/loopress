import {confirm, input, select} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Init from '../../src/commands/init.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {readLocalConfig, writeLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeListedProject} from '../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}))

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
  writeLocalConfig: vi.fn(),
}))

function make(): Init {
  return new Init([], fakeOclifConfig)
}

describe('init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(configManager, 'listProjects').mockReturnValue([makeListedProject('id-acme', 'acme', {})])
  })

  it('runs `plugin:add` for the chosen snippet provider and reports its resolved version', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValueOnce({})
    vi.mocked(readLocalConfig).mockResolvedValueOnce({plugins: {'code-snippets': '3.6.6'}})

    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('code-snippets')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('plugin:add', ['code-snippets'])
    expect(log).toHaveBeenCalledWith('  Plugin:   code-snippets@3.6.6')
  })

  it('does not run plugin:add when the user has no snippet provider to configure', async () => {
    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
  })

  it('warns and continues when `plugin:add` fails', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('Plugin "insert-headers-and-footers" not found on WordPress.org.'))

    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('insert-headers-and-footers')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    const {log, warn} = silenceLogs(cmd)
    await cmd.run()

    expect(warn).toHaveBeenCalledWith('Plugin "insert-headers-and-footers" not found on WordPress.org.')
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Plugin:'))
  })

  it('aborts without prompting further when the user declines to overwrite an existing config', async () => {
    const {existsSync} = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(confirm).mockResolvedValueOnce(false)

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('Aborted.')
    expect(select).not.toHaveBeenCalled()
    expect(writeLocalConfig).not.toHaveBeenCalled()
  })
})
