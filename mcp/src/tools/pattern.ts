import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerPatternTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List the block patterns registered on WordPress by Loopress, the theme and plugins (not WordPress core). Only Loopress ones are pulled and pushed.',
      pull: 'Pull the block patterns Loopress manages on WordPress into patterns/<slug>.html files. Patterns registered by the theme or a plugin are never pulled, see pattern_list.',
      push: 'Push local block patterns (patterns/<slug>.html, block markup under a title/categories header) to WordPress, registered as loopress/<slug> and referenced with <!-- wp:pattern {"slug":"loopress/<slug>"} /-->. Create or update only, never deletes a pattern (use pattern_rm).',
      rm: 'Stop registering a Loopress block pattern on WordPress. A wp:pattern reference to it renders nothing until it is pushed again, copies already inserted in posts stay.',
      rmTarget: 'The pattern slug to remove, its patterns/ file name without .html (e.g. "hero")',
    },
    pathNoun: 'patterns directory',
    resource: 'pattern',
    supportsRm: true,
    supportsRollback: true,
  })
}
