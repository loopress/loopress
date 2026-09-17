import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {toCallToolResult} from '../lib/tool-result.js'

// `lps promote` runs a full pull then a full push in sequence, so it needs the same generous
// ceiling as push_all/pull_all rather than the default single-command timeout.
const PROMOTE_TIMEOUT_MS = 600_000

export function registerPromoteTools(server: McpServer): void {
  server.registerTool(
    'project_promote',
    {
      description:
        'Copy every tracked resource from one environment to another by pulling from `from` then pushing to `to`, the equivalent of `lps promote`. Overwrites local tracked files with `from`\'s content in the process.' +
        PREVIEW_SUFFIX,
      inputSchema: {
        confirmToken: confirmTokenFlag,
        from: z.string().describe('Environment to copy the configuration from'),
        to: z.string().describe('Environment to copy the configuration to'),
      },
    },
    async ({confirmToken, from, to}) =>
      // --yes: confirmPromotion refuses outside a TTY without it, which the MCP server always
      // is; the confirmToken handshake is the actual approval gate, same as prune/rm elsewhere.
      toCallToolResult(
        await runMutatingTool('project_promote', ['promote', from, to, '--yes'], confirmToken, {
          timeoutMs: PROMOTE_TIMEOUT_MS,
        }),
      ),
  )
}
