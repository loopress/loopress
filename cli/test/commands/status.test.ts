import {beforeEach, describe, expect, it, vi} from 'vitest'

import Status from '../../src/commands/status.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../helpers/project-fixtures.js'

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

function make(argv: string[] = []): Status {
  return new Status(argv, fakeOclifConfig)
}

// `pinned`: the project comes from loopress.json, otherwise it's the globally active one.
function useProject(environments: Record<string, EnvironmentConfig>, {pinned = false} = {}): void {
  const project = makeListedProject('id-acme', 'acme', environments, !pinned)
  vi.mocked(readLocalConfig).mockResolvedValue(pinned ? {projectId: 'id-acme'} : {})
  vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(pinned ? null : project)
  vi.spyOn(configManager, 'getProject').mockReturnValue(project)
}

const NO_PROJECT = 'No project configured. Run `lps project config` first.'

describe('status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports when no project is active at all', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({})
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)

    const cmd = make()
    const {log} = silenceLogs(cmd)
    const result = await cmd.run()

    expect(log).toHaveBeenCalledWith(NO_PROJECT)
    expect(result).toMatchObject({note: NO_PROJECT})
  })

  it('reports the only environment of the globally active project', async () => {
    useProject({production: makeEnv('production', 'https://acme.com')})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    const result = await cmd.run()

    expect(log).toHaveBeenCalledWith('Project:  acme (production)')
    expect(log).toHaveBeenCalledWith('URL:      https://acme.com')
    expect(log).toHaveBeenCalledWith('Config dir: /fake/config')
    expect(log).toHaveBeenCalledWith('Data dir:   /fake/data')
    expect(result).toEqual({
      configDir: '/fake/config',
      dataDir: '/fake/data',
      environment: 'production',
      project: 'acme (production)',
      url: 'https://acme.com',
    })
  })

  it('reports when the pinned project no longer exists', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'ghost'})
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)

    const cmd = make()
    const {log} = silenceLogs(cmd)
    const result = await cmd.run()

    expect(log).toHaveBeenCalledWith('loopress.json pins project "ghost", but it no longer exists.')
    expect(log).toHaveBeenCalledWith('Run `lps project config` to configure it.')
    expect(result).toMatchObject({
      note: 'loopress.json pins project "ghost", but it no longer exists. Run `lps project config` to configure it.',
    })
  })

  it('reports when the project has no environments', async () => {
    useProject({}, {pinned: true})

    const cmd = make()
    const {log} = silenceLogs(cmd)
    const result = await cmd.run()

    expect(log).toHaveBeenCalledWith('Project:  acme')
    expect(log).toHaveBeenCalledWith('No environments configured for this project. Run `lps project config` to add one.')
    expect(result).toMatchObject({
      note: 'No environments configured for this project. Run `lps project config` to add one.',
      project: 'acme',
    })
  })

  it('reports the local environment of a multi-environment project', async () => {
    useProject(
      {local: makeEnv('local', 'https://acme.local'), production: makeEnv('production', 'https://acme.com')},
      {pinned: true},
    )

    const cmd = make()
    const {log} = silenceLogs(cmd)
    const result = await cmd.run()

    expect(log).toHaveBeenCalledWith('Project:  acme (local)')
    expect(result).toMatchObject({environment: 'local', project: 'acme (local)', url: 'https://acme.local'})
  })

  it('warns when several environments and no local one leave no default', async () => {
    useProject({production: makeEnv('production'), staging: makeEnv('staging')}, {pinned: true})

    const cmd = make()
    const {log, warn} = silenceLogs(cmd)
    const result = await cmd.run()

    const note = '"acme" has no "local" environment, pass --env to pick one.'
    expect(log).toHaveBeenCalledWith('Project:  acme (no default environment)')
    expect(log).toHaveBeenCalledWith('Environments: production, staging')
    expect(warn).toHaveBeenCalledWith(note)
    expect(result).toMatchObject({environments: ['production', 'staging'], note, project: 'acme'})
    expect(result).not.toHaveProperty('environment')
  })

  describe('--env', () => {
    it('shows the environment --env would target, beating the local default', async () => {
      useProject({local: makeEnv('local', 'https://acme.local'), staging: makeEnv('staging', 'https://staging.acme.com')})

      const cmd = make(['--env', 'staging'])
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (staging, via --env)')
      expect(log).toHaveBeenCalledWith('URL:      https://staging.acme.com')
      expect(result).toMatchObject({environment: 'staging', project: 'acme (staging, via --env)', url: 'https://staging.acme.com'})
    })

    it('resolves --env within the project pinned by loopress.json', async () => {
      useProject({staging: makeEnv('staging', 'https://staging.acme.com')}, {pinned: true})

      const cmd = make(['--env', 'staging'])
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (staging, via --env)')
      expect(result).toMatchObject({environment: 'staging', project: 'acme (staging, via --env)', url: 'https://staging.acme.com'})
    })

    it('reports "no project configured" for --env when no project can be resolved', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)

      const cmd = make(['--env', 'staging'])
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith(NO_PROJECT)
      expect(result).toMatchObject({note: NO_PROJECT})
    })

    it('errors listing the available environments when --env names an unknown one', async () => {
      useProject({production: makeEnv('production'), staging: makeEnv('staging')})

      const cmd = make(['--env', 'nope'])
      silenceLogs(cmd)

      await expect(cmd.run()).rejects.toThrow(
        /Environment "nope" not found in project "acme"\. Available: production, staging/,
      )
    })
  })
})
