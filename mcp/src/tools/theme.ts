import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {CHANGES_SUFFIX, confirmTokenFlag, envFlag, PREVIEW_SUFFIX, registerAddTool} from '../lib/resource-tools.js'
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
        'Push everything theme related to WordPress: theme versions from loopress.json, then block templates and parts (skipped when the project has no template, part or CSS directory and does not set activateChildTheme), then Global Styles. Switches the active theme only to the Loopress child, when loopress.json sets "activateChildTheme": true.' +
        PREVIEW_SUFFIX +
        CHANGES_SUFFIX +
        ' Each step is under `results` with its own preview in `result`. The templates and parts step splits its `changes` as template_push describes.',
      name: 'theme_push',
    },
    {
      command: ['theme', 'version', 'push'],
      description:
        'Install WordPress.org themes on WordPress to match loopress.json, via Composer + WPackagist (versions only, never switches the active theme).' +
        PREVIEW_SUFFIX,
      name: 'theme_version_push',
    },
  ]
  for (const {command, description, name} of pushes) {
    server.registerTool(
      name,
      {description, inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, force: forceFlag}},
      async ({confirmToken, env, force}) => {
        const args = buildArgs(command, {env})
        if (force) args.push('--force')
        return toCallToolResult(await runMutatingTool(name, args, confirmToken, {timeoutMs: THEME_PUSH_TIMEOUT_MS}))
      },
    )
  }

  const pulls = [
    {command: ['theme', 'pull'], description: 'Pull everything theme related from WordPress: theme versions into loopress.json, then Global Styles into a local file.', name: 'theme_pull'},
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
    'theme_activate',
    {
      description:
        "Activate a theme on WordPress, the Loopress child theme (<parent>-loopress) by default. A child theme without settings of its own starts from a copy of its parent's theme mods and Global Styles." +
        PREVIEW_SUFFIX,
      inputSchema: {
        confirmToken: confirmTokenFlag,
        env: envFlag,
        stylesheet: z
          .string()
          // A leading hyphen would be read as a flag, and the default child activated instead.
          .regex(/^\w[\w.-]*$/, 'must be a theme directory name, not starting with a hyphen')
          .optional()
          .describe('Theme to activate (default: the Loopress child theme)'),
      },
    },
    async ({confirmToken, env, stylesheet}) =>
      toCallToolResult(await runMutatingTool('theme_activate', buildArgs(['theme', 'activate'], {env, path: stylesheet}), confirmToken)),
  )

  server.registerTool(
    'theme_status',
    {
      description: 'Compare the themes on WordPress against loopress.json and report version drift.',
      inputSchema: {env: envFlag},
    },
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['theme', 'status'], {env})))),
  )
}
