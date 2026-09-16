import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {buildArgs} from '../lib/build-args.js'
import {envFlag} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

export function registerDoctorTools(server: McpServer): void {
  server.registerTool(
    'project_doctor',
    {
      description:
        'Diagnose connectivity, plugin and credential problems for the targeted WordPress environment: whether the site is reachable, the Loopress plugin is installed, and the stored credentials are accepted.',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['doctor'], {env})))),
  )
}
