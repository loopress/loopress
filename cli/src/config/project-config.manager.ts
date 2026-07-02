import {randomUUID} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {CurrentProjectPointer, EnvironmentConfig, LoopressConfig, ProjectConfig} from './types.js'

export class ProjectConfigManager {
  private static instance: ProjectConfigManager

  constructor(private readonly homeDir: string = homedir()) {}

  static getInstance(): ProjectConfigManager {
    if (!ProjectConfigManager.instance) {
      ProjectConfigManager.instance = new ProjectConfigManager()
    }

    return ProjectConfigManager.instance
  }

  createProjectId(): string {
    return randomUUID()
  }

  ensureConfigDir(): void {
    const dir = join(this.homeDir, '.loopress')
    if (!existsSync(dir)) {
      mkdirSync(dir, {recursive: true})
    }
  }

  getConfigFilePath(): string {
    return join(this.homeDir, '.loopress', 'config.json')
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
    const filePath = this.getConfigFilePath()
    if (!existsSync(filePath)) {
      return {currentProject: null, projects: {}}
    }

    try {
      const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
      return this.sanitizeConfig(parsed)
    } catch {
      return {currentProject: null, projects: {}}
    }
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

  setProject(id: string, project: ProjectConfig): void {
    const config = this.readConfig()
    config.projects[id] = project

    if (!config.currentProject) {
      const [firstEnv] = Object.keys(project.environments)
      if (firstEnv) config.currentProject = {env: firstEnv, id}
    }

    this.writeConfig(config)
  }

  writeConfig(config: LoopressConfig): void {
    this.ensureConfigDir()
    const filePath = this.getConfigFilePath()
    const tmpPath = `${filePath}.tmp`
    writeFileSync(tmpPath, JSON.stringify(config, null, 2))
    renameSync(tmpPath, filePath)
  }

  private isProjectConfig(value: unknown): value is ProjectConfig {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>
    return typeof candidate.name === 'string' && typeof candidate.environments === 'object' && candidate.environments !== null
  }

  private sanitizeConfig(value: unknown): LoopressConfig {
    if (typeof value !== 'object' || value === null) return {currentProject: null, projects: {}}

    const candidate = value as Record<string, unknown>
    return {
      currentProject: this.sanitizeCurrentProject(candidate.currentProject),
      projects: this.sanitizeProjects(candidate.projects),
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
}

export const configManager = ProjectConfigManager.getInstance()
