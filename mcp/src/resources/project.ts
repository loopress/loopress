import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

// Reads loopress.json directly instead of shelling out: it's a static local file, not a WordPress
// operation, so there is no CLI business logic to reuse here (unlike the tools in ../tools/).
export function registerProjectResources(server: McpServer): void {
  server.registerResource(
    'project-config',
    'loopress://project/config',
    {description: "This project's loopress.json", mimeType: 'application/json'},
    async (uri) => {
      const path = join(process.cwd(), 'loopress.json')

      let text: string
      try {
        text = await readFile(path, 'utf8')
      } catch {
        text = JSON.stringify({
          error: {message: `No loopress.json found at ${path}. Run \`lps project config\` first.`, name: 'NO_PROJECT_CONFIG'},
        })
      }

      return {contents: [{mimeType: 'application/json', text, uri: uri.href}]}
    },
  )
}
