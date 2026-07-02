import {beforeEach, describe, expect, it, vi} from 'vitest'

import Status from '../../src/commands/status.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../helpers/project-fixtures.js'

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

function make(): Status {
  return new Status([], fakeOclifConfig)
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
      await cmd.run()

      expect(log).toHaveBeenCalledWith('No project configured. Run `lps project config` first.')
    })

    it('reports the globally active project and environment', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({})
      vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production', 'https://acme.com'))
      vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(makeListedProject('id-acme', 'acme', {}, true))

      const cmd = make()
      const {log} = silenceLogs(cmd)
      await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (production)')
      expect(log).toHaveBeenCalledWith('URL:      https://acme.com')
    })
  })

  describe('projectId pinned in loopress.json', () => {
    it('reports when the pinned project no longer exists', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'ghost'})
      vi.spyOn(configManager, 'getProject').mockReturnValue(null)

      const cmd = make()
      const {log} = silenceLogs(cmd)
      await cmd.run()

      expect(log).toHaveBeenCalledWith('loopress.json pins project "ghost", but it no longer exists.')
    })

    it('reports when the pinned project has no environments', async () => {
      vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
      vi.spyOn(configManager, 'getProject').mockReturnValue({addedAt: '2024-01-01', environments: {}, name: 'acme'})

      const cmd = make()
      const {log} = silenceLogs(cmd)
      await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme')
      expect(log).toHaveBeenCalledWith('No environments configured for this project. Run `lps project config` to add one.')
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
      await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (production)')
      expect(log).toHaveBeenCalledWith('URL:      https://acme.com')
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
      await cmd.run()

      expect(log).toHaveBeenCalledWith('Project:  acme (staging)')
      expect(log).toHaveBeenCalledWith('URL:      https://staging.acme.com')
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
      await cmd.run()

      expect(warn).toHaveBeenCalledWith(`"acme" has multiple environments and isn't the globally active project.`)
      expect(log).toHaveBeenCalledWith('(Globally active project right now: "beta")')
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
})
