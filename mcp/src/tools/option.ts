import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const pathArg = z.string().optional().describe('Path to the options directory (overrides project config)')
const nameArg = z.string().describe('Option name (see option_list to find it)')
const noCoreFlag = z.boolean().optional().describe('Hide WordPress-native default options from the result')

// Registered directly, not via registerResourceTools (see seo.ts for the same reason): list
// takes an extra flag (noCore) the shared helper's shape doesn't support.
export function registerOptionTools(server: McpServer): void {
  server.registerTool(
    'option_push',
    {
      description:
        'Push locally tracked, non-readonly options to WordPress (upsert only). Options marked readonly in their local file are skipped.' +
        PREVIEW_SUFFIX,
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, path: pathArg},
    },
    async ({confirmToken, env, path}) =>
      toCallToolResult(await runMutatingTool('option_push', buildArgs(['option', 'push'], {env, path}), confirmToken)),
  )

  server.registerTool(
    'option_pull',
    {
      description: 'Refresh locally tracked options from WordPress. Options not yet tracked are never pulled, use option_add for those first.',
      inputSchema: {env: envFlag, path: pathArg},
    },
    async ({env, path}) => toCallToolResult(unwrap(await runLps(buildArgs(['option', 'pull'], {env, path})))),
  )

  server.registerTool(
    'option_list',
    {
      description:
        'List WordPress option names and autoload flags currently on the site (names only, never values). ' +
        'Always scans active plugins\' own PHP source for names the naming guess missed (roughly 1-3s on a real site). ' +
        'CORE flags a WordPress-native default (certain); SOURCE? is a best-effort guessed plugin slug ' +
        '(uncertain unless confirmed, occasionally wrong or blank, never trust it over CORE); PLUGIN is that slug\'s own ' +
        'declared display name, a label only. Use this to find the name to track with option_add.',
      inputSchema: {env: envFlag, noCore: noCoreFlag},
    },
    async ({env, noCore}) => {
      const args = buildArgs(['option', 'list'], {env})
      if (noCore) args.push('--no-core')
      return toCallToolResult(unwrap(await runLps(args)))
    },
  )

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
      description: 'Stop tracking an option locally and delete it from WordPress.' + PREVIEW_SUFFIX,
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, name: nameArg},
    },
    async ({confirmToken, env, name}) =>
      toCallToolResult(await runMutatingTool('option_remove', buildArgs(['option', 'remove', name], {env}), confirmToken)),
  )
}
