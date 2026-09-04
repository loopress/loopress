import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import ComposerPush from '../../../src/commands/composer/push.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const OK = {composerJson: '{}', composerLock: null, message: 'ok', output: '', removed: []}

class TestComposerPush extends ComposerPush {
  deployments: string[] = []

  protected override async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    this.deployments.push(status)
  }

  setup(options: {dryRun: boolean; siteConfig: EnvironmentConfig}) {
    this.dryRun = options.dryRun
    this.siteConfig = options.siteConfig
    this.localConfig = {}
  }
}

function make(dryRun: boolean, argv: string[] = []) {
  const cmd = new TestComposerPush(argv, fakeOclifConfig)
  cmd.setup({dryRun, siteConfig: makeEnv('production', 'https://acme.com')})
  const logs = silenceLogs(cmd)
  const post = vi.fn().mockResolvedValue(OK)
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {post}
  return {cmd, logs, post}
}

describe('composer push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-composer-push-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('fails when there is no composer.json', async () => {
    const {cmd} = make(false)
    await expect(cmd.run()).rejects.toThrow(/No composer\.json found/)
  })

  it('does not call the API on dry-run', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '^5.3'}}))
    const {cmd, logs, post} = make(true)

    await cmd.run()

    expect(post).not.toHaveBeenCalled()
    expect(cmd.deployments).toEqual([])
    expect(logs.log).toHaveBeenCalledWith('Pushing composer.json (1 package) to https://acme.com')
  })

  it('splits the require map into libraries / plugins / themes intent namespaces', async () => {
    writeFileSync(
      join(dir, 'composer.json'),
      JSON.stringify({
        require: {
          'composer/installers': '^2.0',
          'monolog/monolog': '^3.0',
          'wpackagist-plugin/akismet': '^5.3',
          'wpackagist-theme/generatepress': '3.4.0',
        },
      }),
    )
    writeFileSync(join(dir, 'composer.lock'), '{"packages": []}')
    const {cmd, post} = make(false)

    await cmd.run()

    expect(post).toHaveBeenCalledWith(
      'loopress/v1/composer/sync',
      {
        force: false,
        intent: {
          libraries: {'monolog/monolog': '^3.0'},
          plugins: {akismet: '^5.3'},
          themes: {generatepress: '3.4.0'},
        },
        lock: '{"packages": []}',
      },
      {timeoutMs: 600_000},
    )
    expect(cmd.deployments).toEqual(['success'])
  })

  it('warns when composer.lock is missing and sends null', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    const {cmd, logs, post} = make(false)

    await cmd.run()

    expect(logs.warn).toHaveBeenCalledWith('No composer.lock found. The server will resolve versions freely.')
    expect(post).toHaveBeenCalledWith(
      'loopress/v1/composer/sync',
      expect.objectContaining({lock: null}),
      expect.anything(),
    )
  })

  it('explains the run may still be in progress when the sync call times out', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    const {cmd, post} = make(false)
    post.mockRejectedValue(
      new Error('Request timed out after 600s. Is the site reachable?', {cause: {name: 'TimeoutError'}}),
    )

    await expect(cmd.run()).rejects.toThrow(/may still be in progress/)
  })

  it('tells the user to use --force when the server reports an unmanaged-package collision', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/woocommerce': '9.4.2'}}))
    const {cmd, post} = make(false)
    post.mockRejectedValue(
      new Error('rejected', {
        cause: {
          response: {
            body: JSON.stringify({collisions: [{slug: 'woocommerce'}], error: 'unmanaged_plugins_present'}),
            statusCode: 422,
          },
        },
      }),
    )

    await expect(cmd.run()).rejects.toThrow(/--force/)
  })
})
