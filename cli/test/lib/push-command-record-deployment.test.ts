import got from 'got'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {authManager} from '../../src/config/auth.manager.js'
import {API_URL} from '../../src/lib/api-client.js'
import {PushCommand} from '../../src/lib/push-command.js'

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
      json: {status: 'success', url: 'https://acme.com'},
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
        json: {status: 'failure', url: 'https://acme.com'},
      }),
    )
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
