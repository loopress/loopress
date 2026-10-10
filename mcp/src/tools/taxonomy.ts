import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerTaxonomyTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List every taxonomy registered on WordPress, where it comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin) and the post types it attaches to.',
      pull: 'Pull the taxonomies Loopress manages on WordPress into taxonomies/<slug>.json files (register_taxonomy() arguments plus "object_type"), never their terms.',
      push: 'Push local taxonomies/<slug>.json taxonomies to WordPress. Create or update only, never deletes a taxonomy, never touches its terms.',
      rm: 'Stop registering one Loopress taxonomy on WordPress. Its terms stay in the database, hidden until it is pushed again.',
      rmTarget: 'The taxonomy slug to remove, its taxonomies/ file name without .json (e.g. "genre")',
    },
    pathNoun: 'taxonomies directory',
    resource: 'taxonomy',
    supportsRm: true,
    supportsRollback: true,
  })
}
