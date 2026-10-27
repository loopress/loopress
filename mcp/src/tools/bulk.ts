import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {CHANGES_SUFFIX, confirmTokenFlag, envFlag, overwriteFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

// `lps push`/`lps pull` fan out to a dozen resource commands in sequence, each doing its own
// Listr run over many files, so the default runLps timeout is too tight for a real site.
const BULK_TIMEOUT_MS = 600_000

export function registerBulkTools(server: McpServer): void {
  server.registerTool(
    'push_all',
    {
      description:
        'Push every local resource to WordPress in one run, the equivalent of `lps push`: plugins, composer dependencies, post types, taxonomies, post meta, roles, ACF, API routes, hooks, forms, patterns, templates and parts, Global Styles, pages, menus, options, and snippets. Global Styles, ACF, forms and snippets are skipped when the project does not use them (no Global Styles file, no directory), and Global Styles also on a classic theme. When the project uses ACF, forms or snippets the site cannot hold (no active plugin for them), the run refuses before pushing anything.' +
        PREVIEW_SUFFIX +
        CHANGES_SUFFIX +
        ' Each step is under `results` with its own preview in `result`.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, overwrite: overwriteFlag},
    },
    async ({confirmToken, env, overwrite}) =>
      toCallToolResult(
        await runMutatingTool('push_all', buildArgs(['push'], {env, overwrite}), confirmToken, {timeoutMs: BULK_TIMEOUT_MS}),
      ),
  )

  server.registerTool(
    'pull_all',
    {
      description:
        'Pull every tracked resource from WordPress into local files in one run, the equivalent of `lps pull`: composer dependencies, plugins, post types, taxonomies, post meta, roles, ACF, API routes, hooks, forms, patterns, Global Styles, menus, options, and snippets. Global Styles only once the project tracks them, on a block theme.',
      inputSchema: {env: envFlag},
    },
    async ({env}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(['pull'], {env}), {timeoutMs: BULK_TIMEOUT_MS}))),
  )
}
