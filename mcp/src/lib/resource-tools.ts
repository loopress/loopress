import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from './build-args.js'
import {runMutatingTool} from './mutating-tool.js'
import {runLps} from './run-lps.js'
import {toCallToolResult, unwrap} from './tool-result.js'

// Identical wording in every resource tool file.
export const envFlag = z.string().optional().describe('Target environment by name, overriding the globally active one')
export const confirmTokenFlag = z
  .string()
  .optional()
  .describe('Token from a prior preview call of this same tool, to apply it for real')

// Every `*_push` tool's description ends with this two-call handshake note, verbatim.
export const PREVIEW_SUFFIX =
  ' Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.'

type ResourceToolsSpec = {
  descriptions: {list: string; pull: string; push: string}
  // Noun dropped into the path arg's description, e.g. 'forms directory'.
  pathNoun: string
  // CLI topic and tool-name prefix: 'form' -> `lps form pull` and the `form_pull` tool.
  resource: string
}

// Registers push/pull/list for a directory-backed resource whose three tools differ only in
// wording (api, form, page, snippet). push runs through the confirmToken handshake; pull and
// list are plain reads; list takes no path. Resources with an extra flag (acf's `type`, seo's
// `post-type`) register their tools directly instead.
export function registerResourceTools(server: McpServer, {descriptions, pathNoun, resource}: ResourceToolsSpec): void {
  const pathArg = z.string().optional().describe(`Path to the ${pathNoun} (overrides project config)`)

  server.registerTool(
    `${resource}_push`,
    {
      description: descriptions.push + PREVIEW_SUFFIX,
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, path: pathArg},
    },
    async ({confirmToken, env, path}) =>
      toCallToolResult(
        await runMutatingTool(`${resource}_push`, buildArgs([resource, 'push'], {env, path}), confirmToken),
      ),
  )

  server.registerTool(
    `${resource}_pull`,
    {description: descriptions.pull, inputSchema: {env: envFlag, path: pathArg}},
    async ({env, path}) => toCallToolResult(unwrap(await runLps(buildArgs([resource, 'pull'], {env, path})))),
  )

  server.registerTool(
    `${resource}_list`,
    {description: descriptions.list, inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs([resource, 'list'], {env})))),
  )
}
