import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

export function registerValidateTools(server: McpServer): void {
  server.registerTool(
    'validate_local',
    {
      description: 'Check local tracked files are well formed and push-ready, without contacting WordPress.',
      inputSchema: {},
    },
    async () => toCallToolResult(unwrap(await runLps(['validate']))),
  )
}
