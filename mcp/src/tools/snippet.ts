import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const envFlag = z.string().optional().describe('Target environment by name, overriding the globally active one')
const pathArg = z.string().optional().describe('Path to the snippets directory (overrides project config)')
const confirmTokenFlag = z.string().optional().describe('Token from a prior preview call of this same tool, to apply it for real')

export function registerSnippetTools(server: McpServer): void {
  server.registerTool(
    'snippet_push',
    {
      description:
        'Push local snippet files to WordPress. Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, path: pathArg},
    },
    async ({confirmToken, env, path}) =>
      toCallToolResult(await runMutatingTool('snippet_push', buildArgs(['snippet', 'push'], {env, path}), confirmToken)),
  )

  server.registerTool(
    'snippet_pull',
    {description: 'Pull snippets from WordPress into local files.', inputSchema: {env: envFlag, path: pathArg}},
    async ({env, path}) => toCallToolResult(unwrap(await runLps(buildArgs(['snippet', 'pull'], {env, path})))),
  )

  server.registerTool(
    'snippet_list',
    {description: 'List snippets currently on WordPress.', inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['snippet', 'list'], {env})))),
  )
}
