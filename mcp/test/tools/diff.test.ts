import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerDiffTools} from '../../src/tools/diff.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerDiffTools(server)
  return tools
}

describe('project_diff', () => {
  beforeEach(() => runLps.mockClear())

  it('registers a single tool', () => {
    expect([...register().keys()]).toEqual(['project_diff'])
  })

  it('builds --only/--skip as repeated flags and appends --against last', async () => {
    const tools = register()
    await tools.get('project_diff')!({
      against: 'prod',
      env: 'staging',
      only: ['snippet', 'form'],
      skip: undefined,
    })
    expect(runLps).toHaveBeenCalledWith([
      'diff',
      '--env',
      'staging',
      '--only',
      'snippet',
      '--only',
      'form',
      '--against',
      'prod',
    ])
  })

  it('omits --against when not given', async () => {
    const tools = register()
    await tools.get('project_diff')!({env: 'staging'})
    expect(runLps).toHaveBeenCalledWith(['diff', '--env', 'staging'])
  })
})
