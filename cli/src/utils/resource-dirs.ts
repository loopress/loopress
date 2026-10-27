import {existsSync} from 'node:fs'
import {join, resolve} from 'node:path'

import {type LoopressLocalConfig} from './loopress-config.js'

// The default subdirectory for each file-backed resource, relative to rootDir. Used whenever
// loopress.json has no `<kind>Dir` key, which is the case for a fresh `lps init`.
export const RESOURCE_DIR_DEFAULTS = {
  acf: 'acf',
  api: 'api',
  apps: 'apps',
  block: 'blocks',
  blockCss: 'theme/blocks',
  cpt: 'cpt',
  css: 'theme/css',
  form: 'forms',
  hooks: 'hooks',
  menu: 'menus',
  meta: 'meta',
  options: 'options',
  page: 'pages',
  part: 'theme/parts',
  pattern: 'patterns',
  role: 'roles',
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
  block: 'blockDir',
  blockCss: 'blockCssDir',
  cpt: 'cptDir',
  css: 'cssDir',
  form: 'formDir',
  hooks: 'hooksDir',
  menu: 'menuDir',
  meta: 'metaDir',
  options: 'optionsDir',
  page: 'pageDir',
  part: 'partDir',
  pattern: 'patternDir',
  role: 'roleDir',
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
  const configured = localConfig[CONFIG_KEY[kind]]
  return join(rootDir, typeof configured === 'string' ? configured : RESOURCE_DIR_DEFAULTS[kind])
}

// Whether the project uses a resource at all: its directory exists. What the aggregate `lps push`,
// `lps pull` and `lps diff` go by for a resource backed by a plugin the site may not have.
export function projectUses(kind: ResourceDirKind, localConfig: LoopressLocalConfig): boolean {
  return existsSync(resolve(resolveResourceDir(kind, localConfig)))
}

// The project has files for the Loopress child theme to hold: templates, parts or CSS. Without
// them the child would be empty, activateChildTheme or not: `lps theme activate` covers that.
export function projectHasChildThemeFiles(localConfig: LoopressLocalConfig): boolean {
  return (['template', 'part', 'css', 'blockCss'] as const).some((kind) => projectUses(kind, localConfig))
}
