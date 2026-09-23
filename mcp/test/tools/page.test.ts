import {beforeEach, describe, expect, it, vi} from 'vitest'

const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

const {registerPageTools} = await import('../../src/tools/page.js')

type Handler = (input: Record<string, unknown>) => Promise<unknown>
type Def = {inputSchema: {slug?: {safeParse(v: unknown): {success: boolean}}}}

function register() {
  const tools = new Map<string, {def: Def; handler: Handler}>()
  registerPageTools({
    registerTool(name: string, def: Def, handler: Handler) {
      tools.set(name, {def, handler})
    },
  } as never)
  return tools
}

describe('registerPageTools', () => {
  beforeEach(() => {
    runMutatingTool.mockClear()
    runLps.mockClear()
  })

  it('registers push, list and diff', () => {
    expect([...register().keys()].sort()).toEqual(['page_diff', 'page_list', 'page_push'])
  })

  it('page_push passes the slug as a positional arg through the confirm handshake', async () => {
    const tools = register()
    await tools.get('page_push')!.handler({env: 'prod', slug: 'about'})
    await tools.get('page_push')!.handler({})

    expect(runMutatingTool).toHaveBeenNthCalledWith(1, 'page_push', ['page', 'push', 'about', '--env', 'prod'], undefined)
    expect(runMutatingTool).toHaveBeenNthCalledWith(2, 'page_push', ['page', 'push'], undefined)
  })

  it('page_push rejects a slug that could be read as a flag or a path', () => {
    const slug = register().get('page_push')!.def.inputSchema.slug!
    expect(slug.safeParse('about').success).toBe(true)
    expect(slug.safeParse('--dry-run').success).toBe(false)
    expect(slug.safeParse('../x').success).toBe(false)
  })

  it('page_diff runs `page diff` read-only', async () => {
    await register().get('page_diff')!.handler({env: 'staging'})

    expect(runLps).toHaveBeenCalledWith(['page', 'diff', '--env', 'staging'])
  })
})
