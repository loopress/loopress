import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {registerResourceTools} from '../lib/resource-tools.js'

export function registerBlockTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List the dynamic blocks Loopress registers on WordPress (loopress/<slug>), with their load and render errors.',
      pull: 'Pull the dynamic blocks Loopress registers on WordPress into blocks/<slug>/ folders.',
      push: 'Push local dynamic blocks (blocks/<slug>/ holding block.json, render.php, and optionally style.css and view.js) to WordPress, registered as loopress/<slug> and placed with <!-- wp:loopress/<slug> /-->. Create or update only, never deletes a block (use block_rm).',
      rm: 'Remove a dynamic block from WordPress. A <!-- wp:loopress/<slug> /--> left in a page or template renders nothing until it is pushed again.',
      rmTarget: 'The block slug to remove, its blocks/ folder name (e.g. "hero")',
    },
    pathNoun: 'blocks directory',
    resource: 'block',
    supportsRm: true,
    supportsRollback: true,
  })
}
