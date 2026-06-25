export interface InstalledPlugin {
  active: boolean
  file: string
  name: string
  slug: string
  version: string
}

export interface InstallResult {
  message: string
  version: string
}

export interface ActivateResult {
  message: string
}

export type PluginManifest = Record<string, string>
