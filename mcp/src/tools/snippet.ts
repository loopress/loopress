import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerSnippetTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List snippets currently on WordPress.',
      pull: 'Pull snippets from WordPress into local files.',
      push: 'Push local snippet files to WordPress. Local snippet files created or updated remotely are renamed on disk to the `<id>-<slug>` convention.',
    },
    pathNoun: 'snippets directory',
    resource: 'snippet',
    supportsRollback: true,
  })
}
