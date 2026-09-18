export type Handler = (input: Record<string, unknown>) => Promise<unknown>

// Shared by every tools/*.test.ts file: a minimal McpServer stand-in that just records each
// registered tool's handler, keyed by name, so a test can invoke it directly.
export function fakeServer() {
  const tools = new Map<string, Handler>()
  const server = {
    registerTool(name: string, _def: unknown, handler: Handler) {
      tools.set(name, handler)
    },
  }
  return {server: server as never, tools}
}
