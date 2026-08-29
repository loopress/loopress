import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerSnippetTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List snippets currently on WordPress.',
      pull: 'Pull snippets from WordPress into local files.',
      push: 'Push local snippet files to WordPress.',
    },
    pathNoun: 'snippets directory',
    resource: 'snippet',
  })
}
