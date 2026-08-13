import {beforeEach, describe, expect, it, vi} from 'vitest'

import Status from '../../src/commands/status.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../helpers/project-fixtures.js'

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

function make(argv: string[] = []): Status {
  return new Status(argv, fakeOclifConfig)
}

describe('status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('no projectId pinned in loopress.json', () => {
    it('reports when no project is active at all', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(null)

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('No project configured. Run `lps project config` first.')
      expect(result).toMatchObject({note: 'No project configured. Run `lps project config` first.'})
    })

    it('reports "no project configured" when an environment is active but its project cannot be resolved', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production', 'https://acme.com'))
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('No project configured. Run `lps project config` first.')
      expect(result).toMatchObject({note: 'No project configured. Run `lps project config` first.'})
    })

    it('reports the globally active project and environment', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production', 'https://acme.com'))
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(makeListedProject('id-acme', 'acme', {}, true))

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (production)')
      expect(log).toHaveBeenCalledWith('URL:      https://acme.com')
      expect(log).toHaveBeenCalledWith('')
      expect(log).toHaveBeenCalledWith('Config dir: /fake/config')
      expect(log).toHaveBeenCalledWith('Data dir:   /fake/data')
      expect(result).toEqual({
        configDir: '/fake/config',
        dataDir: '/fake/data',
        project: 'acme (production)',
        url: 'https://acme.com',
      })
    })
  })

  describe('projectId pinned in loopress.json', () => {
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

    it('reports when the pinned project has no environments', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      vi.spyOn(configManager, 'getProject').mockReturnValue({addedAt: '2024-01-01', environments: {}, name: 'acme'})

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

    it('reports the single environment directly when unambiguous', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      vi.spyOn(configManager, 'getProject').mockReturnValue({
        addedAt: '2024-01-01',
        environments: {production: makeEnv('production', 'https://acme.com')},
        name: 'acme',
      })

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (production)')
      expect(log).toHaveBeenCalledWith('URL:      https://acme.com')
      expect(result).toMatchObject({project: 'acme (production)', url: 'https://acme.com'})
    })

    it('reports the active environment when the pinned project matches the globally active one', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      const project = {
        addedAt: '2024-01-01',
        environments: {
          production: makeEnv('production', 'https://acme.com'),
          staging: makeEnv('staging', 'https://staging.acme.com'),
        },
        name: 'acme',
      }
      vi.spyOn(configManager, 'getProject').mockReturnValue(project)
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue({...project, id: 'id-acme', isCurrent: true})
      vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('staging', 'https://staging.acme.com'))

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (staging)')
      expect(log).toHaveBeenCalledWith('URL:      https://staging.acme.com')
      expect(result).toMatchObject({project: 'acme (staging)', url: 'https://staging.acme.com'})
    })

    it('does not read the globally active environment when the pinned project is not the globally active one', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      vi.spyOn(configManager, 'getProject').mockReturnValue({
        addedAt: '2024-01-01',
        environments: {
          production: makeEnv('production', 'https://acme.com'),
          staging: makeEnv('staging', 'https://staging.acme.com'),
        },
        name: 'acme',
      })
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(makeListedProject('id-beta', 'beta', {}, true))
      // getCurrentEnv would return a real environment if it were called, but the pinned project
      // ("id-acme") isn't the globally active one ("id-beta"), so it must never be consulted:
      // the command should still treat this as ambiguous rather than adopting this environment.
      const getCurrentEnv = vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production', 'https://acme.com'))

      const cmd = make()
      const {warn} = silenceLogs(cmd)
      await cmd.run()

      expect(getCurrentEnv).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(`"acme" has multiple environments and isn't the globally active project.`)
    })

    it('warns when the pinned project has multiple environments and is not the globally active one', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      vi.spyOn(configManager, 'getProject').mockReturnValue({
        addedAt: '2024-01-01',
        environments: {
          production: makeEnv('production', 'https://acme.com'),
          staging: makeEnv('staging', 'https://staging.acme.com'),
        },
        name: 'acme',
      })
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(makeListedProject('id-beta', 'beta', {}, true))

      const cmd = make()
      const {log, warn} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith(`Project:  acme (ambiguous)`)
      expect(log).toHaveBeenCalledWith('Environments: production, staging')
      // Blank separator logged once by run() itself and once by the ambiguous branch.
      expect(log.mock.calls.filter(([arg]) => arg === '')).toHaveLength(2)
      expect(warn).toHaveBeenCalledWith(`"acme" has multiple environments and isn't the globally active project.`)
      expect(log).toHaveBeenCalledWith('Run `lps project switch` to pick one before running commands here.')
      expect(log).toHaveBeenCalledWith('(Globally active project right now: "beta")')
      expect(result).toMatchObject({
        environments: ['production', 'staging'],
        note: `"acme" has multiple environments and isn't the globally active project. Run \`lps project switch\` to pick one.`,
        project: 'acme',
      })
    })

    it('warns without a "globally active project" line when nothing is active at all', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      vi.spyOn(configManager, 'getProject').mockReturnValue({
        addedAt: '2024-01-01',
        environments: {
          production: makeEnv('production', 'https://acme.com'),
          staging: makeEnv('staging', 'https://staging.acme.com'),
        },
        name: 'acme',
      })
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)

      const cmd = make()
      const {log} = silenceLogs(cmd)
      await cmd.run()

      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Globally active project right now'))
    })
  })

  describe('--env', () => {
    it('shows the environment --env would target, beating the active one', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(
        makeListedProject(
          'id-acme',
          'acme',
          {
            production: makeEnv('production', 'https://acme.com'),
            staging: makeEnv('staging', 'https://staging.acme.com'),
          },
          true,
        ),
      )

      const cmd = make(['--env', 'staging'])
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (staging, via --env)')
      expect(log).toHaveBeenCalledWith('URL:      https://staging.acme.com')
      expect(result).toMatchObject({project: 'acme (staging, via --env)', url: 'https://staging.acme.com'})
    })

    it('resolves --env within the project pinned by loopress.json', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      vi.spyOn(configManager, 'getProject').mockReturnValue({
        addedAt: '2024-01-01',
        environments: {staging: makeEnv('staging', 'https://staging.acme.com')},
        name: 'acme',
      })

      const cmd = make(['--env', 'staging'])
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (staging, via --env)')
      expect(result).toMatchObject({project: 'acme (staging, via --env)', url: 'https://staging.acme.com'})
    })

    it('reports "no project configured" for --env when no project can be resolved', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)

      const cmd = make(['--env', 'staging'])
      const {log} = silenceLogs(cmd)
      const result = await cmd.run()

      expect(log).toHaveBeenCalledWith('No project configured. Run `lps project config` first.')
      expect(result).toMatchObject({note: 'No project configured. Run `lps project config` first.'})
    })

    it('errors listing the available environments when --env names an unknown one', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(
        makeListedProject(
          'id-acme',
          'acme',
          {production: makeEnv('production'), staging: makeEnv('staging')},
          true,
        ),
      )

      const cmd = make(['--env', 'nope'])
      silenceLogs(cmd)

      await expect(cmd.run()).rejects.toThrow(
        /Environment "nope" not found in project "acme"\. Available: production, staging/,
      )
    })
  })
})
