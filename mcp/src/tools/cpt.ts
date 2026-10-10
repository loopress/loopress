import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerCptTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List every post type registered on WordPress and where it comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin).',
      pull: 'Pull the custom post types Loopress manages on WordPress into cpt/<slug>.json files (register_post_type() arguments).',
      push: 'Push local cpt/<slug>.json custom post types to WordPress. Create or update only, never deletes a post type.',
      rm: 'Stop registering one Loopress custom post type on WordPress. Its posts stay in the database, hidden until it is pushed again.',
      rmTarget: 'The post type slug to remove, its cpt/ file name without .json (e.g. "book")',
    },
    pathNoun: 'cpt directory',
    resource: 'cpt',
    supportsRm: true,
    supportsRollback: true,
  })
}
