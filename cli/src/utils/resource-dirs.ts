import {join} from 'node:path'

import {type LoopressLocalConfig} from './loopress-config.js'

// The default subdirectory for each file-backed resource, relative to rootDir. `lps init`
// writes these same defaults into loopress.json, keep the two in sync.
export const RESOURCE_DIR_DEFAULTS = {
  acf: 'acf',
  api: 'api',
  apps: 'apps',
  form: 'forms',
  hooks: 'hooks',
  options: 'options',
  seo: 'seo',
  snippets: 'snippets',
} as const

export type ResourceDirKind = keyof typeof RESOURCE_DIR_DEFAULTS

const CONFIG_KEY: Record<ResourceDirKind, keyof LoopressLocalConfig> = {
  acf: 'acfDir',
  api: 'apiDir',
  apps: 'appsDir',
  form: 'formDir',
  hooks: 'hooksDir',
  options: 'optionsDir',
  seo: 'seoDir',
  snippets: 'snippetsDir',
}

// Resolves where a resource's files live: an explicit override wins, otherwise the
// loopress.json `<kind>Dir` setting, otherwise the built-in default, all under `rootDir`.
// Shared by every pull/push command (via LoopressCommand's resolve*Path helpers) and by
// `lps diff`, so the resolution rule has a single home.
export function resolveResourceDir(kind: ResourceDirKind, localConfig: LoopressLocalConfig, override?: string): string {
  if (override) return override

  const rootDir = localConfig.rootDir ?? '.'
  const configured = localConfig[CONFIG_KEY[kind]] as string | undefined
  return join(rootDir, configured ?? RESOURCE_DIR_DEFAULTS[kind])
}
