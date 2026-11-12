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

  it('registers push, list and rollback for pages and templates', () => {
    expect([...register().keys()].sort()).toEqual([
      'page_list',
      'page_push',
      'page_rollback',
      'theme_template_list',
      'theme_template_push',
      'theme_template_rollback',
    ])
  })

  it('theme_template_rollback runs the nested rollback command through the confirm handshake', async () => {
    await register().get('theme_template_rollback')!.handler({env: 'staging'})

    expect(runMutatingTool).toHaveBeenCalledWith('theme_template_rollback', ['theme', 'template', 'rollback', '--env', 'staging', '--yes'], undefined)
  })

  it('theme_template_push and theme_template_list run the template commands', async () => {
    const tools = register()
    await tools.get('theme_template_push')!.handler({})
    await tools.get('theme_template_list')!.handler({env: 'prod'})

    expect(tools.get('theme_template_push')!.def.inputSchema.slug).toBeUndefined()
    expect(runMutatingTool).toHaveBeenCalledWith('theme_template_push', ['theme', 'template', 'push'], undefined)
    expect(runLps).toHaveBeenCalledWith(['theme', 'template', 'list', '--env', 'prod'])
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

})
