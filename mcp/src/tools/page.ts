import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerPageTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List pages currently on WordPress.',
      pull: 'Pull pages from WordPress into local files.',
      push: 'Push local page files to WordPress.',
    },
    pathNoun: 'pages directory',
    resource: 'page',
  })
}
