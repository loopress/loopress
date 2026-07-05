import {confirm, input, select} from '@inquirer/prompts'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
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
    vi.mocked(existsSync).mockReturnValue(false)
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

    expect(confirm).toHaveBeenCalledWith({default: false, message: 'loopress.json already exists. Overwrite?'})
    expect(log).toHaveBeenCalledWith('Aborted.')
    expect(select).not.toHaveBeenCalled()
    expect(writeLocalConfig).not.toHaveBeenCalled()
  })

  it('proceeds with the prompts when the user confirms the overwrite', async () => {
    const {existsSync} = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(confirm).mockResolvedValueOnce(true)
    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).not.toHaveBeenCalledWith('Aborted.')
    expect(writeLocalConfig).toHaveBeenCalled()
  })

  it('offers configured projects plus a manual-entry option, and reports the chosen project label', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      makeListedProject('id-acme', 'acme', {}),
      makeListedProject('id-beta', 'beta', {}),
    ])
    vi.mocked(select).mockResolvedValueOnce('id-beta').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'acme', value: 'id-acme'},
        {name: 'beta', value: 'id-beta'},
        {name: 'Enter a project ID manually', value: '__manual__'},
      ],
      message: 'WordPress project',
    })
    expect(log).toHaveBeenCalledWith('  Project:  beta')
  })

  it('prompts for a manual project ID when the user picks the manual-entry option', async () => {
    vi.mocked(select).mockResolvedValueOnce('__manual__').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('manual-id').mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('  Project:  manual-id')
  })

  it('rejects an empty manual project ID and accepts a non-empty one', async () => {
    vi.mocked(select).mockResolvedValueOnce('__manual__').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('manual-id').mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    const projectIdCall = vi.mocked(input).mock.calls[0][0] as {validate: (value: string) => string | true}
    expect(projectIdCall.validate('   ')).toBe('Project ID cannot be empty')
    expect(projectIdCall.validate('manual-id')).toBe(true)
  })

  it('goes straight to manual entry and logs a hint when no projects are configured', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.mocked(input).mockResolvedValueOnce('manual-id').mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')
    vi.mocked(select).mockResolvedValueOnce('__none__')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(select).not.toHaveBeenCalledWith(expect.objectContaining({message: 'WordPress project'}))
    expect(log).toHaveBeenCalledWith('No projects configured yet. Run `lps project config` to add one first.')
    expect(log).toHaveBeenCalledWith('  Project:  manual-id')

    const projectIdCall = vi.mocked(input).mock.calls[0][0] as {validate: (value: string) => string | true}
    expect(projectIdCall.message).toBe('Project ID')
    expect(projectIdCall.validate('   ')).toBe('Project ID cannot be empty')
    expect(projectIdCall.validate('manual-id')).toBe(true)
  })

  it('prompts for root and snippets directories with their defaults, and reports the resolved snippets path', async () => {
    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('./wp-content').mockResolvedValueOnce('my-snippets')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(input).toHaveBeenCalledWith({default: '.', message: 'Root directory'})
    expect(input).toHaveBeenCalledWith({default: 'snippets', message: 'Snippets directory (relative to root)'})
    expect(log).toHaveBeenCalledWith(`  Snippets: ${join('./wp-content', 'my-snippets')}`)
  })

  it('offers the snippet providers plus a none option', async () => {
    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    silenceLogs(cmd)
    await cmd.run()

    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'Code Snippets', value: 'code-snippets'},
        {name: 'WPCode', value: 'insert-headers-and-footers'},
        {name: 'None / already installed', value: '__none__'},
      ],
      message: 'Snippet provider',
    })
  })

  it('does not log a Plugin line when plugin:add succeeds but reports no version', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValueOnce({})
    vi.mocked(readLocalConfig).mockResolvedValueOnce({})

    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('code-snippets')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    const {log, warn} = silenceLogs(cmd)
    await cmd.run()

    expect(warn).not.toHaveBeenCalled()

    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Plugin:'))
  })

  it('prints the full success banner', async () => {
    vi.mocked(select).mockResolvedValueOnce('id-acme').mockResolvedValueOnce('__none__')
    vi.mocked(input).mockResolvedValueOnce('.').mockResolvedValueOnce('snippets')

    const cmd = make()
    const {log} = silenceLogs(cmd)
    await cmd.run()

    expect(log).toHaveBeenCalledWith('\n✓ loopress.json created')
    expect(log).toHaveBeenCalledWith('  Project:  acme')
    expect(log).toHaveBeenCalledWith('  Snippets: snippets')
    expect(writeLocalConfig).toHaveBeenCalledWith({projectId: 'id-acme', rootDir: '.', snippetsDir: 'snippets'})
  })
})
