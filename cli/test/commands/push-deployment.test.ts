import got from 'got'
import {execFileSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../src/commands/push.js'
import {API_URL} from '../../src/lib/api-client.js'
import {PushCommand} from '../../src/lib/push-command.js'
import {type LoopressLocalConfig} from '../../src/utils/loopress-config.js'
import {makeCapabilities, stubCapabilities} from '../helpers/capabilities.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

vi.mock('node:child_process', () => ({execFileSync: vi.fn()}))
vi.mock('got', () => ({default: {post: vi.fn()}}))

const siteConfig = makeEnv('staging', 'https://staging.acme.com')

// A step as `lps push` runs it in process: it records its own success through the real method.
class Step extends PushCommand {
  override id = 'option:push'
  async record(status: 'failure' | 'success'): Promise<void> {
    this.siteConfig = siteConfig
    await this.recordDeployment(status)
  }

  async run(): Promise<void> {}
}

class TestPush extends Push {
  setup(localConfig: LoopressLocalConfig) {
    this.dryRun = false
    this.siteConfig = siteConfig
    this.localConfig = localConfig
  }
}

function make(localConfig: LoopressLocalConfig = {}) {
  const cmd = new TestPush([], fakeOclifConfig)
  ;(cmd as unknown as {id: string}).id = 'push'
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get: vi.fn(async () => [])}
  stubCapabilities(cmd, makeCapabilities())
  cmd.setup(localConfig)
  silenceLogs(cmd)
  return cmd
}

describe('push deployment record', () => {
  let projectDir: string

  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
    vi.stubEnv('LOOPRESS_TOKEN', 'tok')
    vi.mocked(got.post).mockReset().mockResolvedValue({})
    vi.mocked(execFileSync).mockReset().mockImplementation(() => {
      throw new Error('not a git repository')
    })
    projectDir = mkdtempSync(join(tmpdir(), 'lps-push-record-'))
    for (const dir of ['options', 'menus']) mkdirSync(join(projectDir, dir))
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir)
  })

  afterEach(() => {
    vi.mocked(process.cwd).mockRestore()
    vi.unstubAllEnvs()
    rmSync(projectDir, {force: true, recursive: true})
  })

  it('posts one record with every step in order, however many steps ran', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockImplementation(async () => {
      await new Step([], fakeOclifConfig).record('success')
      return {}
    })

    await make().run()

    expect(got.post).toHaveBeenCalledTimes(1)
    const [url, options] = vi.mocked(got.post).mock.calls[0] as unknown as [string, {json: {command: string; status: string; steps: Array<{command: string; status: string}>}; timeout: unknown}]
    expect(url).toBe(`${API_URL}/deployments`)
    expect(options.timeout).toEqual({request: 3000})
    expect(options.json).toMatchObject({command: 'push', status: 'success', url: siteConfig.url})
    const ran = vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)
    expect(ran).toEqual(['menu:push', 'option:push'])
    expect(options.json.steps.filter((step) => step.status === 'pushed').map((step) => step.command)).toEqual(ran)
    expect(options.json.steps.find((step) => step.command === 'plugin:push')).toEqual({command: 'plugin:push', status: 'skipped'})
  })

  it('posts a failure record ending at the failed step, the next ones absent', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockImplementation(async (id: string) => {
      if (id === 'option:push') {
        const step = new Step([], fakeOclifConfig)
        await step.catch(new Error('boom')).catch(() => {})
        throw new Error('boom')
      }

      return {}
    })

    await expect(make().run()).rejects.toThrow('option')

    expect(got.post).toHaveBeenCalledTimes(1)
    const {json} = (vi.mocked(got.post).mock.calls[0] as unknown as [string, {json: {status: string; steps: Array<{command: string; status: string}>}}])[1]
    expect(json.status).toBe('failure')
    const last = json.steps.at(-1)
    expect(last).toEqual({command: 'option:push', status: 'failed'})
    expect(json.steps.map((step) => step.command)).not.toContain('snippet:push')
  })

  it('names every step of the record by its command, and posts nothing on a dry run', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const live = make()
    await live.run()

    const {json} = (vi.mocked(got.post).mock.calls[0] as unknown as [string, {json: {steps: Array<{command: string}>}}])[1]
    expect(json.steps.map((step) => step.command)).toEqual(expect.arrayContaining(['plugin:push', 'cpt:push', 'option:push']))
    expect(json.steps.every((step) => step.command.endsWith(':push'))).toBe(true)
    vi.mocked(got.post).mockClear()

    const dry = make()
    ;(dry as unknown as {dryRun: boolean}).dryRun = true
    await dry.run()

    expect(got.post).not.toHaveBeenCalled()
  })

  it('keeps a record of its own for a step run alone, without steps', async () => {
    await new Step([], fakeOclifConfig).record('success')

    expect(got.post).toHaveBeenCalledTimes(1)
    const {json} = (vi.mocked(got.post).mock.calls[0] as unknown as [string, {json: Record<string, unknown>}])[1]
    expect(json).toMatchObject({command: 'option:push', status: 'success'})
    expect(json).not.toHaveProperty('steps')
  })
})
