import {beforeEach, describe, expect, it, vi} from 'vitest'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

const {registerPluginTools} = await import('../../src/tools/plugin.js')
const {registerThemeTools} = await import('../../src/tools/theme.js')

type Handler = (input: Record<string, unknown>) => Promise<unknown>
type Def = {inputSchema: {slug: {safeParse(v: unknown): {success: boolean}}}}

function tools() {
  const registered = new Map<string, {def: Def; handler: Handler}>()
  const server = {
    registerTool(name: string, def: Def, handler: Handler) {
      registered.set(name, {def, handler})
    },
  } as never
  registerPluginTools(server)
  registerThemeTools(server)
  return registered
}

describe('plugin_add / theme_add', () => {
  beforeEach(() => {
    runLps.mockClear()
  })

  it('runs `<kind> add <slug>` locally, with --version only when given', async () => {
    const registered = tools()
    await registered.get('plugin_add')!.handler({slug: 'woocommerce'})
    await registered.get('theme_add')!.handler({slug: 'generatepress', version: '3.4.0'})

    expect(runLps).toHaveBeenNthCalledWith(1, ['plugin', 'add', 'woocommerce'])
    expect(runLps).toHaveBeenNthCalledWith(2, ['theme', 'add', 'generatepress', '--version', '3.4.0'])
  })

  it('rejects a slug that could be read as a flag', () => {
    const slug = tools().get('plugin_add')!.def.inputSchema.slug
    expect(slug.safeParse('contact-form-7').success).toBe(true)
    expect(slug.safeParse('--force').success).toBe(false)
    expect(slug.safeParse('../x').success).toBe(false)
  })
})
