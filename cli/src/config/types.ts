export interface EnvironmentConfig {
  name: string
  url: string
  token?: string
  addedAt: string
}

export interface ProjectConfig {
  name: string
  currentEnv: string | null
  environments: Record<string, EnvironmentConfig>
  addedAt: string
}

export interface WdxConfig {
  currentProject: string | null
  projects: Record<string, ProjectConfig>
}
