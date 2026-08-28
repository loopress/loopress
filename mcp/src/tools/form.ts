import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const envFlag = z.string().optional().describe('Target environment by name, overriding the globally active one')
const pathArg = z.string().optional().describe('Path to the forms directory (overrides project config)')
const confirmTokenFlag = z.string().optional().describe('Token from a prior preview call of this same tool, to apply it for real')

export function registerFormTools(server: McpServer): void {
  server.registerTool(
    'form_push',
    {
      description:
        'Push local form files to WordPress. Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, path: pathArg},
    },
    async ({confirmToken, env, path}) =>
      toCallToolResult(await runMutatingTool('form_push', buildArgs(['form', 'push'], {env, path}), confirmToken)),
  )

  server.registerTool(
    'form_pull',
    {description: 'Pull forms from WordPress into local files.', inputSchema: {env: envFlag, path: pathArg}},
    async ({env, path}) => toCallToolResult(unwrap(await runLps(buildArgs(['form', 'pull'], {env, path})))),
  )

  server.registerTool(
    'form_list',
    {description: 'List forms currently on WordPress.', inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['form', 'list'], {env})))),
  )
}
