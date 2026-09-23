import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerMenuTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List nav menus and the active theme menu locations currently on WordPress.',
      pull: 'Pull nav menus and the active theme menu locations from WordPress into local files.',
      push:
        "Push local nav menus and the active theme menu locations to WordPress. Each menu's post_type/taxonomy items are resolved by slug on the target environment, never by a raw id.",
    },
    pathNoun: 'menus directory',
    resource: 'menu',
    supportsRollback: true,
  })
}
