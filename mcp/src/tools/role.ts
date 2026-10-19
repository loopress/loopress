import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerRoleTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List the user roles on WordPress, where each comes from (Loopress, WordPress, a plugin) and how many users have it. Only Loopress ones are pulled and pushed.',
      pull: 'Pull the roles Loopress manages on WordPress into roles/<slug>.json files. Built-in roles and roles created by a plugin are never pulled, see role_list.',
      push: 'Push local roles (roles/<slug>.json, a "name" and its "capabilities") to WordPress. Create or update only, never deletes a role (use role_rm), never changes which users have it.',
      rm: 'Stop registering a Loopress role on WordPress. Its users keep it in their profile, with no capability until the role is pushed again.',
      rmTarget: 'The role slug to remove, its roles/ file name without .json (e.g. "client")',
    },
    pathNoun: 'roles directory',
    resource: 'role',
    supportsRm: true,
    supportsRollback: true,
  })
}
