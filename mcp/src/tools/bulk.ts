import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const envFlag = z.string().optional().describe('Target environment by name, overriding the globally active one')
const confirmTokenFlag = z.string().optional().describe('Token from a prior preview call of this same tool, to apply it for real')

// `lps push`/`lps pull` fan out to eight resource commands in sequence, each doing its own
// Listr run over many files, so the default runLps timeout is too tight for a real site.
const BULK_TIMEOUT_MS = 600_000

export function registerBulkTools(server: McpServer): void {
  server.registerTool(
    'push_all',
    {
      description:
        'Push every local resource (plugins, composer, ACF, API routes, forms, pages, SEO, snippets) to WordPress in one run, the equivalent of `lps push`. Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag},
    },
    async ({confirmToken, env}) =>
      toCallToolResult(
        await runMutatingTool('push_all', buildArgs(['push'], {env}), confirmToken, {timeoutMs: BULK_TIMEOUT_MS}),
      ),
  )

  server.registerTool(
    'pull_all',
    {
      description:
        'Pull every resource (plugins, composer, ACF, API routes, forms, pages, SEO, snippets) from WordPress into local files in one run, the equivalent of `lps pull`.',
      inputSchema: {env: envFlag},
    },
    async ({env}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(['pull'], {env}), {timeoutMs: BULK_TIMEOUT_MS}))),
  )
}
