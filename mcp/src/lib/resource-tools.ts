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
  // Every resource-state-backed resource (see cli's resource-state.ts) gets a `<resource>_rollback`
  // tool mirroring `lps <resource> rollback`; app/plugin/theme/composer don't have one (no
  // `lps <resource> push` snapshot to roll back to).
  supportsRollback?: boolean
  supportsRm?: boolean
}

// Registers `<resource>_rollback`: restores the snapshot `<resource>_push` automatically saved
// right before an earlier real push, or (with `list`) just lists what's available. Shared by
// registerResourceTools below and by the resources that register their other tools directly
// (acf, seo, option, theme-styles), since rollback's shape never varies with their extra flags.
export function registerRollbackTool(
  server: McpServer,
  {pathNoun, resource, toolName = resource}: {pathNoun: string; resource: string; toolName?: string},
): void {
  const pathArg = z.string().optional().describe(`Path to the ${pathNoun} (overrides project config)`)

  server.registerTool(
    `${toolName}_rollback`,
    {
      description:
        `Restore this resource to the snapshot automatically saved right before an earlier \`${toolName}_push\`. ` +
        'Pass list: true to see available snapshots (their id, timestamp, and environment) instead of rolling back. ' +
        'Only safe when nothing else has changed the environment since that push: the preview result includes a `drift` field (added/changed/removed) whenever it has, review it before confirming. ' +
        "If the environment changes again between the preview and the confirmed call, the confirm is refused (a stale-preview error) instead of silently overwriting that later change; call again without confirmToken for a fresh preview." +
        PREVIEW_SUFFIX,
      inputSchema: {
        confirmToken: confirmTokenFlag,
        env: envFlag,
        list: z.boolean().optional().describe('List available snapshots instead of rolling back'),
        path: pathArg,
        to: z.string().optional().describe('Roll back to this snapshot id instead of the most recent one (see list: true)'),
      },
    },
    async ({confirmToken, env, list, path, to}) => {
      const args = buildArgs([resource, 'rollback'], {env, path})

      if (list) {
        args.push('--list')
        return toCallToolResult(unwrap(await runLps(args)))
      }

      if (to) args.push('--to', to)
      // --yes: the confirmToken handshake below is the actual approval gate, same reasoning as
      // prune/rm above.
      args.push('--yes')
      return toCallToolResult(await runMutatingTool(`${toolName}_rollback`, args, confirmToken))
    },
  )
}

// Registers `<resource>_add`: pins a WordPress.org plugin or theme (the only two resources with
// one) into loopress.json, writing no change to WordPress itself. Shared by plugin.ts and
// theme.ts, whose add tools differ only in wording and the example slug.
export function registerAddTool(server: McpServer, {exampleSlug, resource}: {exampleSlug: string; resource: string}): void {
  server.registerTool(
    `${resource}_add`,
    {
      description:
        `Add a WordPress.org ${resource} to loopress.json, or change its pinned version (writes loopress.json only, no change to WordPress). ` +
        `Run ${resource}_push afterwards to install it on the site.`,
      inputSchema: {
        // Leading character can't be "-": the slug is a positional CLI argument, never a flag.
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a WordPress.org slug').describe(`${resource[0].toUpperCase()}${resource.slice(1)} slug on WordPress.org (e.g. "${exampleSlug}")`),
        version: z.string().optional().describe('Exact version to pin (e.g. "3.4.0"); omit for "latest"'),
      },
    },
    async ({slug, version}) => {
      const args = [resource, 'add', slug]
      if (version) args.push('--version', version)
      return toCallToolResult(unwrap(await runLps(args)))
    },
  )
}

// Registers push/pull/list for a directory-backed resource whose tools differ only in wording
// (api, hook, form, snippet). push runs through the confirmToken handshake; pull and list are
// plain reads; list takes no path. api and hook additionally get `prune` on push and a `rm`
// tool (supportsPrune / supportsRm). Resources with an extra flag (acf's `type`, seo's
// `post-type`) register their tools directly instead.
export function registerResourceTools(
  server: McpServer,
  {descriptions, pathNoun, resource, supportsPrune, supportsRm, supportsRollback}: ResourceToolsSpec,
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

  if (supportsRollback) registerRollbackTool(server, {pathNoun, resource})
}
