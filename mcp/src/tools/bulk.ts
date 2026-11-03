import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {CHANGES_SUFFIX, confirmTokenFlag, envFlag, overwriteFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

// `lps push`/`lps pull` fan out to a dozen resource commands in sequence, each doing its own
// Listr run over many files, so the default runLps timeout is too tight for a real site.
const BULK_TIMEOUT_MS = 600_000

// Mirrors the PUSH_TARGETS ids in cli/src/commands/push.ts, in push order.
const PUSH_RESOURCES = [
  'plugin',
  'composer',
  'cpt',
  'taxonomy',
  'meta',
  'role',
  'acf',
  'api',
  'hook',
  'block',
  'form',
  'pattern',
  'template',
  'theme-style',
  'page',
  'menu',
  'option',
  'snippet',
] as const

const pushResourceArray = z.array(z.enum(PUSH_RESOURCES)).optional()

export function registerBulkTools(server: McpServer): void {
  server.registerTool(
    'push',
    {
      description:
        'Push every local resource to WordPress in one run, the equivalent of `lps push`: plugins, composer dependencies, post types, taxonomies, post meta, roles, ACF, API routes, hooks, forms, patterns, templates and parts, Global Styles, pages, menus, options, and snippets. Global Styles, ACF, forms and snippets are skipped when the project does not use them (no Global Styles file, no directory), and Global Styles also on a classic theme. Templates and parts are skipped when the project has no template, part or CSS directory. On Loopress Light, what needs Full (plugins, composer, API routes, hooks, patterns, templates and parts, pages, snippets) is skipped when the project does not use it. When the project uses something the site cannot hold (no active plugin for it, or a Full feature on Light), the run refuses before pushing anything.' +
        PREVIEW_SUFFIX +
        CHANGES_SUFFIX +
        ' Each step is under `results` with its own preview in `result`.',
      inputSchema: {
        confirmToken: confirmTokenFlag,
        env: envFlag,
        only: pushResourceArray.describe('Only push these resources (template covers templates, parts and CSS)'),
        overwrite: overwriteFlag,
        skip: pushResourceArray.describe('Push every resource except these'),
      },
    },
    async ({confirmToken, env, only, overwrite, skip}) =>
      toCallToolResult(
        await runMutatingTool('push', buildArgs(['push'], {env, overwrite, repeatFlags: {only, skip}}), confirmToken, {timeoutMs: BULK_TIMEOUT_MS}),
      ),
  )

  server.registerTool(
    'pull',
    {
      description:
        'Pull every tracked resource from WordPress into local files in one run, the equivalent of `lps pull`: composer dependencies, plugins, post types, taxonomies, post meta, roles, ACF, API routes, hooks, forms, patterns, Global Styles, menus, options, and snippets. Global Styles only once the project tracks them, on a block theme. On Loopress Light, composer is always skipped, and the Full-only resources (API routes, hooks, patterns, snippets) are skipped when the project has no directory for them and fail when it does.',
      inputSchema: {env: envFlag},
    },
    async ({env}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(['pull'], {env}), {timeoutMs: BULK_TIMEOUT_MS}))),
  )
}
