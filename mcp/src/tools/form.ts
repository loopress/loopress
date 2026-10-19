import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerFormTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List forms currently on WordPress.',
      pull: 'Pull forms from WordPress into local files.',
      push: 'Push local form files to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>.json` convention.',
    },
    pathNoun: 'forms directory',
    resource: 'form',
    supportsRollback: true,
  })
}
