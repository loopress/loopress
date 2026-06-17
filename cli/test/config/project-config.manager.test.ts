import {expect} from 'chai'
import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {ProjectConfigManager} from '../../src/config/project-config.manager.js'
import {EnvironmentConfig, ProjectConfig} from '../../src/config/types.js'

const makeEnv = (name: string, url = 'https://example.com'): EnvironmentConfig => ({
  name,
  url,
  token: `user:secret`,
  addedAt: '2024-01-01T00:00:00.000Z',
})

const makeProject = (name: string, envName = 'production'): ProjectConfig => ({
  name,
  currentEnv: envName,
  environments: {[envName]: makeEnv(envName)},
  addedAt: '2024-01-01T00:00:00.000Z',
})

describe('ProjectConfigManager', () => {
  let tmpDir: string
  let manager: ProjectConfigManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wdx-test-'))
    manager = new ProjectConfigManager(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, {recursive: true, force: true})
  })

  describe('readConfig', () => {
    it('returns empty config when file does not exist', () => {
      const config = manager.readConfig()
      expect(config.currentProject).to.be.null
      expect(config.projects).to.deep.equal({})
    })
  })

  describe('setProject / getProject', () => {
    it('stores and retrieves a project', () => {
      const project = makeProject('acme')
      manager.setProject('acme', project)
      expect(manager.getProject('acme')).to.deep.equal(project)
    })

    it('sets the first project as current automatically', () => {
      manager.setProject('acme', makeProject('acme'))
      expect(manager.readConfig().currentProject).to.equal('acme')
    })

    it('does not change current when a second project is added', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      expect(manager.readConfig().currentProject).to.equal('acme')
    })

    it('returns null for an unknown project', () => {
      expect(manager.getProject('unknown')).to.be.null
    })
  })

  describe('getCurrentProject', () => {
    it('returns null when no projects are configured', () => {
      expect(manager.getCurrentProject()).to.be.null
    })

    it('returns the current project', () => {
      const project = makeProject('acme')
      manager.setProject('acme', project)
      expect(manager.getCurrentProject()).to.deep.equal(project)
    })
  })

  describe('setCurrentProject', () => {
    it('updates the current project', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      manager.setCurrentProject('beta')
      expect(manager.getCurrentProject()?.name).to.equal('beta')
    })
  })

  describe('removeProject', () => {
    it('removes the project and falls back to first remaining', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      manager.setCurrentProject('acme')
      manager.removeProject('acme')
      expect(manager.getProject('acme')).to.be.null
      expect(manager.readConfig().currentProject).to.equal('beta')
    })

    it('sets currentProject to null when last project is removed', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.removeProject('acme')
      expect(manager.readConfig().currentProject).to.be.null
    })
  })

  describe('listProjects', () => {
    it('returns empty array when no projects configured', () => {
      expect(manager.listProjects()).to.deep.equal([])
    })

    it('marks the current project with isCurrent: true', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      const list = manager.listProjects()
      expect(list.find((p) => p.name === 'acme')?.isCurrent).to.be.true
      expect(list.find((p) => p.name === 'beta')?.isCurrent).to.be.false
    })
  })

  describe('setEnvironment / getEnvironment', () => {
    it('adds an environment to an existing project', () => {
      manager.setProject('acme', makeProject('acme'))
      const staging = makeEnv('staging', 'https://staging.acme.com')
      manager.setEnvironment('acme', 'staging', staging)
      expect(manager.getEnvironment('acme', 'staging')).to.deep.equal(staging)
    })

    it('does nothing when the project does not exist', () => {
      manager.setEnvironment('ghost', 'staging', makeEnv('staging'))
      expect(manager.getProject('ghost')).to.be.null
    })

    it('sets the first environment as currentEnv automatically on a fresh project', () => {
      const project: ProjectConfig = {
        name: 'acme',
        currentEnv: null,
        environments: {},
        addedAt: '2024-01-01T00:00:00.000Z',
      }
      manager.setProject('acme', project)
      manager.setEnvironment('acme', 'production', makeEnv('production'))
      expect(manager.getProject('acme')?.currentEnv).to.equal('production')
    })
  })

  describe('getCurrentEnv', () => {
    it('returns null when no project is configured', () => {
      expect(manager.getCurrentEnv()).to.be.null
    })

    it('returns the current environment of the current project', () => {
      const project = makeProject('acme', 'production')
      manager.setProject('acme', project)
      const env = manager.getCurrentEnv()
      expect(env?.name).to.equal('production')
    })
  })

  describe('setCurrentEnv', () => {
    it('updates the active environment within a project', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.setEnvironment('acme', 'staging', makeEnv('staging'))
      manager.setCurrentEnv('acme', 'staging')
      expect(manager.getCurrentEnv()?.name).to.equal('staging')
    })
  })

  describe('removeEnvironment', () => {
    it('removes the environment and falls back to first remaining', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.setEnvironment('acme', 'staging', makeEnv('staging'))
      manager.setCurrentEnv('acme', 'production')
      manager.removeEnvironment('acme', 'production')
      expect(manager.getEnvironment('acme', 'production')).to.be.null
      expect(manager.getProject('acme')?.currentEnv).to.equal('staging')
    })

    it('sets currentEnv to null when last environment is removed', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.removeEnvironment('acme', 'production')
      expect(manager.getProject('acme')?.currentEnv).to.be.null
    })
  })

  describe('listEnvironments', () => {
    it('returns empty array for unknown project', () => {
      expect(manager.listEnvironments('ghost')).to.deep.equal([])
    })

    it('marks the current environment with isCurrent: true', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.setEnvironment('acme', 'staging', makeEnv('staging'))
      const list = manager.listEnvironments('acme')
      expect(list.find((e) => e.name === 'production')?.isCurrent).to.be.true
      expect(list.find((e) => e.name === 'staging')?.isCurrent).to.be.false
    })
  })

  describe('writeConfig (atomic write)', () => {
    it('survives a second write without corrupting the file', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      manager.setCurrentProject('beta')
      const config = manager.readConfig()
      expect(config.currentProject).to.equal('beta')
      expect(Object.keys(config.projects)).to.have.length(2)
    })

    it('persists config.json at the expected path', () => {
      manager.setProject('acme', makeProject('acme'))
      expect(manager.getConfigFilePath()).to.equal(join(tmpDir, '.wdx', 'config.json'))
      expect(existsSync(manager.getConfigFilePath())).to.be.true
    })
  })
})
