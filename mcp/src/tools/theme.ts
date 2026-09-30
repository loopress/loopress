import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag, PREVIEW_SUFFIX, registerAddTool} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const THEME_PUSH_TIMEOUT_MS = 620_000

const forceFlag = z
  .boolean()
  .optional()
  .describe('Allow downgrades and take over themes installed outside Loopress')

export function registerThemeTools(server: McpServer): void {
  registerAddTool(server, {exampleSlug: 'generatepress', resource: 'theme'})

  // theme_push/theme_pull wrap the whole topic (versions, templates and parts, Global Styles),
  // theme_version_* only the WordPress.org versions in loopress.json.
  const pushes = [
    {
      command: ['theme', 'push'],
      description:
        'Push everything theme related: WordPress.org theme versions from loopress.json, then block templates and parts, then Global Styles. Never switches the active theme.',
      name: 'theme_push',
    },
    {
      command: ['theme', 'version', 'push'],
      description:
        'Install/pin WordPress.org themes on the site to match loopress.json, via Composer + WPackagist. Never switches the active theme.',
      name: 'theme_version_push',
    },
  ]
  for (const {command, description, name} of pushes) {
    server.registerTool(
      name,
      {description: description + PREVIEW_SUFFIX, inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, force: forceFlag}},
      async ({confirmToken, env, force}) => {
        const args = buildArgs(command, {env})
        if (force) args.push('--force')
        return toCallToolResult(await runMutatingTool(name, args, confirmToken, {timeoutMs: THEME_PUSH_TIMEOUT_MS}))
      },
    )
  }

  const pulls = [
    {command: ['theme', 'pull'], description: 'Pull theme versions into loopress.json and Global Styles into a local file.', name: 'theme_pull'},
    {
      command: ['theme', 'version', 'pull'],
      description: 'Pull installed themes from WordPress into loopress.json, pinned to their live versions.',
      name: 'theme_version_pull',
    },
  ]
  for (const {command, description, name} of pulls) {
    server.registerTool(name, {description, inputSchema: {env: envFlag}}, async ({env}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(command, {env})))),
    )
  }

  server.registerTool(
    'theme_status',
    {
      description: 'Report version drift between the themes on WordPress and loopress.json.',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['theme', 'status'], {env})))),
  )
}
