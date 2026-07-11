import {existsSync, mkdirSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import slugify from 'slugify'

import {CurrentProjectPointer, EnvironmentConfig, LoopressConfig, ProjectConfig, TelemetryConfig} from '../types/config.js'
import {readJsonFile, writeJsonFileAtomic} from './json-file.js'

export class ProjectConfigManager {
  constructor(private configDir: string = join(homedir(), '.loopress')) {}

  createProjectId(name: string): string {
    const config = this.readConfig()
    const base = slugify(name, {lower: true, strict: true}) || 'project'

    let id = base
    let suffix = 2
    while (config.projects[id]) {
      id = `${base}-${suffix}`
      suffix++
    }

    return id
  }

  ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, {recursive: true})
    }
  }

  // Looks up a local project already linked to a given API project, regardless of whether
  // it was "claimed" in the current sync run. Used by `project sync` to avoid minting a new
  // local project every time it pulls an API project whose local link was lost (e.g. after
  // a reset or partial config corruption), which otherwise accumulates duplicate entries.
  findProjectByApiId(apiProjectId: string): null | (ProjectConfig & {id: string}) {
    const config = this.readConfig()
    for (const [id, project] of Object.entries(config.projects)) {
      if (project.apiProjectId === apiProjectId) return {...project, id}
    }

    return null
  }

  getConfigFilePath(): string {
    return join(this.configDir, 'config.json')
  }

  getCurrentEnv(): EnvironmentConfig | null {
    const config = this.readConfig()
    if (!config.currentProject) return null
    const project = config.projects[config.currentProject.id]
    if (!project) return null
    return project.environments[config.currentProject.env] ?? null
  }

  getCurrentProject(): null | (ProjectConfig & {id: string}) {
    const config = this.readConfig()
    if (!config.currentProject) return null
    const project = config.projects[config.currentProject.id]
    if (!project) return null
    return {...project, id: config.currentProject.id}
  }

  getEnvironment(projectId: string, envName: string): EnvironmentConfig | null {
    const project = this.getProject(projectId)
    if (!project) return null
    return project.environments[envName] ?? null
  }

  getProject(id: string): null | ProjectConfig {
    const config = this.readConfig()
    return config.projects[id] ?? null
  }

  isTelemetryDisabled(): boolean {
    return this.readConfig().telemetry?.disabled ?? false
  }

  listEnvironments(projectId: string): Array<EnvironmentConfig & {isCurrent: boolean}> {
    const config = this.readConfig()
    const project = config.projects[projectId]
    if (!project) return []
    return Object.values(project.environments).map((env) => ({
      ...env,
      isCurrent: config.currentProject?.id === projectId && config.currentProject.env === env.name,
    }))
  }

  listProjects(): Array<ProjectConfig & {id: string; isCurrent: boolean}> {
    const config = this.readConfig()
    return Object.entries(config.projects).map(([id, project]) => ({
      ...project,
      id,
      isCurrent: config.currentProject?.id === id,
    }))
  }

  readConfig(): LoopressConfig {
    const parsed = readJsonFile<unknown>(this.getConfigFilePath())
    if (parsed === null) {
      return {currentProject: null, projects: {}}
    }

    return this.sanitizeConfig(parsed)
  }

  removeEnvironment(projectId: string, envName: string): void {
    const config = this.readConfig()
    const project = config.projects[projectId]
    if (!project) return

    delete project.environments[envName]

    if (config.currentProject?.id === projectId && config.currentProject.env === envName) {
      const remaining = Object.keys(project.environments)
      config.currentProject = remaining.length > 0 ? {env: remaining[0], id: projectId} : null
    }

    this.writeConfig(config)
  }

  removeProject(id: string): void {
    const config = this.readConfig()
    delete config.projects[id]

    if (config.currentProject?.id === id) {
      const [nextId] = Object.keys(config.projects)
      const nextProject = nextId ? config.projects[nextId] : undefined
      const [nextEnv] = nextProject ? Object.keys(nextProject.environments) : []
      config.currentProject = nextId && nextEnv ? {env: nextEnv, id: nextId} : null
    }

    this.writeConfig(config)
  }

  // Repointed by the `init` hook to oclif's native configDir once the real CLI Config is
  // available. The constructor default only serves contexts that bypass the oclif lifecycle
  // (e.g. commands instantiated directly in unit tests).
  setConfigDir(configDir: string): void {
    this.configDir = configDir
  }

  setCurrent(projectId: string, envName: string): void {
    const config = this.readConfig()
    if (!config.projects[projectId]) return
    config.currentProject = {env: envName, id: projectId}
    this.writeConfig(config)
  }

  setEnvironment(projectId: string, envName: string, env: EnvironmentConfig): void {
    const config = this.readConfig()
    const project = config.projects[projectId]
    if (!project) return

    project.environments[envName] = env
    if (!config.currentProject) config.currentProject = {env: envName, id: projectId}

    this.writeConfig(config)
  }

  setEnvironmentApiId(projectId: string, envName: string, apiEnvironmentId: string): void {
    const config = this.readConfig()
    const env = config.projects[projectId]?.environments[envName]
    if (!env) return

    env.apiEnvironmentId = apiEnvironmentId
    this.writeConfig(config)
  }

  setProject(id: string, project: ProjectConfig): void {
    const config = this.readConfig()
    config.projects[id] = project

    if (!config.currentProject) {
      const [firstEnv] = Object.keys(project.environments)
      if (firstEnv) config.currentProject = {env: firstEnv, id}
    }

    this.writeConfig(config)
  }

  setProjectApiId(id: string, apiProjectId: string): void {
    const config = this.readConfig()
    const project = config.projects[id]
    if (!project) return

    project.apiProjectId = apiProjectId
    this.writeConfig(config)
  }

  setTelemetryDisabled(disabled: boolean): void {
    const config = this.readConfig()
    config.telemetry = {disabled}
    this.writeConfig(config)
  }

  writeConfig(config: LoopressConfig): void {
    writeJsonFileAtomic(this.getConfigFilePath(), config)
  }

  private isProjectConfig(value: unknown): value is ProjectConfig {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>
    return typeof candidate.name === 'string' && typeof candidate.environments === 'object' && candidate.environments !== null
  }

  private sanitizeConfig(value: unknown): LoopressConfig {
    if (typeof value !== 'object' || value === null) return {currentProject: null, projects: {}}

    const candidate = value as Record<string, unknown>
    const telemetry = this.sanitizeTelemetry(candidate.telemetry)
    return {
      currentProject: this.sanitizeCurrentProject(candidate.currentProject),
      projects: this.sanitizeProjects(candidate.projects),
      ...(telemetry && {telemetry}),
    }
  }

  private sanitizeCurrentProject(value: unknown): CurrentProjectPointer | null {
    if (value === null || typeof value !== 'object') return null
    const pointer = value as Partial<CurrentProjectPointer>
    return typeof pointer.id === 'string' && typeof pointer.env === 'string' ? {env: pointer.env, id: pointer.id} : null
  }

  private sanitizeProjects(value: unknown): Record<string, ProjectConfig> {
    if (typeof value !== 'object' || value === null) return {}

    const projects: Record<string, ProjectConfig> = {}
    for (const [id, project] of Object.entries(value as Record<string, unknown>)) {
      if (this.isProjectConfig(project)) projects[id] = project
    }

    return projects
  }

  private sanitizeTelemetry(value: unknown): TelemetryConfig | undefined {
    if (typeof value !== 'object' || value === null) return undefined
    const candidate = value as Partial<TelemetryConfig>
    return typeof candidate.disabled === 'boolean' ? {disabled: candidate.disabled} : undefined
  }
}

export const configManager = new ProjectConfigManager()
