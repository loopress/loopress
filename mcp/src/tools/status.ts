import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

export function registerStatusTools(server: McpServer): void {
  server.registerTool(
    'project_status',
    {
      description: 'Show which WordPress project and environment the other tools will target.',
      inputSchema: {env: z.string().optional().describe('Show what would be targeted with this environment override')},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(env ? ['status', '--env', env] : ['status']))),
  )
}
