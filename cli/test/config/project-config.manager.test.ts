import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {ProjectConfigManager} from '../../src/config/project-config.manager.js'
import {EnvironmentConfig, ProjectConfig} from '../../src/config/types.js'

const makeEnv = (name: string, url = 'https://example.com'): EnvironmentConfig => ({
  addedAt: '2024-01-01T00:00:00.000Z',
  name,
  token: `user:secret`,
  url,
})

const makeProject = (name: string, envName = 'production'): ProjectConfig => ({
  addedAt: '2024-01-01T00:00:00.000Z',
  currentEnv: envName,
  environments: {[envName]: makeEnv(envName)},
  name,
})

describe('ProjectConfigManager', () => {
  let tmpDir: string
  let manager: ProjectConfigManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lps-test-'))
    manager = new ProjectConfigManager(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, {force: true, recursive: true})
  })

  describe('readConfig', () => {
    it('returns empty config when file does not exist', () => {
      const config = manager.readConfig()
      expect(config.currentProject).toBeNull()
      expect(config.projects).toEqual({})
    })
  })

  describe('setProject / getProject', () => {
    it('stores and retrieves a project', () => {
      const project = makeProject('acme')
      manager.setProject('acme', project)
      expect(manager.getProject('acme')).toEqual(project)
    })

    it('sets the first project as current automatically', () => {
      manager.setProject('acme', makeProject('acme'))
      expect(manager.readConfig().currentProject).toBe('acme')
    })

    it('does not change current when a second project is added', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      expect(manager.readConfig().currentProject).toBe('acme')
    })

    it('returns null for an unknown project', () => {
      expect(manager.getProject('unknown')).toBeNull()
    })
  })

  describe('getCurrentProject', () => {
    it('returns null when no projects are configured', () => {
      expect(manager.getCurrentProject()).toBeNull()
    })

    it('returns the current project', () => {
      const project = makeProject('acme')
      manager.setProject('acme', project)
      expect(manager.getCurrentProject()).toEqual(project)
    })
  })

  describe('setCurrentProject', () => {
    it('updates the current project', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      manager.setCurrentProject('beta')
      expect(manager.getCurrentProject()?.name).toBe('beta')
    })
  })

  describe('removeProject', () => {
    it('removes the project and falls back to first remaining', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      manager.setCurrentProject('acme')
      manager.removeProject('acme')
      expect(manager.getProject('acme')).toBeNull()
      expect(manager.readConfig().currentProject).toBe('beta')
    })

    it('sets currentProject to null when last project is removed', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.removeProject('acme')
      expect(manager.readConfig().currentProject).toBeNull()
    })
  })

  describe('listProjects', () => {
    it('returns empty array when no projects configured', () => {
      expect(manager.listProjects()).toEqual([])
    })

    it('marks the current project with isCurrent: true', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      const list = manager.listProjects()
      expect(list.find((p) => p.name === 'acme')?.isCurrent).toBe(true)
      expect(list.find((p) => p.name === 'beta')?.isCurrent).toBe(false)
    })
  })

  describe('setEnvironment / getEnvironment', () => {
    it('adds an environment to an existing project', () => {
      manager.setProject('acme', makeProject('acme'))
      const staging = makeEnv('staging', 'https://staging.acme.com')
      manager.setEnvironment('acme', 'staging', staging)
      expect(manager.getEnvironment('acme', 'staging')).toEqual(staging)
    })

    it('does nothing when the project does not exist', () => {
      manager.setEnvironment('ghost', 'staging', makeEnv('staging'))
      expect(manager.getProject('ghost')).toBeNull()
    })

    it('sets the first environment as currentEnv automatically on a fresh project', () => {
      const project: ProjectConfig = {
        addedAt: '2024-01-01T00:00:00.000Z',
        currentEnv: null,
        environments: {},
        name: 'acme',
      }
      manager.setProject('acme', project)
      manager.setEnvironment('acme', 'production', makeEnv('production'))
      expect(manager.getProject('acme')?.currentEnv).toBe('production')
    })
  })

  describe('getCurrentEnv', () => {
    it('returns null when no project is configured', () => {
      expect(manager.getCurrentEnv()).toBeNull()
    })

    it('returns the current environment of the current project', () => {
      const project = makeProject('acme', 'production')
      manager.setProject('acme', project)
      const env = manager.getCurrentEnv()
      expect(env?.name).toBe('production')
    })
  })

  describe('setCurrentEnv', () => {
    it('updates the active environment within a project', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.setEnvironment('acme', 'staging', makeEnv('staging'))
      manager.setCurrentEnv('acme', 'staging')
      expect(manager.getCurrentEnv()?.name).toBe('staging')
    })
  })

  describe('removeEnvironment', () => {
    it('removes the environment and falls back to first remaining', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.setEnvironment('acme', 'staging', makeEnv('staging'))
      manager.setCurrentEnv('acme', 'production')
      manager.removeEnvironment('acme', 'production')
      expect(manager.getEnvironment('acme', 'production')).toBeNull()
      expect(manager.getProject('acme')?.currentEnv).toBe('staging')
    })

    it('sets currentEnv to null when last environment is removed', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.removeEnvironment('acme', 'production')
      expect(manager.getProject('acme')?.currentEnv).toBeNull()
    })
  })

  describe('listEnvironments', () => {
    it('returns empty array for unknown project', () => {
      expect(manager.listEnvironments('ghost')).toEqual([])
    })

    it('marks the current environment with isCurrent: true', () => {
      manager.setProject('acme', makeProject('acme', 'production'))
      manager.setEnvironment('acme', 'staging', makeEnv('staging'))
      const list = manager.listEnvironments('acme')
      expect(list.find((e) => e.name === 'production')?.isCurrent).toBe(true)
      expect(list.find((e) => e.name === 'staging')?.isCurrent).toBe(false)
    })
  })

  describe('writeConfig (atomic write)', () => {
    it('survives a second write without corrupting the file', () => {
      manager.setProject('acme', makeProject('acme'))
      manager.setProject('beta', makeProject('beta'))
      manager.setCurrentProject('beta')
      const config = manager.readConfig()
      expect(config.currentProject).toBe('beta')
      expect(Object.keys(config.projects)).toHaveLength(2)
    })

    it('persists config.json at the expected path', () => {
      manager.setProject('acme', makeProject('acme'))
      expect(manager.getConfigFilePath()).toBe(join(tmpDir, '.loopress', 'config.json'))
      expect(existsSync(manager.getConfigFilePath())).toBe(true)
    })
  })
})
