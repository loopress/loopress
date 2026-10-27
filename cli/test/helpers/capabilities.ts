import {type SiteCapabilities} from '../../src/lib/capabilities.js'

type Overrides = Partial<Omit<SiteCapabilities, 'integrations' | 'theme'>> & {
  integrations?: Partial<SiteCapabilities['integrations']>
  theme?: Partial<SiteCapabilities['theme']>
}

// What the plugin's CapabilitiesController and loopress.php report for each edition.
export const LIGHT_MODULES = ['acf', 'content', 'form', 'menu', 'options', 'post-types', 'themes']
const FULL_MODULES = [...LIGHT_MODULES, 'api', 'apps', 'blocks', 'dependencies', 'hooks', 'pages', 'snippets']

// A Loopress Light site, ACF and a form plugin active, on a block theme.
export function makeLightCapabilities(overrides: Overrides = {}): SiteCapabilities {
  return makeCapabilities({edition: 'light', modules: LIGHT_MODULES, ...overrides, integrations: {snippets: undefined, ...overrides.integrations}, theme: {child: undefined, ...overrides.theme}})
}

// A Loopress Full site with every integration active on a block theme, unless overridden.
export function makeCapabilities(overrides: Overrides = {}): SiteCapabilities {
  return {
    edition: 'full',
    environmentType: 'local',
    modules: FULL_MODULES,
    version: '2026.10.0',
    ...overrides,
    integrations: {acf: true, form: true, snippets: true, ...overrides.integrations},
    theme: {
      active: 'twentytwentyfive',
      child: {active: false, exists: false, stylesheet: 'twentytwentyfive-loopress'},
      isBlock: true,
      template: 'twentytwentyfive',
      ...overrides.theme,
    },
  }
}

// Stubs LoopressCommand.capabilities() on a command under test.
export function stubCapabilities(cmd: unknown, capabilities: SiteCapabilities = makeCapabilities()): void {
  ;(cmd as {capabilities: () => Promise<SiteCapabilities>}).capabilities = async () => capabilities
}
