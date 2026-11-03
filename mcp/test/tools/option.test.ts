import {beforeEach, describe, expect, it, vi} from 'vitest'

const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps: vi.fn()}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

const {registerOptionTools} = await import('../../src/tools/option.js')

type Handler = (input: Record<string, unknown>) => Promise<unknown>

function register() {
  const tools = new Map<string, Handler>()
  registerOptionTools({
    registerTool(name: string, _def: unknown, handler: Handler) {
      tools.set(name, handler)
    },
  } as never)
  return tools
}

describe('option_rm', () => {
  beforeEach(() => runMutatingTool.mockClear())

  it('is named after the CLI and runs `option rm`', async () => {
    const tools = register()
    expect(tools.has('option_rm')).toBe(true)
    expect(tools.has('option_remove')).toBe(false)

    await tools.get('option_rm')!({env: 'prod', name: 'blogname'})
    expect(runMutatingTool).toHaveBeenCalledWith('option_rm', ['option', 'rm', 'blogname', '--env', 'prod'], undefined)
  })

  it('passes localOnly and path as flags', async () => {
    await register().get('option_rm')!({localOnly: true, name: 'blogname', path: 'opts'})
    expect(runMutatingTool).toHaveBeenCalledWith('option_rm', ['option', 'rm', 'blogname', '--local-only', '--path', 'opts'], undefined)
  })
})
