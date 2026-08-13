import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {ProjectConfigManager} from '../../src/config/project-config.manager.js'
import {type EnvironmentConfig, type ProjectConfig} from '../../src/types/config.js'

const makeEnv = (name: string, url = 'https://example.com'): EnvironmentConfig => ({
  addedAt: '2024-01-01T00:00:00.000Z',
  name,
  token: `user:secret`,
  url,
})

const makeProject = (name: string, envName = 'production'): ProjectConfig => ({
  addedAt: '2024-01-01T00:00:00.000Z',
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

    it('drops a fully legacy name-keyed project entry alongside a legacy currentProject string', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: 'acme', projects: {acme: {}}}))
      const config = manager.readConfig()
      expect(config.currentProject).toBeNull()
      expect(config.projects).toEqual({})
    })

    it('nulls out a legacy string currentProject but keeps well-formed projects intact', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.ensureConfigDir()
      const raw = JSON.parse(readFileSync(manager.getConfigFilePath(), 'utf8'))
      raw.currentProject = 'acme'
      writeFileSync(manager.getConfigFilePath(), JSON.stringify(raw))

      const config = manager.readConfig()
      expect(config.currentProject).toBeNull()
      expect(config.projects['id-acme']).toEqual(makeProject('acme'))
    })

    it('drops a project entry missing the name field', () => {
      manager.ensureConfigDir()
      writeFileSync(
        manager.getConfigFilePath(),
        JSON.stringify({currentProject: null, projects: {acme: {environments: {}}}}),
      )
      expect(manager.readConfig().projects).toEqual({})
    })

    it('drops a project entry whose environments field is not an object', () => {
      manager.ensureConfigDir()
      writeFileSync(
        manager.getConfigFilePath(),
        JSON.stringify({currentProject: null, projects: {acme: {environments: 'nope', name: 'acme'}}}),
      )
      expect(manager.readConfig().projects).toEqual({})
    })

    it('drops a project entry whose environments field is null', () => {
      manager.ensureConfigDir()
      writeFileSync(
        manager.getConfigFilePath(),
        JSON.stringify({currentProject: null, projects: {acme: {environments: null, name: 'acme'}}}),
      )
      expect(manager.readConfig().projects).toEqual({})
    })

    it('keeps a well-formed project entry', () => {
      manager.ensureConfigDir()
      writeFileSync(
        manager.getConfigFilePath(),
        JSON.stringify({currentProject: null, projects: {acme: {environments: {}, name: 'acme'}}}),
      )
      expect(manager.readConfig().projects).toEqual({acme: {environments: {}, name: 'acme'}})
    })

    it('treats a non-object projects field as no projects', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: null, projects: 'nope'}))
      expect(manager.readConfig().projects).toEqual({})
    })

    it('treats a currentProject with a non-string id as null', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: {env: 'production', id: 42}, projects: {}}))
      expect(manager.readConfig().currentProject).toBeNull()
    })

    it('treats a currentProject with a non-string env as null', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: {env: 42, id: 'id-acme'}, projects: {}}))
      expect(manager.readConfig().currentProject).toBeNull()
    })

    it('treats a non-object config root as empty', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify(42))
      const config = manager.readConfig()
      expect(config.currentProject).toBeNull()
      expect(config.projects).toEqual({})
    })

    it('drops a project entry that is not an object', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: null, projects: {acme: 'nope'}}))
      expect(manager.readConfig().projects).toEqual({})
    })

    it('drops a project entry that is exactly null', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: null, projects: {acme: null}}))
      expect(() => manager.readConfig()).not.toThrow()
      expect(manager.readConfig().projects).toEqual({})
    })

    it('treats a null projects field as no projects', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: null, projects: null}))
      expect(manager.readConfig().projects).toEqual({})
    })
  })

  describe('ensureConfigDir', () => {
    it('creates a deeply nested config directory that does not exist yet', () => {
      const nestedManager = new ProjectConfigManager(join(tmpDir, 'a', 'b'))
      nestedManager.ensureConfigDir()
      expect(existsSync(join(tmpDir, 'a', 'b'))).toBe(true)
    })

    it('is a no-op when the config directory already exists', () => {
      manager.ensureConfigDir()
      expect(() => { manager.ensureConfigDir(); }).not.toThrow()
      expect(existsSync(tmpDir)).toBe(true)
    })
  })

  describe('setProject / getProject', () => {
    it('stores and retrieves a project', () => {
      const project = makeProject('acme')
      manager.setProject('id-acme', project)
      expect(manager.getProject('id-acme')).toEqual(project)
    })

    it('sets the first project as current automatically', () => {
      manager.setProject('id-acme', makeProject('acme'))
      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-acme'})
    })

    it('does not change current when a second project is added', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', makeProject('beta'))
      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-acme'})
    })

    it('returns null for an unknown project', () => {
      expect(manager.getProject('unknown')).toBeNull()
    })

    it('does not set currentProject when the first project added has no environments', () => {
      manager.setProject('id-acme', {addedAt: '2024-01-01T00:00:00.000Z', environments: {}, name: 'acme'})

      // Same reasoning as the removeProject/removeEnvironment raw-file checks above: a `{id,
      // env: undefined}` pointer is indistinguishable from `null` once read back through
      // readConfig()'s sanitization, since JSON.stringify drops the undefined env first.
      const raw = JSON.parse(readFileSync(manager.getConfigFilePath(), 'utf8'))
      expect(raw.currentProject).toBeNull()
    })
  })

  describe('findProjectByApiId', () => {
    it('finds the project whose apiProjectId matches', () => {
      manager.setProject('id-acme', {...makeProject('acme'), apiProjectId: 'api-1'})
      manager.setProject('id-beta', {...makeProject('beta'), apiProjectId: 'api-2'})

      const found = manager.findProjectByApiId('api-2')

      expect(found?.id).toBe('id-beta')
      expect(found?.name).toBe('beta')
    })

    it('returns null when no project has that apiProjectId', () => {
      manager.setProject('id-acme', {...makeProject('acme'), apiProjectId: 'api-1'})

      expect(manager.findProjectByApiId('api-unknown')).toBeNull()
    })

    it('returns null when the project has no apiProjectId at all', () => {
      manager.setProject('id-acme', makeProject('acme'))

      expect(manager.findProjectByApiId('api-1')).toBeNull()
    })
  })

  describe('setProjectApiId', () => {
    it('stores the apiProjectId on the project', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProjectApiId('id-acme', 'api-1')
      expect(manager.getProject('id-acme')).toEqual({...makeProject('acme'), apiProjectId: 'api-1'})
    })

    it('does nothing for an unknown project', () => {
      expect(() => { manager.setProjectApiId('ghost', 'api-1'); }).not.toThrow()
      expect(manager.getProject('ghost')).toBeNull()
    })
  })

  describe('setEnvironmentApiId', () => {
    it('stores the apiEnvironmentId on the environment', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setEnvironmentApiId('id-acme', 'production', 'api-env-1')
      expect(manager.getEnvironment('id-acme', 'production')).toEqual({
        ...makeEnv('production'),
        apiEnvironmentId: 'api-env-1',
      })
    })

    it('does nothing for an unknown project', () => {
      expect(() => { manager.setEnvironmentApiId('ghost', 'production', 'api-env-1'); }).not.toThrow()
      expect(manager.getProject('ghost')).toBeNull()
    })

    it('does nothing for an unknown environment on a known project', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setEnvironmentApiId('id-acme', 'ghost-env', 'api-env-1')
      expect(manager.getEnvironment('id-acme', 'production')).toEqual(makeEnv('production'))
    })
  })

  describe('createProjectId', () => {
    it('slugifies the given name', () => {
      expect(manager.createProjectId('My Cool Project')).toBe('my-cool-project')
    })

    it('falls back to "project" when the name has nothing sluggable in it', () => {
      expect(manager.createProjectId('!!!')).toBe('project')
    })

    it('appends a numeric suffix when the slug is already taken', () => {
      manager.setProject('acme', makeProject('Acme'))
      expect(manager.createProjectId('Acme')).toBe('acme-2')
    })

    it('keeps incrementing the suffix past existing collisions', () => {
      manager.setProject('acme', makeProject('Acme'))
      manager.setProject('acme-2', makeProject('Acme'))
      expect(manager.createProjectId('Acme')).toBe('acme-3')
    })
  })

  describe('getCurrentProject', () => {
    it('returns null when no projects are configured', () => {
      expect(manager.getCurrentProject()).toBeNull()
    })

    it('returns the current project with its id', () => {
      const project = makeProject('acme')
      manager.setProject('id-acme', project)
      expect(manager.getCurrentProject()).toEqual({...project, id: 'id-acme'})
    })

    it('returns null when currentProject points at a project that no longer exists', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.ensureConfigDir()
      const raw = JSON.parse(readFileSync(manager.getConfigFilePath(), 'utf8'))
      raw.currentProject = {env: 'production', id: 'ghost'}
      writeFileSync(manager.getConfigFilePath(), JSON.stringify(raw))

      expect(manager.getCurrentProject()).toBeNull()
    })
  })

  describe('setCurrent', () => {
    it('updates the current project and environment', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', makeProject('beta'))
      manager.setCurrent('id-beta', 'production')
      expect(manager.getCurrentProject()?.name).toBe('beta')
      expect(manager.getCurrentEnv()?.name).toBe('production')
    })

    it('does nothing for an unknown project', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setCurrent('unknown', 'production')
      expect(manager.getCurrentProject()?.name).toBe('acme')
    })
  })

  describe('removeProject', () => {
    it('removes the project and falls back to first remaining', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', makeProject('beta'))
      manager.setCurrent('id-acme', 'production')
      manager.removeProject('id-acme')
      expect(manager.getProject('id-acme')).toBeNull()
      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-beta'})
    })

    it('sets currentProject to null when last project is removed', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.removeProject('id-acme')
      expect(manager.readConfig().currentProject).toBeNull()
    })

    it('leaves currentProject untouched when removing a project that is not current', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', makeProject('beta'))
      manager.removeProject('id-beta')
      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-acme'})
    })

    it('sets currentProject to null when the fallback project has no environments', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', {addedAt: '2024-01-01T00:00:00.000Z', environments: {}, name: 'beta'})
      manager.setCurrent('id-acme', 'production')
      manager.removeProject('id-acme')
      expect(manager.getProject('id-beta')).not.toBeNull()
      // Read the raw file rather than manager.getCurrentProject()/readConfig(): a `{id, env:
      // undefined}` pointer round-trips through JSON.stringify indistinguishably from `null`
      // once env is dropped, so only the raw JSON tells "correctly set to null" apart from
      // "incorrectly set to a pointer with no env".
      const raw = JSON.parse(readFileSync(manager.getConfigFilePath(), 'utf8'))
      expect(raw.currentProject).toBeNull()
    })

    it('does not crash removing a project when nothing is currently active', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', makeProject('beta'))
      manager.removeEnvironment('id-acme', 'production') // id-acme was current; losing its last env nulls currentProject
      expect(manager.readConfig().currentProject).toBeNull()

      expect(() => { manager.removeProject('id-beta'); }).not.toThrow()
      expect(manager.getProject('id-beta')).toBeNull()
    })

    it('does not touch currentProject when removing an unrelated project, even if a different project would sort first', () => {
      manager.setProject('id-beta', makeProject('beta')) // inserted first; would be picked as "next" if the guard were skipped
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-gamma', makeProject('gamma'))
      manager.setCurrent('id-acme', 'production')

      manager.removeProject('id-gamma')

      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-acme'})
    })
  })

  describe('listProjects', () => {
    it('returns empty array when no projects configured', () => {
      expect(manager.listProjects()).toEqual([])
    })

    it('marks the current project with isCurrent: true', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', makeProject('beta'))
      const list = manager.listProjects()
      expect(list.find((p) => p.name === 'acme')?.isCurrent).toBe(true)
      expect(list.find((p) => p.name === 'beta')?.isCurrent).toBe(false)
    })

    it('marks every project as not current when there is no current project', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.removeEnvironment('id-acme', 'production')
      const list = manager.listProjects()
      expect(list.find((p) => p.name === 'acme')?.isCurrent).toBe(false)
    })
  })

  describe('setEnvironment / getEnvironment', () => {
    it('adds an environment to an existing project', () => {
      manager.setProject('id-acme', makeProject('acme'))
      const staging = makeEnv('staging', 'https://staging.acme.com')
      manager.setEnvironment('id-acme', 'staging', staging)
      expect(manager.getEnvironment('id-acme', 'staging')).toEqual(staging)
    })

    it('does nothing when the project does not exist', () => {
      manager.setEnvironment('ghost', 'staging', makeEnv('staging'))
      expect(manager.getProject('ghost')).toBeNull()
    })

    it('sets the environment as current automatically when nothing is active yet', () => {
      const project: ProjectConfig = {
        addedAt: '2024-01-01T00:00:00.000Z',
        environments: {},
        name: 'acme',
      }
      manager.setProject('id-acme', project)
      manager.setEnvironment('id-acme', 'production', makeEnv('production'))
      expect(manager.getCurrentEnv()?.name).toBe('production')
    })
  })

  describe('getCurrentEnv', () => {
    it('returns null when no project is configured', () => {
      expect(manager.getCurrentEnv()).toBeNull()
    })

    it('returns the current environment of the current project', () => {
      const project = makeProject('acme', 'production')
      manager.setProject('id-acme', project)
      const env = manager.getCurrentEnv()
      expect(env?.name).toBe('production')
    })

    it('returns null when currentProject points at a project that no longer exists', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.ensureConfigDir()
      const raw = JSON.parse(readFileSync(manager.getConfigFilePath(), 'utf8'))
      raw.currentProject = {env: 'production', id: 'ghost'}
      writeFileSync(manager.getConfigFilePath(), JSON.stringify(raw))

      expect(manager.getCurrentEnv()).toBeNull()
    })

    it('returns null when the current environment name is not on the project', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setCurrent('id-acme', 'ghost-env')
      expect(manager.getCurrentEnv()).toBeNull()
    })
  })

  describe('getEnvironment', () => {
    it('returns null for an unknown project', () => {
      expect(manager.getEnvironment('ghost', 'production')).toBeNull()
    })

    it('returns null for an unknown environment on a known project', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      expect(manager.getEnvironment('id-acme', 'ghost-env')).toBeNull()
    })
  })

  describe('removeEnvironment', () => {
    it('removes the environment and falls back to first remaining', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setEnvironment('id-acme', 'staging', makeEnv('staging'))
      manager.setCurrent('id-acme', 'production')
      manager.removeEnvironment('id-acme', 'production')
      expect(manager.getEnvironment('id-acme', 'production')).toBeNull()
      expect(manager.getCurrentEnv()?.name).toBe('staging')
    })

    it('sets currentProject to null when the active project loses its last environment', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.removeEnvironment('id-acme', 'production')
      expect(manager.readConfig().currentProject).toBeNull()
    })

    it('does nothing for an unknown project', () => {
      expect(() => { manager.removeEnvironment('ghost', 'production'); }).not.toThrow()
    })

    it('leaves currentProject untouched when removing an environment on a different project', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setProject('id-beta', makeProject('beta', 'production'))
      manager.removeEnvironment('id-beta', 'production')
      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-acme'})
    })

    it('leaves currentProject untouched when removing a non-current environment on the current project', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setEnvironment('id-acme', 'staging', makeEnv('staging'))
      manager.removeEnvironment('id-acme', 'staging')
      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-acme'})
    })

    it('leaves currentProject untouched when removing a non-current environment, even if a different remaining one would sort first', () => {
      manager.setProject('id-acme', makeProject('acme', 'staging')) // 'staging' inserted first
      manager.setEnvironment('id-acme', 'production', makeEnv('production'))
      manager.setEnvironment('id-acme', 'review', makeEnv('review'))
      manager.setCurrent('id-acme', 'production') // current env is 'production', not the first-inserted one

      manager.removeEnvironment('id-acme', 'review')

      expect(manager.readConfig().currentProject).toEqual({env: 'production', id: 'id-acme'})
    })

    it('does not crash removing an environment when nothing is currently active', () => {
      const project: ProjectConfig = {addedAt: '2024-01-01T00:00:00.000Z', environments: {}, name: 'acme'}
      manager.setProject('id-acme', project) // no environments, so setProject never sets a currentProject
      expect(manager.readConfig().currentProject).toBeNull()

      expect(() => { manager.removeEnvironment('id-acme', 'anything'); }).not.toThrow()
    })

    it('sets currentProject to null (not a pointer with a missing env) when the active project loses its last environment', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.removeEnvironment('id-acme', 'production')

      // See the analogous removeProject test above for why the raw file, not readConfig(), is
      // what actually distinguishes "null" from "a pointer whose env got dropped by JSON.stringify".
      const raw = JSON.parse(readFileSync(manager.getConfigFilePath(), 'utf8'))
      expect(raw.currentProject).toBeNull()
    })
  })

  describe('listEnvironments', () => {
    it('returns empty array for unknown project', () => {
      expect(manager.listEnvironments('ghost')).toEqual([])
    })

    it('marks the current environment with isCurrent: true', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setEnvironment('id-acme', 'staging', makeEnv('staging'))
      const list = manager.listEnvironments('id-acme')
      expect(list.find((e) => e.name === 'production')?.isCurrent).toBe(true)
      expect(list.find((e) => e.name === 'staging')?.isCurrent).toBe(false)
    })

    it('marks every environment as not current for a project that is not the current one', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.setProject('id-beta', makeProject('beta', 'production'))
      const list = manager.listEnvironments('id-beta')
      expect(list.find((e) => e.name === 'production')?.isCurrent).toBe(false)
    })

    it('marks every environment as not current when there is no current project', () => {
      manager.setProject('id-acme', makeProject('acme', 'production'))
      manager.ensureConfigDir()
      const raw = JSON.parse(readFileSync(manager.getConfigFilePath(), 'utf8'))
      raw.currentProject = null
      writeFileSync(manager.getConfigFilePath(), JSON.stringify(raw))

      const list = manager.listEnvironments('id-acme')
      expect(list.find((e) => e.name === 'production')?.isCurrent).toBe(false)
    })
  })

  describe('isTelemetryDisabled / setTelemetryDisabled', () => {
    it('is false by default', () => {
      expect(manager.isTelemetryDisabled()).toBe(false)
    })

    it('persists the disabled preference', () => {
      manager.setTelemetryDisabled(true)
      expect(manager.isTelemetryDisabled()).toBe(true)
    })

    it('persists re-enabling after being disabled', () => {
      manager.setTelemetryDisabled(true)
      manager.setTelemetryDisabled(false)
      expect(manager.isTelemetryDisabled()).toBe(false)
    })
  })

  describe('readConfig telemetry sanitization', () => {
    it('drops a telemetry field whose disabled property is not a boolean', () => {
      manager.ensureConfigDir()
      writeFileSync(
        manager.getConfigFilePath(),
        JSON.stringify({currentProject: null, projects: {}, telemetry: {disabled: 'nope'}}),
      )
      expect(manager.readConfig().telemetry).toBeUndefined()
    })

    it('drops a non-object telemetry field', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: null, projects: {}, telemetry: 'nope'}))
      expect(manager.readConfig().telemetry).toBeUndefined()
    })

    it('keeps a well-formed telemetry field', () => {
      manager.ensureConfigDir()
      writeFileSync(
        manager.getConfigFilePath(),
        JSON.stringify({currentProject: null, projects: {}, telemetry: {disabled: true}}),
      )
      expect(manager.readConfig().telemetry).toEqual({disabled: true})
    })

    it('drops a telemetry field that is exactly null', () => {
      manager.ensureConfigDir()
      writeFileSync(manager.getConfigFilePath(), JSON.stringify({currentProject: null, projects: {}, telemetry: null}))
      expect(() => manager.readConfig()).not.toThrow()
      expect(manager.readConfig().telemetry).toBeUndefined()
    })
  })

  describe('requireConfigDir (via getConfigFilePath)', () => {
    it('throws when used before setConfigDir()', () => {
      const bareManager = new ProjectConfigManager()
      expect(() => bareManager.getConfigFilePath()).toThrow('ProjectConfigManager used before setConfigDir() was called')
    })

    it('uses the configDir provided via setConfigDir()', () => {
      const bareManager = new ProjectConfigManager()
      bareManager.setConfigDir(tmpDir)
      expect(bareManager.getConfigFilePath()).toBe(join(tmpDir, 'config.json'))
    })
  })

  describe('writeConfig (atomic write)', () => {
    it('survives a second write without corrupting the file', () => {
      manager.setProject('id-acme', makeProject('acme'))
      manager.setProject('id-beta', makeProject('beta'))
      manager.setCurrent('id-beta', 'production')
      const config = manager.readConfig()
      expect(config.currentProject).toEqual({env: 'production', id: 'id-beta'})
      expect(Object.keys(config.projects)).toHaveLength(2)
    })

    it('persists config.json at the expected path', () => {
      manager.setProject('id-acme', makeProject('acme'))
      expect(manager.getConfigFilePath()).toBe(join(tmpDir, 'config.json'))
      expect(existsSync(manager.getConfigFilePath())).toBe(true)
    })
  })
})
