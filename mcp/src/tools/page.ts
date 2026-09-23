import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

// Not registerResourceTools: `lps page push` takes a page slug rather than a directory path,
// there is no `page pull` yet, and pages have a diff tool.
export function registerPageTools(server: McpServer): void {
  server.registerTool(
    'page_push',
    {
      description:
        'Push local static HTML pages (pages/<slug>.html) to WordPress, or only one when slug is given. The status header (draft or publish) is applied on every push.' +
        PREVIEW_SUFFIX,
      inputSchema: {
        confirmToken: confirmTokenFlag,
        env: envFlag,
        slug: z
          .string()
          // Same pattern as the CLI's page file names, which also keeps it from reading as a flag.
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase letters and digits separated by single hyphens')
          .optional()
          .describe('Push only this page, its file name without .html (e.g. "legal-notice")'),
      },
    },
    async ({confirmToken, env, slug}) =>
      toCallToolResult(await runMutatingTool('page_push', buildArgs(slug ? ['page', 'push', slug] : ['page', 'push'], {env}), confirmToken)),
  )

  server.registerTool(
    'page_list',
    {description: 'List the static pages managed by Loopress on WordPress (slug, status, URL).', inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['page', 'list'], {env})))),
  )

  server.registerTool(
    'page_diff',
    {
      description: 'Show what differs (HTML, title, status) between the local pages/ directory and the static pages on WordPress.',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['page', 'diff'], {env})))),
  )
}
