import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerCptTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List the post types registered on WordPress and where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin). Only Loopress ones are pulled and pushed.',
      pull: 'Pull the custom post types Loopress manages on WordPress into cpt/<slug>.json files. Post types registered by a theme or another plugin are never pulled, see cpt_list.',
      push: 'Push local custom post types (cpt/<slug>.json, register_post_type() arguments) to WordPress. Create or update only, never deletes a post type: use cpt_rm for that.',
      rm: 'Stop registering a Loopress custom post type on WordPress. Its posts are kept in the database, hidden until the post type is pushed again.',
      rmTarget: 'The post type slug to remove, its cpt/ file name without .json (e.g. "book")',
    },
    pathNoun: 'cpt directory',
    resource: 'cpt',
    supportsRm: true,
    supportsRollback: true,
  })
}
