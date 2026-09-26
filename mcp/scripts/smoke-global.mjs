// End-to-end check of a real global install: the MCP client launches `lps-mcp` exactly as a user's
// config would, and one tool call proves the server could start the CLI. Unit tests mock the
// spawn, so this is the only check that catches a platform-specific launch failure (Windows
// `.cmd` shims, see run-lps.ts). Expects `@loopress/cli` and `@loopress/mcp` installed globally.
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

// Same launch line the docs give Windows users: `lps-mcp` is a `.cmd` shim there.
const launch = process.platform === 'win32' ? {args: ['/c', 'lps-mcp'], command: 'cmd'} : {args: [], command: 'lps-mcp'}

const env = {...process.env}
delete env.LPS_BIN

const client = new Client({name: 'loopress-smoke', version: '0.0.0'})
await client.connect(
  new StdioClientTransport({...launch, cwd: mkdtempSync(join(tmpdir(), 'lps-smoke-')), env, stderr: 'inherit'}),
)

try {
  const result = await client.callTool({arguments: {}, name: 'validate_local'})
  const text = result.content.map((item) => item.text ?? '').join('\n')
  console.log(text)
  if (result.isError) throw new Error('validate_local failed: the MCP server could not run the CLI.')
  console.log('Smoke test passed: lps-mcp started and ran the CLI.')
} finally {
  await client.close()
}
