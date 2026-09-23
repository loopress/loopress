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
    'theme_add',
    {
      description:
        'Add a WordPress.org theme to loopress.json, or change its pinned version (writes loopress.json only, no change to WordPress). ' +
        'Run theme_push afterwards to install it on the site.',
      inputSchema: {
        // Leading character can't be "-": the slug is a positional CLI argument, never a flag.
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a WordPress.org slug').describe('Theme slug on WordPress.org (e.g. "generatepress")'),
        version: z.string().optional().describe('Exact version to pin (e.g. "3.4.0"); omit for "latest"'),
      },
    },
    async ({slug, version}) => {
      const args = ['theme', 'add', slug]
      if (version) args.push('--version', version)
      return toCallToolResult(unwrap(await runLps(args)))
    },
  )

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
