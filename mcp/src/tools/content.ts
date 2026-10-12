import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'

import {runMutatingTool} from '../lib/mutating-tool.js'
import {confirmTokenFlag, PREVIEW_SUFFIX} from '../lib/resource-tools.js'
import {toCallToolResult} from '../lib/tool-result.js'

// Pages through every post and term of the source, then runs a full `lps push`: the same
// generous ceiling as project_promote.
const CONTENT_COPY_TIMEOUT_MS = 600_000

export function registerContentTools(server: McpServer): void {
  server.registerTool(
    'content_copy',
    {
      description:
        'Replace the local site\'s posts, pages, public custom post types and terms with the content of `from`, then push the project to the local site, the equivalent of `lps content copy`. Deletes the local content. Media stay served by `from`, users, comments and orders are never copied.' +
        PREVIEW_SUFFIX,
      inputSchema: {
        confirmToken: confirmTokenFlag,
        from: z.string().describe('Environment to copy the content from, e.g. "production". The content always lands in "local".'),
      },
    },
    async ({confirmToken, from}) =>
      // --yes: the command refuses outside a TTY without it, the confirmToken handshake is the
      // actual approval gate, same as project_promote.
      toCallToolResult(
        await runMutatingTool('content_copy', ['content', 'copy', from, '--yes'], confirmToken, {
          timeoutMs: CONTENT_COPY_TIMEOUT_MS,
        }),
      ),
  )
}
