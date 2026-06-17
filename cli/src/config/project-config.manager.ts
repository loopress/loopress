import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {EnvironmentConfig, ProjectConfig, WdxConfig} from './types.js'

export class ProjectConfigManager {
  private static instance: ProjectConfigManager

  constructor(private readonly homeDir: string = homedir()) {}

  static getInstance(): ProjectConfigManager {
    if (!ProjectConfigManager.instance) {
      ProjectConfigManager.instance = new ProjectConfigManager()
    }

    return ProjectConfigManager.instance
  }

  getConfigFilePath(): string {
    return join(this.homeDir, '.wdx', 'config.json')
  }

  ensureConfigDir(): void {
    const dir = join(this.homeDir, '.wdx')
    if (!existsSync(dir)) {
      mkdirSync(dir, {recursive: true})
    }
  }

  readConfig(): WdxConfig {
    const filePath = this.getConfigFilePath()
    if (!existsSync(filePath)) {
      return {currentProject: null, projects: {}}
    }

    return JSON.parse(readFileSync(filePath, 'utf8')) as WdxConfig
  }

  writeConfig(config: WdxConfig): void {
    this.ensureConfigDir()
    const filePath = this.getConfigFilePath()
    const tmpPath = `${filePath}.tmp`
    writeFileSync(tmpPath, JSON.stringify(config, null, 2))
    renameSync(tmpPath, filePath)
  }

  getCurrentProject(): ProjectConfig | null {
    const config = this.readConfig()
    if (!config.currentProject || !config.projects[config.currentProject]) return null
    return config.projects[config.currentProject]
  }

  getCurrentEnv(): EnvironmentConfig | null {
    const project = this.getCurrentProject()
    if (!project || !project.currentEnv) return null
    return project.environments[project.currentEnv] ?? null
  }

  getProject(name: string): ProjectConfig | null {
    const config = this.readConfig()
    return config.projects[name] ?? null
  }

  setProject(name: string, project: ProjectConfig): void {
    const config = this.readConfig()
    const isFirst = Object.keys(config.projects).length === 0
    config.projects[name] = project
    if (isFirst) config.currentProject = name
    this.writeConfig(config)
  }

  setCurrentProject(name: string): void {
    const config = this.readConfig()
    config.currentProject = name
    this.writeConfig(config)
  }

  removeProject(name: string): void {
    const config = this.readConfig()
    delete config.projects[name]
    if (config.currentProject === name) {
      const remaining = Object.keys(config.projects)
      config.currentProject = remaining.length > 0 ? remaining[0] : null
    }

    this.writeConfig(config)
  }

  listProjects(): Array<ProjectConfig & {isCurrent: boolean}> {
    const config = this.readConfig()
    return Object.values(config.projects).map((project) => ({
      ...project,
      isCurrent: project.name === config.currentProject,
    }))
  }

  getEnvironment(projectName: string, envName: string): EnvironmentConfig | null {
    const project = this.getProject(projectName)
    if (!project) return null
    return project.environments[envName] ?? null
  }

  setEnvironment(projectName: string, envName: string, env: EnvironmentConfig): void {
    const config = this.readConfig()
    if (!config.projects[projectName]) return
    const project = config.projects[projectName]
    const isFirst = Object.keys(project.environments).length === 0
    project.environments[envName] = env
    if (isFirst) project.currentEnv = envName
    this.writeConfig(config)
  }

  setCurrentEnv(projectName: string, envName: string): void {
    const config = this.readConfig()
    if (!config.projects[projectName]) return
    config.projects[projectName].currentEnv = envName
    this.writeConfig(config)
  }

  removeEnvironment(projectName: string, envName: string): void {
    const config = this.readConfig()
    if (!config.projects[projectName]) return
    const project = config.projects[projectName]
    delete project.environments[envName]
    if (project.currentEnv === envName) {
      const remaining = Object.keys(project.environments)
      project.currentEnv = remaining.length > 0 ? remaining[0] : null
    }

    this.writeConfig(config)
  }

  listEnvironments(projectName: string): Array<EnvironmentConfig & {isCurrent: boolean}> {
    const project = this.getProject(projectName)
    if (!project) return []
    return Object.values(project.environments).map((env) => ({
      ...env,
      isCurrent: env.name === project.currentEnv,
    }))
  }
}

export const configManager = ProjectConfigManager.getInstance()
