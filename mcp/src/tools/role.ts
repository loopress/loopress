import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerRoleTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List every user role on WordPress, where it comes from (Loopress, WordPress, a plugin) and how many users have it.',
      pull: 'Pull the roles Loopress manages on WordPress into roles/<slug>.json files ("name" and "capabilities").',
      push: 'Push local roles/<slug>.json roles to WordPress. Create or update only, never deletes a role, never changes which users have it.',
      rm: 'Stop registering one Loopress role on WordPress. Its users keep it in their profile, with no capability until it is pushed again.',
      rmTarget: 'The role slug to remove, its roles/ file name without .json (e.g. "client")',
    },
    pathNoun: 'roles directory',
    resource: 'role',
    supportsRm: true,
    supportsRollback: true,
  })
}
