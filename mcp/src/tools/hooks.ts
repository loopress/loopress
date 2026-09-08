import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerHookTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List hook files (WordPress actions, filters, and cron jobs) currently on WordPress.',
      pull: 'Pull hook files from WordPress.',
      push: 'Push local hook files to WordPress.',
    },
    pathNoun: 'hooks directory',
    resource: 'hook',
  })
}
