import {describe, expect, it, vi} from 'vitest'

const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps: vi.fn()}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

const {registerBulkTools} = await import('../../src/tools/bulk.js')

type Handler = (input: Record<string, unknown>) => Promise<unknown>
type Def = {inputSchema: {only?: {safeParse(v: unknown): {success: boolean}}}}

function register() {
  const tools = new Map<string, {def: Def; handler: Handler}>()
  registerBulkTools({
    registerTool(name: string, def: Def, handler: Handler) {
      tools.set(name, {def, handler})
    },
  } as never)
  return tools
}

describe('push', () => {
  it('accepts only the lps push resource ids', () => {
    const only = register().get('push')!.def.inputSchema.only!
    expect(only.safeParse(['acf', 'theme-style']).success).toBe(true)
    expect(only.safeParse(['theme-styles']).success).toBe(false)
  })

  it('forwards only and skip as repeated flags', async () => {
    await register().get('push')!.handler({env: 'staging', only: ['acf', 'page'], skip: ['page']})

    expect(runMutatingTool).toHaveBeenCalledWith('push', ['push', '--env', 'staging', '--only', 'acf', '--only', 'page', '--skip', 'page'], undefined, {timeoutMs: 600_000})
  })
})
