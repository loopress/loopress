import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const envFlag = z.string().optional().describe('Target environment by name, overriding the globally active one')
const confirmTokenFlag = z.string().optional().describe('Token from a prior preview call of this same tool, to apply it for real')

export function registerPluginTools(server: McpServer): void {
  server.registerTool(
    'plugin_push',
    {
      description:
        'Install/activate WordPress.org plugins on the site to match loopress.json. Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag},
    },
    async ({confirmToken, env}) =>
      toCallToolResult(await runMutatingTool('plugin_push', buildArgs(['plugin', 'push'], {env}), confirmToken)),
  )

  server.registerTool(
    'plugin_pull',
    {description: 'Pull installed plugins from WordPress into loopress.json.', inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['plugin', 'pull'], {env})))),
  )
}
