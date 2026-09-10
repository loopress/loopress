import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const forceFlag = z.boolean().optional().describe('Allow downgrades and take over plugins/themes installed outside Loopress')

// The server-side Composer run triggered by `lps composer push` can legitimately run for
// minutes (see cli's own SYNC_TIMEOUT_MS in utils/plugin-sync.ts); the default runLps timeout
// would kill it long before that ceiling is reached.
const COMPOSER_PUSH_TIMEOUT_MS = 620_000

export function registerComposerTools(server: McpServer): void {
  server.registerTool(
    'composer_push',
    {
      description:
        'Push composer.json to WordPress and run Composer there to resolve and install dependencies.' +
        PREVIEW_SUFFIX,
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, force: forceFlag},
    },
    async ({confirmToken, env, force}) => {
      const args = buildArgs(['composer', 'push'], {env})
      if (force) args.push('--force')
      return toCallToolResult(
        await runMutatingTool('composer_push', args, confirmToken, {timeoutMs: COMPOSER_PUSH_TIMEOUT_MS}),
      )
    },
  )

  server.registerTool(
    'composer_pull',
    {description: 'Pull composer.json/composer.lock from WordPress.', inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['composer', 'pull'], {env})))),
  )
}
