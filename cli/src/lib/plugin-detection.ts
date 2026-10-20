import {type WpNativePlugin} from '../types/plugin.js'
import {type WpClient} from './wp-client.js'

const FULL_PLUGIN_PREFIX = 'loopress-full/'

/**
 * Checks `wp/v2/plugins` directly rather than through `parseInstalledPlugins`
 * (`src/utils/plugins.ts`), which deliberately filters Loopress's own plugin slugs out of its
 * result so `plugin push` never tries to manage itself. This is the one place that needs to
 * see Loopress Full itself.
 */
export async function isLoopressFullActive(wp: WpClient): Promise<boolean> {
  const plugins = await wp.get<WpNativePlugin[]>('wp/v2/plugins')
  return plugins.some((plugin) => plugin.plugin.startsWith(FULL_PLUGIN_PREFIX) && plugin.status === 'active')
}

// How the Loopress plugin reports a resource's integration missing: "ACF is not active", "No
// supported form plugin is active", "No supported snippet plugin is active". Global Styles say a
// classic theme is active. The aggregate commands skip such a resource the project doesn't use.
export const INTEGRATION_MISSING = /\bis not active\b|\bNo supported .+ plugin is active\b|\bis a classic theme\b/
