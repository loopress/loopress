import {WpNativePlugin} from '../types/plugin.js'
import {WpClient} from './wp-client.js'

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
