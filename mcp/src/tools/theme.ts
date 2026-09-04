import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const THEME_PUSH_TIMEOUT_MS = 620_000

const forceFlag = z
  .boolean()
  .optional()
  .describe('Allow downgrades and take over themes installed outside Loopress')

export function registerThemeTools(server: McpServer): void {
  server.registerTool(
    'theme_push',
    {
      description:
        'Install/pin WordPress.org themes on the site to match loopress.json, via Composer + WPackagist. Never switches the active theme.' +
        PREVIEW_SUFFIX,
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, force: forceFlag},
    },
    async ({confirmToken, env, force}) => {
      const args = buildArgs(['theme', 'push'], {env})
      if (force) args.push('--force')
      return toCallToolResult(await runMutatingTool('theme_push', args, confirmToken, {timeoutMs: THEME_PUSH_TIMEOUT_MS}))
    },
  )

  server.registerTool(
    'theme_pull',
    {
      description: 'Pull installed themes from WordPress into loopress.json, pinned to their live versions.',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['theme', 'pull'], {env})))),
  )

  server.registerTool(
    'theme_status',
    {
      description: 'Report version drift between the themes on WordPress and loopress.json.',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['theme', 'status'], {env})))),
  )
}
