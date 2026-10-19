import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerMetaTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List the meta keys registered for each post type on WordPress (with register_post_meta()), and whether Loopress declares them. Only Loopress ones are pulled and pushed.',
      pull: 'Pull the post meta keys Loopress manages on WordPress into meta/<post-type>.json files, never their values. Keys registered by a theme or another plugin are never pulled, see meta_list.',
      push: 'Push local post meta keys (meta/<post-type>.json, each key mapped to its register_post_meta() arguments) to WordPress. Create or update only, never deletes (use meta_rm), never touches meta values.',
      rm: 'Stop registering the Loopress meta keys of one post type (its meta/<post-type>.json file) on WordPress. Their values are kept in the database.',
      rmTarget: 'The post type whose meta keys to remove, its meta/ file name without .json (e.g. "book")',
    },
    pathNoun: 'meta directory',
    resource: 'meta',
    supportsRm: true,
    supportsRollback: true,
  })
}
