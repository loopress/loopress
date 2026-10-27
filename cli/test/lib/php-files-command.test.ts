import {afterEach, assert, beforeEach, describe, expect, it, vi} from 'vitest'

import {authManager} from '../../src/config/auth.manager.js'
import {ApiClient} from '../../src/lib/api-client.js'
import {API_FILES_RESOURCE, phpFileProblems} from '../../src/lib/php-files-command.js'
import {type EnvironmentConfig} from '../../src/types/config.js'

vi.mock('../../src/lib/api-client.js', () => ({ApiClient: vi.fn()}))

const put = vi.fn()

function site(apiEnvironmentId?: string): EnvironmentConfig {
  return {addedAt: '2024-01-01', ...(apiEnvironmentId !== undefined && {apiEnvironmentId}), name: 'production', url: 'https://acme.com'}
}

async function afterPush(siteConfig: EnvironmentConfig): Promise<void> {
  assert(API_FILES_RESOURCE.afterPush)
  await API_FILES_RESOURCE.afterPush({filenames: ['hello', 'v1/users'], siteConfig})
}

describe('API_FILES_RESOURCE.afterPush', () => {
  beforeEach(() => {
    put.mockReset().mockResolvedValue({})
    vi.mocked(ApiClient)
      .mockReset()
      .mockImplementation(function (this: {put: typeof put}) {
        this.put = put
      } as never)
    // Stubbing first lets unstubAllEnvs() restore a real LOOPRESS_TOKEN after the delete.
    vi.stubEnv('LOOPRESS_TOKEN', '')
    delete process.env.LOOPRESS_TOKEN
    vi.spyOn(authManager, 'getAuth').mockReturnValue(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports the pushed route filenames to the console with the LOOPRESS_TOKEN env var', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')

    await afterPush(site('env_1'))

    expect(ApiClient).toHaveBeenCalledWith('env-token')
    expect(put).toHaveBeenCalledWith('api-routes', {environmentId: 'env_1', filenames: ['hello', 'v1/users']})
  })

  it('falls back to the stored console login token', async () => {
    vi.mocked(authManager.getAuth).mockReturnValue({token: 'stored-token'} as never)

    await afterPush(site('env_1'))

    expect(ApiClient).toHaveBeenCalledWith('stored-token')
  })

  it('reports nothing without a token', async () => {
    await afterPush(site('env_1'))

    expect(put).not.toHaveBeenCalled()
  })

  it('reports nothing for an environment not linked to the console', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')

    await afterPush(site())

    expect(put).not.toHaveBeenCalled()
  })

  it('never lets a reporting failure interrupt the push', async () => {
    vi.stubEnv('LOOPRESS_TOKEN', 'env-token')
    put.mockRejectedValueOnce(new Error('console down'))

    await expect(afterPush(site('env_1'))).resolves.toBeUndefined()
  })
})

describe('phpFileProblems', () => {
  it('accepts a declaration-only file', () => {
    expect(phpFileProblems(API_FILES_RESOURCE, 'hello', '<?php\ndeclare(strict_types=1);\nfinal class Hello {}\n')).toEqual([])
  })

  it('requires declare(strict_types=1) to be the first statement', () => {
    expect(phpFileProblems(API_FILES_RESOURCE, 'hello', '<?php\nnamespace App;\ndeclare(strict_types=1);\nfinal class Hello {}\n')).toEqual([
      'hello.php: "declare(strict_types=1);" must be the first statement, right after <?php (one in a comment doesn\'t count)',
    ])
  })

  it('explains code outside the class', () => {
    expect(phpFileProblems(API_FILES_RESOURCE, 'hello', "<?php\ndeclare(strict_types=1);\ndefined('ABSPATH') || exit;\nfinal class Hello {}\n")).toEqual([
      "hello.php: code outside the class (defined) would run at load time, move it into the class. Don't add an ABSPATH guard: the plugin adds one on push.",
    ])
  })
})
