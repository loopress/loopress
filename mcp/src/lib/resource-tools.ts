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
  descriptions: {list: string; pull: string; push: string; rm?: string}
  // Noun dropped into the path arg's description, e.g. 'forms directory'.
  pathNoun: string
  // CLI topic and tool-name prefix: 'form' -> `lps form pull` and the `form_pull` tool.
  resource: string
  // api and hooks only: `push --prune` deletes server-side files with no local counterpart,
  // and a dedicated `<resource>_rm` tool removes one file. form and snippet have neither.
  supportsPrune?: boolean
  supportsRm?: boolean
}

// Registers push/pull/list for a directory-backed resource whose tools differ only in wording
// (api, hook, form, snippet). push runs through the confirmToken handshake; pull and list are
// plain reads; list takes no path. api and hook additionally get `prune` on push and a `rm`
// tool (supportsPrune / supportsRm). Resources with an extra flag (acf's `type`, seo's
// `post-type`) register their tools directly instead.
export function registerResourceTools(
  server: McpServer,
  {descriptions, pathNoun, resource, supportsPrune, supportsRm}: ResourceToolsSpec,
): void {
  const pathArg = z.string().optional().describe(`Path to the ${pathNoun} (overrides project config)`)

  if (supportsPrune) {
    server.registerTool(
      `${resource}_push`,
      {
        description: descriptions.push + PREVIEW_SUFFIX,
        inputSchema: {
          confirmToken: confirmTokenFlag,
          env: envFlag,
          path: pathArg,
          prune: z.boolean().optional().describe(`After pushing, delete server-side ${resource} files not present locally`),
        },
      },
      async ({confirmToken, env, path, prune}) => {
        const args = buildArgs([resource, 'push'], {env, path})
        // --yes: prune refuses to delete server-side files in a non-TTY (which the MCP server
        // always is) without it. The confirmToken handshake is the actual approval gate.
        if (prune) args.push('--prune', '--yes')
        return toCallToolResult(await runMutatingTool(`${resource}_push`, args, confirmToken))
      },
    )
  } else {
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
  }

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

  if (supportsRm) {
    server.registerTool(
      `${resource}_rm`,
      {
        description: (descriptions.rm ?? `Remove one ${resource} file from WordPress.`) + PREVIEW_SUFFIX,
        inputSchema: {
          confirmToken: confirmTokenFlag,
          env: envFlag,
          filename: z
            .string()
            .refine((value) => !value.startsWith('-'), 'must not start with "-"')
            .describe(`The ${resource} file slug to remove, without the .php extension (e.g. "hello")`),
        },
      },
      async ({confirmToken, env, filename}) => {
        // --yes for the same reason as prune above; the handshake is the approval gate.
        const args = [...buildArgs([resource, 'rm', filename], {env}), '--yes']
        return toCallToolResult(await runMutatingTool(`${resource}_rm`, args, confirmToken))
      },
    )
  }
}
