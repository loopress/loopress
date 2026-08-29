import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerApiTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List custom API route files currently on WordPress.',
      pull: 'Pull custom API route files from WordPress.',
      push: 'Push local custom API route files to WordPress.',
    },
    pathNoun: 'api directory',
    resource: 'api',
  })
}
