import {join} from 'node:path'

import {type LoopressLocalConfig} from './loopress-config.js'

// The default subdirectory for each file-backed resource, relative to rootDir. Used whenever
// loopress.json has no `<kind>Dir` key, which is the case for a fresh `lps init`.
export const RESOURCE_DIR_DEFAULTS = {
  acf: 'acf',
  api: 'api',
  apps: 'apps',
  cpt: 'cpt',
  form: 'forms',
  hooks: 'hooks',
  menu: 'menus',
  options: 'options',
  page: 'pages',
  part: 'theme/parts',
  seo: 'seo',
  snippets: 'snippets',
  taxonomy: 'taxonomies',
  template: 'theme/templates',
  themeStyles: 'theme',
} as const

export type ResourceDirKind = keyof typeof RESOURCE_DIR_DEFAULTS

const CONFIG_KEY: Record<ResourceDirKind, keyof LoopressLocalConfig> = {
  acf: 'acfDir',
  api: 'apiDir',
  apps: 'appsDir',
  cpt: 'cptDir',
  form: 'formDir',
  hooks: 'hooksDir',
  menu: 'menuDir',
  options: 'optionsDir',
  page: 'pageDir',
  part: 'partDir',
  seo: 'seoDir',
  snippets: 'snippetsDir',
  taxonomy: 'taxonomyDir',
  template: 'templateDir',
  themeStyles: 'themeStylesDir',
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
