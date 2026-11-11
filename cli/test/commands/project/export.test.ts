import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Export from '../../../src/commands/project/export.js'
import {configManager, ProjectConfigManager} from '../../../src/config/project-config.manager.js'
import {type LoopressConfig} from '../../../src/types/config.js'
import {fakeOclifConfig} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('../../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn().mockResolvedValue({projectId: 'acme'}),
}))

const full: LoopressConfig = {
  currentProject: {id: 'acme'},
  projects: {
    acme: {
      addedAt: '2024-01-01T00:00:00.000Z',
      environments: {
        local: makeEnv('local', 'https://acme.test'),
        production: makeEnv('production', 'https://acme.com', 'admin:prod-secret'),
        staging: makeEnv('staging', 'https://staging.acme.com', 'admin:staging-secret'),
      },
      name: 'Acme',
    },
    other: {
      addedAt: '2024-01-01T00:00:00.000Z',
      environments: {production: makeEnv('production', 'https://other.com', 'admin:other-secret')},
      name: 'Other',
    },
  },
  telemetry: {disabled: true},
}

describe('project export', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-export-'))
    writeFileSync(join(dir, 'config.json'), JSON.stringify(full))
    vi.spyOn(configManager, 'readConfig').mockImplementation(() => new ProjectConfigManager(dir).readConfig())
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  async function exported(argv: string[]): Promise<string> {
    let out = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out += String(chunk)
      return true
    })
    const cmd = new Export(argv, fakeOclifConfig)
    await cmd.init()
    await cmd.run()
    return out
  }

  it('prints exactly one project and one environment, nothing else', async () => {
    const out = JSON.parse(await exported(['--env', 'staging'])) as LoopressConfig

    expect(out).toEqual({
      currentProject: {id: 'acme'},
      projects: {acme: {addedAt: '2024-01-01T00:00:00.000Z', environments: {staging: full.projects.acme?.environments.staging}, name: 'Acme'}},
    })
  })

  it('writes a file the config manager reads back as that one environment', async () => {
    const out = await exported(['--env', 'production'])
    const fresh = mkdtempSync(join(tmpdir(), 'lps-export-fresh-'))
    try {
      writeFileSync(join(fresh, 'config.json'), out)
      const manager = new ProjectConfigManager(fresh)
      expect(manager.getEnvironment('acme', 'production')?.url).toBe('https://acme.com')
      expect(manager.getEnvironment('acme', 'staging')).toBeNull()
      expect(manager.getProject('other')).toBeNull()
      expect(readFileSync(join(fresh, 'config.json'), 'utf8')).not.toContain('secret-other')
    } finally {
      rmSync(fresh, {force: true, recursive: true})
    }
  })

  it('errors with the list of environments for an unknown one', async () => {
    await expect(exported(['--env', 'nope'])).rejects.toThrow(/Available: local, production, staging/)
  })

  it('requires --env', async () => {
    await expect(exported([])).rejects.toThrow(/Pass --env/)
  })
})
