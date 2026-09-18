import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerAcfTools} from '../../src/tools/acf.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerAcfTools(server)
  return tools
}

describe('acf tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push, pull and list', () => {
    expect([...register().keys()].sort()).toEqual(['acf_list', 'acf_pull', 'acf_push'])
  })

  it('acf_push builds path, env and repeated --type flags, then goes through the mutating handshake', async () => {
    const tools = register()
    await tools.get('acf_push')!({
      confirmToken: 'tok',
      env: 'staging',
      path: 'custom/acf',
      type: ['field-groups', 'taxonomies'],
    })
    expect(runMutatingTool).toHaveBeenCalledWith(
      'acf_push',
      ['acf', 'push', 'custom/acf', '--env', 'staging', '--type', 'field-groups', '--type', 'taxonomies'],
      'tok',
    )
  })

  it('acf_pull builds the same args shape as a plain read', async () => {
    const tools = register()
    await tools.get('acf_pull')!({env: 'staging', path: 'custom/acf', type: ['post-types']})
    expect(runLps).toHaveBeenCalledWith(['acf', 'pull', 'custom/acf', '--env', 'staging', '--type', 'post-types'])
  })

  it('acf_list has no path arg', async () => {
    const tools = register()
    await tools.get('acf_list')!({env: 'staging'})
    expect(runLps).toHaveBeenCalledWith(['acf', 'list', '--env', 'staging'])
  })
})
