import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

type HtmlResource = {
  // The CLI topic: templates live under `lps theme template`.
  command: string[]
  descriptions: {diff: string; list: string; push: string}
  kind: 'page' | 'template'
  // Pages push one by slug; templates and parts always push whole (the child theme mirrors them).
  slugExample?: string
}

// Pages and block templates share one shape: flat folders of <slug>.html files.
const RESOURCES: HtmlResource[] = [
  {
    command: ['page'],
    descriptions: {
      diff: 'Show what differs (HTML, title, status) between the local pages/ directory and the static pages on WordPress.',
      list: 'List the static pages managed by Loopress on WordPress (slug, status, URL).',
      push: 'Push local static HTML pages (pages/<slug>.html) to WordPress, or only one when slug is given. The status header (draft or publish) is applied on every push.',
    },
    kind: 'page',
    slugExample: 'legal-notice',
  },
  {
    command: ['theme', 'template'],
    descriptions: {
      diff: 'Show what differs between the local theme/templates/ and theme/parts/ directories and the Loopress child theme on WordPress, including templates and parts edited in the Site Editor.',
      list: 'Show the Loopress child theme of the active block theme: whether it is active, its templates and parts, and those edited in the Site Editor.',
      push: 'Push local block templates (theme/templates/<slug>.html) and template parts (theme/parts/<slug>.html) as the files of the child theme <parent>-loopress, mirroring them. The child is never activated.',
    },
    kind: 'template',
  },
]

// Not registerResourceTools: no directory path argument, no pull yet, and both have a diff tool.
export function registerPageTools(server: McpServer): void {
  for (const {command, descriptions, kind, slugExample} of RESOURCES) {
    server.registerTool(
      `${kind}_push`,
      {
        description: descriptions.push + PREVIEW_SUFFIX,
        inputSchema: {
          confirmToken: confirmTokenFlag,
          env: envFlag,
          ...(slugExample === undefined
            ? {}
            : {
                slug: z
                  .string()
                  // Same pattern as the CLI's file names, which also keeps it from reading as a flag.
                  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase letters and digits separated by single hyphens')
                  .optional()
                  .describe(`Push only this ${kind}, its file name without .html (e.g. "${slugExample}")`),
              }),
        },
      },
      async ({confirmToken, env, slug}: {confirmToken?: string; env?: string; slug?: string}) =>
        toCallToolResult(await runMutatingTool(`${kind}_push`, buildArgs(slug ? [...command, 'push', slug] : [...command, 'push'], {env}), confirmToken)),
    )

    server.registerTool(
      `${kind}_list`,
      {description: descriptions.list, inputSchema: {env: envFlag}},
      async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs([...command, 'list'], {env})))),
    )

    server.registerTool(
      `${kind}_diff`,
      {description: descriptions.diff, inputSchema: {env: envFlag}},
      async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs([...command, 'diff'], {env})))),
    )
  }
}
