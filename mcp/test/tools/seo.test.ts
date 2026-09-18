import {beforeEach, describe, expect, it, vi} from 'vitest'

import {registerSeoTools} from '../../src/tools/seo.js'
import {fakeServer} from './fake-server.js'

const runLps = vi.hoisted(() => vi.fn().mockResolvedValue({data: {}, ok: true}))
const runMutatingTool = vi.hoisted(() => vi.fn().mockResolvedValue({status: 'preview'}))
vi.mock('../../src/lib/run-lps.js', () => ({runLps}))
vi.mock('../../src/lib/mutating-tool.js', () => ({runMutatingTool}))
vi.mock('../../src/lib/tool-result.js', () => ({toCallToolResult: (x: unknown) => x, unwrap: (x: unknown) => x}))

function register() {
  const {server, tools} = fakeServer()
  registerSeoTools(server)
  return tools
}

describe('seo tools', () => {
  beforeEach(() => {
    runLps.mockClear()
    runMutatingTool.mockClear()
  })

  it('registers push, pull and list', () => {
    expect([...register().keys()].sort()).toEqual(['seo_list', 'seo_pull', 'seo_push'])
  })

  it('seo_push appends --allow-external-redirects only when set', async () => {
    const tools = register()

    await tools.get('seo_push')!({allowExternalRedirects: true, confirmToken: 'tok', env: 'staging', path: 'custom/seo'})
    expect(runMutatingTool).toHaveBeenLastCalledWith(
      'seo_push',
      ['seo', 'push', 'custom/seo', '--env', 'staging', '--allow-external-redirects'],
      'tok',
    )

    await tools.get('seo_push')!({allowExternalRedirects: false, confirmToken: 'tok', env: 'staging', path: 'custom/seo'})
    expect(runMutatingTool).toHaveBeenLastCalledWith('seo_push', ['seo', 'push', 'custom/seo', '--env', 'staging'], 'tok')
  })

  it('seo_pull and seo_list build --post-type as repeated flags', async () => {
    const tools = register()

    await tools.get('seo_pull')!({env: 'staging', path: 'custom/seo', postType: ['post', 'page']})
    expect(runLps).toHaveBeenLastCalledWith([
      'seo',
      'pull',
      'custom/seo',
      '--env',
      'staging',
      '--post-type',
      'post',
      '--post-type',
      'page',
    ])

    await tools.get('seo_list')!({env: 'staging', postType: ['post']})
    expect(runLps).toHaveBeenLastCalledWith(['seo', 'list', '--env', 'staging', '--post-type', 'post'])
  })
})
