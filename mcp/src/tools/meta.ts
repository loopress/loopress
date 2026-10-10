import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerMetaTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List the meta keys registered for each post type on WordPress (register_post_meta()), and whether Loopress declares them.',
      pull: 'Pull the post meta keys Loopress manages on WordPress into meta/<post-type>.json files (each key mapped to its register_post_meta() arguments), never their values.',
      push: 'Push local meta/<post-type>.json meta keys to WordPress. Create or update only, never deletes, never touches meta values.',
      rm: 'Stop registering the Loopress meta keys of one post type on WordPress. Their values stay in the database.',
      rmTarget: 'The post type whose meta keys to remove, its meta/ file name without .json (e.g. "book")',
    },
    pathNoun: 'meta directory',
    resource: 'meta',
    supportsRm: true,
    supportsRollback: true,
  })
}
