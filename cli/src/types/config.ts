export interface EnvironmentConfig {
  addedAt: string
  name: string
  token?: string
  url: string
}

export interface ProjectConfig {
  addedAt: string
  environments: Record<string, EnvironmentConfig>
  name: string
}

export interface CurrentProjectPointer {
  env: string
  id: string
}

export interface LoopressConfig {
  currentProject: CurrentProjectPointer | null
  projects: Record<string, ProjectConfig>
}
