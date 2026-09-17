import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {envFlag} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

// Mirrors RESOURCES in cli/src/commands/diff.ts.
const RESOURCES = ['snippet', 'form', 'acf', 'api', 'hook', 'seo', 'menu', 'option', 'theme-styles', 'composer'] as const

const resourceArray = z.array(z.enum(RESOURCES)).optional()

export function registerDiffTools(server: McpServer): void {
  server.registerTool(
    'project_diff',
    {
      description:
        'Show what differs between local tracked files and a WordPress environment, or between two environments. Covers snippets, forms, ACF, API routes, hooks, SEO, menus, options, theme styles and Composer. Plugins and themes have their own plugin_status / theme_status.',
      inputSchema: {
        against: z
          .string()
          .optional()
          .describe('Compare the targeted environment against this second environment instead of against local files'),
        env: envFlag,
        only: resourceArray.describe('Only compare these resources'),
        skip: resourceArray.describe('Compare every resource except these'),
      },
    },
    async ({against, env, only, skip}) => {
      const args = buildArgs(['diff'], {env, repeatFlags: {only, skip}})
      if (against) args.push('--against', against)
      return toCallToolResult(unwrap(await runLps(args)))
    },
  )
}
