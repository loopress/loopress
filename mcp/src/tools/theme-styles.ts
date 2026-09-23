import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX, registerRollbackTool} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const pathArg = z.string().optional().describe('Path to the theme styles directory (overrides project config)')

export function registerThemeStylesTools(server: McpServer): void {
  server.registerTool(
    'theme_styles_push',
    {
      description:
        "Push the local Global Styles file to the active block theme's Site Editor > Styles on WordPress. Only supports block themes (Full Site Editing)." +
        PREVIEW_SUFFIX,
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, path: pathArg},
    },
    async ({confirmToken, env, path}) =>
      toCallToolResult(await runMutatingTool('theme_styles_push', buildArgs(['theme-styles', 'push'], {env, path}), confirmToken)),
  )

  server.registerTool(
    'theme_styles_pull',
    {
      description:
        "Pull the active block theme's Global Styles customizations (Site Editor > Styles: colors, typography, spacing) from WordPress into a local file. Only supports block themes (Full Site Editing).",
      inputSchema: {env: envFlag, path: pathArg},
    },
    async ({env, path}) => toCallToolResult(unwrap(await runLps(buildArgs(['theme-styles', 'pull'], {env, path})))),
  )

  registerRollbackTool(server, {pathNoun: 'theme styles directory', resource: 'theme-styles', toolName: 'theme_styles'})
}
