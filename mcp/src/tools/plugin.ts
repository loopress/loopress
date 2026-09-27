import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX, registerAddTool} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

// `lps plugin push` runs Composer + WPackagist on the site, which can take minutes on a cold
// install (see cli's SYNC_TIMEOUT_MS).
const PLUGIN_PUSH_TIMEOUT_MS = 620_000

const forceFlag = z
  .boolean()
  .optional()
  .describe('Allow downgrades and let Loopress take over plugins installed outside it (replaces their files)')

const pruneFlag = z
  .boolean()
  .optional()
  .describe('Deactivate plugins that are active on the site but absent from loopress.json (or composer.json)')

const activateFlag = z
  .boolean()
  .optional()
  .describe('composer.json projects only: activate every plugin it declares (by default they keep their current state)')

export function registerPluginTools(server: McpServer): void {
  registerAddTool(server, {exampleSlug: 'woocommerce', resource: 'plugin'})

  server.registerTool(
    'plugin_push',
    {
      description:
        'Install/pin WordPress.org plugins on the site to match loopress.json (active state included), via Composer + WPackagist. ' +
        'With a composer.json, pushes that whole file instead and activates nothing unless `activate` is set.' +
        PREVIEW_SUFFIX,
      inputSchema: {activate: activateFlag, confirmToken: confirmTokenFlag, env: envFlag, force: forceFlag, prune: pruneFlag},
    },
    async ({activate, confirmToken, env, force, prune}) => {
      const args = buildArgs(['plugin', 'push'], {env})
      if (activate) args.push('--activate')
      if (force) args.push('--force')
      if (prune) args.push('--prune')
      return toCallToolResult(
        await runMutatingTool('plugin_push', args, confirmToken, {timeoutMs: PLUGIN_PUSH_TIMEOUT_MS}),
      )
    },
  )

  server.registerTool(
    'plugin_pull',
    {
      description:
        'Pull installed plugins from WordPress into loopress.json, pinned to their live versions with their active state. ' +
        'With a composer.json, pins them there instead (constraints kept, plugins not on WordPress.org skipped).',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['plugin', 'pull'], {env})))),
  )

  server.registerTool(
    'plugin_status',
    {
      description: 'Report drift between the plugins on WordPress and loopress.json (missing, wrong version, inactive, untracked).',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['plugin', 'status'], {env})))),
  )

  server.registerTool(
    'plugin_audit',
    {
      description: 'Check the plugins in loopress.json for known vulnerabilities (wpvulnerability.net) and health issues.',
      inputSchema: {},
    },
    async () => toCallToolResult(unwrap(await runLps(['plugin', 'audit']))),
  )
}
