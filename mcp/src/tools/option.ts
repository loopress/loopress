import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX, registerResourceTools} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const nameArg = z.string().describe('Option name (see option_list to find it)')

export function registerOptionTools(server: McpServer): void {
  registerResourceTools(server, {
    descriptions: {
      list: 'List WordPress option names and autoload flags currently on the site (names only, never values). Use this to find the name to track with option_add.',
      pull: 'Refresh locally tracked options from WordPress. Options not yet tracked are never pulled, use option_add for those first.',
      push: 'Push locally tracked, non-readonly options to WordPress (upsert only). Options marked readonly in their local file are skipped.',
    },
    pathNoun: 'options directory',
    resource: 'option',
  })

  server.registerTool(
    'option_add',
    {
      description:
        'Fetch a WordPress option by name and start tracking it locally (writes a local file, no change to WordPress). ' +
        'This copies a raw value: verify it does not embed post/user IDs before pushing it to another environment.',
      inputSchema: {env: envFlag, name: nameArg},
    },
    async ({env, name}) => toCallToolResult(unwrap(await runLps(buildArgs(['option', 'add', name], {env})))),
  )

  server.registerTool(
    'option_remove',
    {
      description:
        'Stop tracking an option locally and delete it from WordPress.' +
        PREVIEW_SUFFIX,
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, name: nameArg},
    },
    async ({confirmToken, env, name}) =>
      toCallToolResult(await runMutatingTool('option_remove', buildArgs(['option', 'remove', name], {env}), confirmToken)),
  )
}
