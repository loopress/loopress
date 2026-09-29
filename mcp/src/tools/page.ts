import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

type HtmlResource = {
  descriptions: {diff: string; list: string; push: string}
  kind: 'page' | 'template'
  slugExample: string
}

// Pages and custom block templates share one shape: a flat folder of <slug>.html pushed by slug.
const RESOURCES: HtmlResource[] = [
  {
    descriptions: {
      diff: 'Show what differs (HTML, title, status) between the local pages/ directory and the static pages on WordPress.',
      list: 'List the static pages managed by Loopress on WordPress (slug, status, URL).',
      push: 'Push local static HTML pages (pages/<slug>.html) to WordPress, or only one when slug is given. The status header (draft or publish) is applied on every push.',
    },
    kind: 'page',
    slugExample: 'legal-notice',
  },
  {
    descriptions: {
      diff: 'Show what differs (markup, title) between the local templates/ directory and the custom block templates managed by Loopress on WordPress.',
      list: 'List the custom block templates managed by Loopress in the active theme (slug, title).',
      push: 'Push local custom block templates (templates/<slug>.html) to the active block theme, or only one when slug is given. A static page uses one with its template header.',
    },
    kind: 'template',
    slugExample: 'landing',
  },
]

// Not registerResourceTools: `lps page push` / `lps template push` take a slug rather than a
// directory path, there is no pull yet, and both have a diff tool.
export function registerPageTools(server: McpServer): void {
  for (const {descriptions, kind, slugExample} of RESOURCES) {
    server.registerTool(
      `${kind}_push`,
      {
        description: descriptions.push + PREVIEW_SUFFIX,
        inputSchema: {
          confirmToken: confirmTokenFlag,
          env: envFlag,
          slug: z
            .string()
            // Same pattern as the CLI's file names, which also keeps it from reading as a flag.
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase letters and digits separated by single hyphens')
            .optional()
            .describe(`Push only this ${kind}, its file name without .html (e.g. "${slugExample}")`),
        },
      },
      async ({confirmToken, env, slug}) =>
        toCallToolResult(await runMutatingTool(`${kind}_push`, buildArgs(slug ? [kind, 'push', slug] : [kind, 'push'], {env}), confirmToken)),
    )

    server.registerTool(
      `${kind}_list`,
      {description: descriptions.list, inputSchema: {env: envFlag}},
      async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs([kind, 'list'], {env})))),
    )

    server.registerTool(
      `${kind}_diff`,
      {description: descriptions.diff, inputSchema: {env: envFlag}},
      async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs([kind, 'diff'], {env})))),
    )
  }
}
