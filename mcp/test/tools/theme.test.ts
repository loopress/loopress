import {describe, expect, it, vi} from 'vitest'

const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps: vi.fn()}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

const {registerThemeTools} = await import('../../src/tools/theme.js')

type Handler = (input: Record<string, unknown>) => Promise<unknown>
type Def = {inputSchema: {stylesheet?: {safeParse(v: unknown): {success: boolean}}}}

function register() {
  const tools = new Map<string, {def: Def; handler: Handler}>()
  registerThemeTools({
    registerTool(name: string, def: Def, handler: Handler) {
      tools.set(name, {def, handler})
    },
  } as never)
  return tools
}

describe('theme_activate', () => {
  it('rejects a stylesheet that could be read as a flag', () => {
    const stylesheet = register().get('theme_activate')!.def.inputSchema.stylesheet!
    expect(stylesheet.safeParse('twentytwentyfive-loopress').success).toBe(true)
    expect(stylesheet.safeParse(undefined).success).toBe(true)
    expect(stylesheet.safeParse('--yes').success).toBe(false)
    expect(stylesheet.safeParse('../x').success).toBe(false)
  })

  it('passes the stylesheet as a positional argument', async () => {
    await register().get('theme_activate')!.handler({env: 'staging', stylesheet: 'astra'})

    expect(runMutatingTool).toHaveBeenCalledWith('theme_activate', ['theme', 'activate', 'astra', '--env', 'staging'], undefined)
  })
})
