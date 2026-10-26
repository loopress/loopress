import {type SiteCapabilities} from '../../src/lib/capabilities.js'

type Overrides = Partial<Omit<SiteCapabilities, 'integrations' | 'theme'>> & {
  integrations?: Partial<SiteCapabilities['integrations']>
  theme?: Partial<SiteCapabilities['theme']>
}

// A Loopress Full site with every integration active on a block theme, unless overridden.
export function makeCapabilities(overrides: Overrides = {}): SiteCapabilities {
  return {
    edition: 'full',
    environmentType: 'local',
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
