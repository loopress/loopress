import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {buildArgs} from '../lib/build-args.js'
import {runMutatingTool} from '../lib/mutating-tool.js'
import {runLps} from '../lib/run-lps.js'
import {toCallToolResult, unwrap} from '../lib/tool-result.js'

const envFlag = z.string().optional().describe('Target environment by name, overriding the globally active one')
const pathArg = z.string().optional().describe('Path to the SEO directory (overrides project config)')
const postTypeFlag = z
  .array(z.string())
  .optional()
  .describe('Limit post meta to specific post types (defaults to post and page)')
const confirmTokenFlag = z.string().optional().describe('Token from a prior preview call of this same tool, to apply it for real')

export function registerSeoTools(server: McpServer): void {
  server.registerTool(
    'seo_push',
    {
      description:
        'Push SEO settings, post meta, and redirects to WordPress (RankMath or Yoast, whichever is active). Without confirmToken, returns a dry-run preview and a confirmToken instead of making any change; call again with that confirmToken to apply it.',
      inputSchema: {confirmToken: confirmTokenFlag, env: envFlag, path: pathArg},
    },
    async ({confirmToken, env, path}) =>
      toCallToolResult(await runMutatingTool('seo_push', buildArgs(['seo', 'push'], {env, path}), confirmToken)),
  )

  server.registerTool(
    'seo_pull',
    {
      description: 'Pull SEO settings, post meta, and (if supported) redirects from WordPress into local files.',
      inputSchema: {env: envFlag, path: pathArg, postType: postTypeFlag},
    },
    async ({env, path, postType}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(['seo', 'pull'], {env, path, repeatFlags: {'post-type': postType}})))),
  )

  server.registerTool(
    'seo_list',
    {
      description: 'List posts with SEO meta, and redirects if the active SEO plugin supports them, on WordPress.',
      inputSchema: {env: envFlag, postType: postTypeFlag},
    },
    async ({env, postType}) =>
      toCallToolResult(unwrap(await runLps(buildArgs(['seo', 'list'], {env, repeatFlags: {'post-type': postType}})))),
  )
}
