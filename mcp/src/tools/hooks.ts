import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerHookTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List hook files (actions, filters, cron) currently on WordPress.',
      pull: 'Pull hook files (actions, filters, cron) from WordPress into local files.',
      push: 'Push local hook files (actions, filters, cron) to WordPress.',
      rm: 'Remove one hook file (action, filter, cron) from WordPress.',
    },
    pathNoun: 'hooks directory',
    resource: 'hook',
    supportsPrune: true,
    supportsRm: true,
    supportsRollback: true,
  })
}
