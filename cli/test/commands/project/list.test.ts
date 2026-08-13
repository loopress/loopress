import {beforeEach, describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/project/list.js'
import {configManager} from '../../../src/config/project-config.manager.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

function make() {
  const cmd = new List([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

function joinedOutput(logs: {log: {mock: {calls: unknown[][]}}}): string {
  return logs.log.mock.calls.map(([line]) => line).join('\n')
}

// Matches logEnvironment's `  ${marker} ${name.padEnd(15)} ${url}${arrow}` format exactly,
// so tests don't have to hand-count padding spaces.
function envLine(marker: '·', name: string, url: string, arrow = ''): string {
  return `  ${marker} ${name.padEnd(15)} ${url}${arrow}`
}

describe('project list', () => {
  beforeEach(() => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([])
  })

  it('prints a message and never lists environments when there are no projects', async () => {
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('No projects configured. Run `lps project config` first.')
    expect(configManager.listEnvironments).not.toHaveBeenCalled()
  })

  it('lists a project and its environment with the site url', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {addedAt: '2024-01-01', environments: {}, id: 'acme', isCurrent: false, name: 'Acme'},
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {addedAt: '2024-01-01', isCurrent: false, name: 'production', token: 't', url: 'https://acme.test'},
    ])
    const {cmd, logs} = make()

    await cmd.run()

    // Exact match (not toContain): the marker glyph, padding, and separator are all part of
    // the contract, not just the substrings we happen to check.
    expect(logs.log).toHaveBeenCalledWith('○ Acme')
    expect(logs.log).toHaveBeenCalledWith(envLine('·', 'production', 'https://acme.test'))
    expect(logs.log).toHaveBeenCalledWith('')
    expect(configManager.listEnvironments).toHaveBeenCalledWith('acme')
  })

  it('marks the current project with the [current] tag', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {addedAt: '2024-01-01', environments: {}, id: 'acme', isCurrent: true, name: 'Acme'},
    ])
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('● Acme [current]')
  })

  it('does not add the [current] tag for a non-current project', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {addedAt: '2024-01-01', environments: {}, id: 'acme', isCurrent: false, name: 'Acme'},
    ])
    const {cmd, logs} = make()

    await cmd.run()

    expect(joinedOutput(logs)).not.toContain('[current]')
    expect(logs.log).toHaveBeenCalledWith('○ Acme')
  })

  it('marks the current environment with an arrow', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {addedAt: '2024-01-01', environments: {}, id: 'acme', isCurrent: false, name: 'Acme'},
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {addedAt: '2024-01-01', isCurrent: true, name: 'production', token: 't', url: 'https://acme.test'},
    ])
    const {cmd, logs} = make()

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith(envLine('·', 'production', 'https://acme.test', ' ←'))
  })

  it('does not add the arrow for a non-current environment', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {addedAt: '2024-01-01', environments: {}, id: 'acme', isCurrent: false, name: 'Acme'},
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {addedAt: '2024-01-01', isCurrent: false, name: 'production', token: 't', url: 'https://acme.test'},
    ])
    const {cmd, logs} = make()

    await cmd.run()

    expect(joinedOutput(logs)).not.toContain('←')
    expect(logs.log).toHaveBeenCalledWith(envLine('·', 'production', 'https://acme.test'))
  })

  it('lists every environment for a project with several', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {addedAt: '2024-01-01', environments: {}, id: 'acme', isCurrent: false, name: 'Acme'},
    ])
    vi.spyOn(configManager, 'listEnvironments').mockReturnValue([
      {addedAt: '2024-01-01', isCurrent: false, name: 'staging', token: 't', url: 'https://staging.acme.test'},
      {addedAt: '2024-01-01', isCurrent: false, name: 'production', token: 't', url: 'https://acme.test'},
    ])
    const {cmd, logs} = make()

    await cmd.run()

    const output = joinedOutput(logs)
    expect(output).toContain('staging.acme.test')
    expect(output).toContain('https://acme.test')
  })

  it('prints one entry per project when there are several', async () => {
    vi.spyOn(configManager, 'listProjects').mockReturnValue([
      {addedAt: '2024-01-01', environments: {}, id: 'acme', isCurrent: false, name: 'Acme'},
      {addedAt: '2024-01-01', environments: {}, id: 'globex', isCurrent: false, name: 'Globex'},
    ])
    const {cmd, logs} = make()

    await cmd.run()

    const output = joinedOutput(logs)
    expect(output).toContain('Acme')
    expect(output).toContain('Globex')
    expect(configManager.listEnvironments).toHaveBeenCalledWith('acme')
    expect(configManager.listEnvironments).toHaveBeenCalledWith('globex')
  })
})
