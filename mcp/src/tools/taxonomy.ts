import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerTaxonomyTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List the taxonomies registered on WordPress, where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin) and the post types it attaches to. Only Loopress ones are pulled and pushed.',
      pull: 'Pull the taxonomies Loopress manages on WordPress into taxonomies/<slug>.json files, never their terms. Taxonomies registered by a theme or another plugin are never pulled, see taxonomy_list.',
      push: 'Push local taxonomies (taxonomies/<slug>.json, register_taxonomy() arguments plus "object_type") to WordPress. Create or update only, never deletes a taxonomy (use taxonomy_rm), never touches its terms.',
      rm: 'Stop registering a Loopress taxonomy on WordPress. Its terms are kept in the database, hidden until the taxonomy is pushed again.',
      rmTarget: 'The taxonomy slug to remove, its taxonomies/ file name without .json (e.g. "genre")',
    },
    pathNoun: 'taxonomies directory',
    resource: 'taxonomy',
    supportsRm: true,
    supportsRollback: true,
  })
}
