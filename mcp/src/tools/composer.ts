import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const envFlag = z.string().optional().describe('Target environment by name, overriding the globally active one')
const confirmTokenFlag = z.string().optional().describe('Token from a prior preview call of this same tool, to apply it for real')

export function registerComposerTools(server: McpServer): void {
  server.registerTool(
    'composer_push',
    {
      description:
        'Push composer.json/composer.lock to WordPress and run composer install there. Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag},
    },
    async ({confirmToken, env}) =>
      toCallToolResult(await runMutatingTool('composer_push', buildArgs(['composer', 'push'], {env}), confirmToken)),
  )

  server.registerTool(
    'composer_pull',
    {description: 'Pull composer.json/composer.lock from WordPress.', inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['composer', 'pull'], {env})))),
  )
}
