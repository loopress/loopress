import {type ResourceDirKind} from '../utils/resource-dirs.js'
import {isNotFoundError, type WpClient} from './wp-client.js'

// What `GET loopress/v1/capabilities` answers (the plugin's CapabilitiesController). Read before
// running anything, instead of pushing and recognizing the site's error afterwards.
export type SiteCapabilities = {
  edition: 'full' | 'light'
  environmentType: string
  // `snippets` is absent on Loopress Light, which has no snippet sync at all.
  integrations: {acf: boolean; form: boolean; snippets?: boolean}
  theme: {
    active: string
    // The Loopress child of the block theme in use. Absent on Light, null when the site can't
    // have one (a classic theme, or another child theme active).
    child?: null | {active: boolean; exists: boolean; stylesheet: string}
    isBlock: boolean
    template: string
  }
  version: string
}

export const CAPABILITIES_ENDPOINT = 'loopress/v1/capabilities'
export const THEME_ACTIVATE_ENDPOINT = 'loopress/v1/theme/activate'

// One request per site and per process: the aggregate commands ask about every resource.
const cache = new WeakMap<WpClient, Promise<SiteCapabilities>>()

// `site` names it in the error, the environment name or its URL.
export async function getCapabilities(wp: WpClient, site: string): Promise<SiteCapabilities> {
  let capabilities = cache.get(wp)
  if (!capabilities) {
    capabilities = wp.get<SiteCapabilities>(CAPABILITIES_ENDPOINT).catch((error: unknown) => {
      if (isNotFoundError(error)) {
        throw new Error(`The Loopress plugin on ${site} is too old for this CLI. Update it, then try again.`, {cause: error})
      }

      throw error
    })
    cache.set(wp, capabilities)
  }

  return capabilities
}

// Why the site can't hold a kind of resource: `plugins` are the wordpress.org slugs that would
// provide it, `fix` a fixed remedy when no plugin does.
export type MissingIntegration = {fix?: string; plugins?: string[]; reason: string}

// Why the site can't hold this kind of resource, or undefined when it can (or the kind needs
// nothing from the site).
export function missingIntegration(kind: ResourceDirKind, capabilities: SiteCapabilities): MissingIntegration | undefined {
  const {integrations, theme} = capabilities
  switch (kind) {
    case 'acf': {
      return integrations.acf ? undefined : {plugins: ['advanced-custom-fields'], reason: 'ACF is not active'}
    }

    case 'form': {
      return integrations.form ? undefined : {plugins: ['wpforms-lite'], reason: 'no supported form plugin is active'}
    }

    case 'snippets': {
      if (integrations.snippets === undefined) return {fix: 'Install Loopress Full', reason: 'snippets need Loopress Full'}
      return integrations.snippets
        ? undefined
        : {plugins: ['code-snippets', 'insert-headers-and-footers'], reason: 'no supported snippet plugin is active'}
    }

    case 'themeStyles': {
      return theme.isBlock ? undefined : {reason: `the active theme "${theme.active}" is a classic theme`}
    }

    default: {
      return undefined
    }
  }
}

// How to fix a missing integration, given the plugins the project declares (composer.json, or
// loopress.json without one): declared but inactive needs activating, otherwise declaring.
export function integrationFix(missing: MissingIntegration, declared: {fromComposer: boolean; plugins: string[]}): string | undefined {
  if (missing.fix) return missing.fix
  if (!missing.plugins) return undefined

  // composer.json records no active state, loopress.json pins it per plugin.
  const activate = (plugin: string) =>
    declared.fromComposer ? '`lps plugin push --activate`' : `"${plugin}": {"active": true, ...} in loopress.json, then \`lps plugin push\``

  const plugin = missing.plugins.find((candidate) => declared.plugins.includes(candidate))
  if (plugin) return `The project declares ${plugin}, activate it: ${activate(plugin)}`

  const [first, ...alternatives] = missing.plugins
  const or = alternatives.length > 0 ? ` (or ${alternatives.join(', ')})` : ''
  const where = declared.fromComposer ? `wpackagist-plugin/${first} in composer.json` : `"${first}" in loopress.json plugins`
  return `Declare ${first}${or} (${where}), then activate it: ${activate(first)}`
}

export type ThemeActivation = {active: string; changed: boolean; previous: string}

export async function activateTheme(wp: WpClient, stylesheet: string): Promise<ThemeActivation> {
  const activation = await wp.post<ThemeActivation>(THEME_ACTIVATE_ENDPOINT, {stylesheet})
  cache.delete(wp)
  return activation
}
