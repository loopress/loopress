import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {CHANGES_SUFFIX, confirmTokenFlag, envFlag, overwriteFlag, PREVIEW_SUFFIX, registerRollbackTool} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const pathArg = z.string().optional().describe('Path to the ACF directory (overrides project config)')
const typeFlag = z
  .array(z.enum(['field-groups', 'post-types', 'taxonomies', 'options-pages']))
  .optional()
  .describe('Limit to specific ACF object types (defaults to all of them)')

export function registerAcfTools(server: McpServer): void {
  server.registerTool(
    'acf_push',
    {
      description:
        'Push local ACF field groups, post types, taxonomies, and options pages to WordPress.' +
        PREVIEW_SUFFIX +
        CHANGES_SUFFIX +
        ' Ids are `<type>/<key>` (e.g. `field-groups/group_product`), and a changed field group also names its top-level fields under `fields` (added, changed, removed).',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, overwrite: overwriteFlag, path: pathArg, type: typeFlag},
    },
    async ({confirmToken, env, overwrite, path, type}) =>
      toCallToolResult(
        await runMutatingTool('acf_push', buildArgs(['acf', 'push'], {env, overwrite, path, repeatFlags: {type}}), confirmToken),
      ),
  )

  server.registerTool(
    'acf_pull',
    {
      description: 'Pull ACF field groups, post types, taxonomies, and options pages from WordPress into local files.',
      inputSchema: {env: envFlag, path: pathArg, type: typeFlag},
    },
    async ({env, path, type}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(['acf', 'pull'], {env, path, repeatFlags: {type}})))),
  )

  server.registerTool(
    'acf_list',
    {
      description: 'List ACF field groups, post types, taxonomies, and options pages currently on WordPress.',
      inputSchema: {env: envFlag, type: typeFlag},
    },
    async ({env, type}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(['acf', 'list'], {env, repeatFlags: {type}})))),
  )

  registerRollbackTool(server, {pathNoun: 'ACF directory', resource: 'acf'})
}
