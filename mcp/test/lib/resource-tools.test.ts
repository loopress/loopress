import {beforeEach, describe, expect, it, vi} from 'vitest'

const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

const {registerResourceTools} = await import('../../src/lib/resource-tools.js')

type Handler = (input: Record<string, unknown>) => Promise<unknown>

function fakeServer() {
  const tools = new Map<string, Handler>()
  const server = {
    registerTool(name: string, _def: unknown, handler: Handler) {
      tools.set(name, handler)
    },
  }
  return {server: server as never, tools}
}

function register(overrides: Record<string, unknown> = {}) {
  const {server, tools} = fakeServer()
  registerResourceTools(server, {
    descriptions: {list: 'l', pull: 'p', push: 'push', rm: 'rm'},
    pathNoun: 'api directory',
    resource: 'api',
    ...overrides,
  })
  return tools
}

describe('registerResourceTools', () => {
  beforeEach(() => {
    runMutatingTool.mockClear()
    runLps.mockClear()
  })

  it('registers rm and a prune-capable push only when opted in', () => {
    expect([...register({supportsPrune: true, supportsRm: true}).keys()].sort()).toEqual([
      'api_list',
      'api_pull',
      'api_push',
      'api_rm',
    ])
    expect([...register().keys()].sort()).toEqual(['api_list', 'api_pull', 'api_push'])
  })

  it('api_rm runs `api rm <file> --yes` through the confirm handshake', async () => {
    const tools = register({supportsRm: true})
    await tools.get('api_rm')!({env: 'prod', filename: 'hello'})

    expect(runMutatingTool).toHaveBeenCalledWith('api_rm', ['api', 'rm', 'hello', '--env', 'prod', '--yes'], undefined)
  })

  it('api_rm rejects a filename starting with "-" at the schema layer', () => {
    // The schema refine is on the tool definition; assert the shape rather than dispatching.
    const {server} = fakeServer()
    const defs: {name: string; def: {inputSchema: {filename?: {safeParse(v: unknown): {success: boolean}}}}}[] = []
    ;(server as {registerTool: unknown}).registerTool = (name: string, def: unknown) => {
      defs.push({def: def as never, name})
    }
    registerResourceTools(server as never, {
      descriptions: {list: 'l', pull: 'p', push: 'push', rm: 'rm'},
      pathNoun: 'api directory',
      resource: 'api',
      supportsRm: true,
    })
    const rmDef = defs.find((d) => d.name === 'api_rm')!
    expect(rmDef.def.inputSchema.filename!.safeParse('--yes').success).toBe(false)
    expect(rmDef.def.inputSchema.filename!.safeParse('hello').success).toBe(true)
  })

  it('api_push appends --prune --yes only when prune is true', async () => {
    const tools = register({supportsPrune: true})

    await tools.get('api_push')!({prune: true})
    expect(runMutatingTool).toHaveBeenLastCalledWith('api_push', ['api', 'push', '--prune', '--yes'], undefined)

    await tools.get('api_push')!({prune: false})
    expect(runMutatingTool).toHaveBeenLastCalledWith('api_push', ['api', 'push'], undefined)
  })
})
