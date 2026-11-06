import got from 'got'
import {execFileSync} from 'node:child_process'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {authManager} from '../../src/config/auth.manager.js'
import {API_URL} from '../../src/lib/api-client.js'
import {PushCommand} from '../../src/lib/push-command.js'

vi.mock('node:child_process', () => ({execFileSync: vi.fn()}))
vi.mock('got', () => ({default: {post: vi.fn()}}))

// The real recordDeployment(), which push-command.test.ts stubs out on its TestPush.
class TestPush extends PushCommand {
  async run(): Promise<void> {}

  async testRecordDeployment(status: 'failure' | 'success') {
    this.siteConfig = {addedAt: '2024-01-01', name: 'production', url: 'https://acme.com'}
    await this.recordDeployment(status)
  }
}

describe('PushCommand.recordDeployment()', () => {
  beforeEach(() => {
    vi.mocked(got.post).mockReset().mockResolvedValue({})
    vi.mocked(execFileSync).mockReset().mockImplementation(() => {
      throw new Error('not a git repository')
    })
    // Stubbing first lets unstubAllEnvs() restore a real LOOPRESS_TOKEN after the delete.
    vi.stubEnv('LOOPRESS_TOKEN', '')
    delete process.env.LOOPRESS_TOKEN
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('posts the status and site URL to the console API with the LOOPRESS_TOKEN env var', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')

    await new TestPush([], {} as never).testRecordDeployment('success')

    expect(got.post).toHaveBeenCalledWith(`${API_URL}/deployments`, {
      headers: {Authorization: 'Bearer env-token'},
      json: {command: undefined, status: 'success', url: 'https://acme.com'},
      timeout: {request: 3000},
    })
  })

  it('falls back to the stored console login token', async () => {
    vi.spyOn(authManager, 'getAuth').mockReturnValue({token: 'stored-token'} as never)

    await new TestPush([], {} as never).testRecordDeployment('failure')

    expect(got.post).toHaveBeenCalledWith(
      `${API_URL}/deployments`,
      expect.objectContaining({
        headers: {Authorization: 'Bearer stored-token'},
        json: {command: undefined, status: 'failure', url: 'https://acme.com'},
      }),
    )
  })

  it('sends the command id, the HEAD commit and a clean tree', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')
    vi.mocked(execFileSync).mockImplementation(((_cmd: string, args: string[]) => (args[0] === 'rev-parse' ? 'abc123\n' : '')) as never)
    const command = new TestPush([], {} as never)
    command.id = 'theme:push'

    await command.testRecordDeployment('success')

    expect(got.post).toHaveBeenCalledWith(
      `${API_URL}/deployments`,
      expect.objectContaining({json: {command: 'theme:push', commit: 'abc123', dirty: false, status: 'success', url: 'https://acme.com'}}),
    )
  })

  it('flags a dirty working tree', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')
    vi.mocked(execFileSync).mockImplementation(((_cmd: string, args: string[]) => (args[0] === 'rev-parse' ? 'abc123\n' : ' M style.css\n')) as never)

    await new TestPush([], {} as never).testRecordDeployment('success')

    expect(got.post).toHaveBeenCalledWith(
      `${API_URL}/deployments`,
      expect.objectContaining({json: expect.objectContaining({commit: 'abc123', dirty: true})}),
    )
  })

  it('omits commit and dirty outside a Git repository', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')

    await new TestPush([], {} as never).testRecordDeployment('success')

    const [, options] = vi.mocked(got.post).mock.calls[0] as unknown as [string, {json: Record<string, unknown>}]
    expect(options.json).not.toHaveProperty('commit')
    expect(options.json).not.toHaveProperty('dirty')
  })

  it('sends the plugins of loopress.json after a plugin:push', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')
    const command = new TestPush([], {} as never)
    command.id = 'plugin:push'
    Object.assign(command, {localConfig: {plugins: {akismet: '5.3.3', hello: {active: false, version: 'latest'}}}})

    await command.testRecordDeployment('success')

    const [, options] = vi.mocked(got.post).mock.calls[0] as unknown as [string, {json: Record<string, unknown>}]
    expect(options.json.plugins).toEqual([
      {active: true, slug: 'akismet', version: '5.3.3'},
      {active: false, slug: 'hello', version: 'latest'},
    ])
  })

  it('sends no plugins for another command or a failed plugin:push', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')
    const other = new TestPush([], {} as never)
    other.id = 'acf:push'
    Object.assign(other, {localConfig: {plugins: {akismet: '5.3.3'}}})
    const failed = new TestPush([], {} as never)
    failed.id = 'plugin:push'
    Object.assign(failed, {localConfig: {plugins: {akismet: '5.3.3'}}})

    await other.testRecordDeployment('success')
    await failed.testRecordDeployment('failure')

    for (const [, options] of vi.mocked(got.post).mock.calls as unknown as Array<[string, {json: Record<string, unknown>}]>) {
      expect(options.json).not.toHaveProperty('plugins')
    }
  })

  it('records nothing without any token', async () => {
    vi.spyOn(authManager, 'getAuth').mockReturnValue(null)

    await new TestPush([], {} as never).testRecordDeployment('success')

    expect(got.post).not.toHaveBeenCalled()
  })

  it('never lets a recording failure interrupt the push', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')
    vi.mocked(got.post).mockRejectedValueOnce(new Error('console down'))

    await expect(new TestPush([], {} as never).testRecordDeployment('success')).resolves.toBeUndefined()
  })
})

// The real reportPushToSite(), called by recordSuccess() after a real push.
class ReportingPush extends PushCommand {
  async run(): Promise<void> {}

  async testReport(post: ReturnType<typeof vi.fn>) {
    // Seeds the client the `wp` getter would otherwise build from real credentials.
    Object.assign(this, {wpClient: {post}})
    await this.reportPushToSite()
  }
}

describe('PushCommand.reportPushToSite()', () => {
  it('reports the finished push to the plugin under the command id', async () => {
    const post = vi.fn().mockResolvedValue({})
    const command = new ReportingPush([], {} as never)
    command.id = 'acf:push'

    await command.testReport(post)

    expect(post).toHaveBeenCalledWith('loopress/v1/pushes', {resource: 'acf:push'}, {timeoutMs: 5000})
  })

  it('never fails the push when the plugin predates the push log', async () => {
    const command = new ReportingPush([], {} as never)
    command.id = 'acf:push'

    await expect(command.testReport(vi.fn().mockRejectedValue(new Error('404')))).resolves.toBeUndefined()
  })
})
