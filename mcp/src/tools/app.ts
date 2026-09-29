import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, envFlag} from '../lib/resource-tools.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const pathArg = z.string().optional().describe('Path to the apps directory (overrides project config)')
const nameArg = z.string().describe('App name (the apps/<name>/ directory)')
const optionalNameArg = z.string().optional().describe('Push only this app (defaults to every app in the directory)')
const noBuildFlag = z.boolean().optional().describe("Skip the app's package.json build script and push dist/ as is")

export function registerAppTools(server: McpServer): void {
  server.registerTool(
    'app_push',
    {
      description:
        "Build and push single-page app bundles (apps/<name>/dist/) to WordPress. When an app's package.json has a build script, it runs first (on the dry-run preview too), unless noBuild is set. Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.",
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, name: optionalNameArg, noBuild: noBuildFlag},
    },
    async ({confirmToken, env, name, noBuild}) => {
      const args = buildArgs(['app', 'push', ...(name ? [name] : [])], {env})
      if (noBuild) args.push('--no-build')
      return toCallToolResult(await runMutatingTool('app_push', args, confirmToken))
    },
  )

  server.registerTool(
    'app_pull',
    {description: 'Pull single-page app bundles from WordPress into local files.', inputSchema: {env: envFlag, path: pathArg}},
    async ({env, path}) => toCallToolResult(unwrap(await runLps(buildArgs(['app', 'pull'], {env, path})))),
  )

  server.registerTool(
    'app_list',
    {description: 'List single-page apps currently deployed to WordPress.', inputSchema: {env: envFlag}},
    async ({env}) => toCallToolResult(unwrap(await runLps(buildArgs(['app', 'list'], {env})))),
  )

  server.registerTool(
    'app_remove',
    {
      description:
        'Remove a single-page app from WordPress (deletes its bundle and unregisters the shortcode; local files are left untouched). Without confirmToken, returns a dry-run preview and a confirmToken; call again with that confirmToken to apply it.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, name: nameArg},
    },
    async ({confirmToken, env, name}) =>
      toCallToolResult(await runMutatingTool('app_remove', buildArgs(['app', 'remove', name], {env}), confirmToken)),
  )
}
