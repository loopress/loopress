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

function make(dryRun: boolean, argv: string[] = [], envName = 'production') {
  const cmd = new TestComposerPush(argv, fakeOclifConfig)
  cmd.setup({dryRun, siteConfig: makeEnv(envName, 'https://acme.com')})
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

  it.each([
    ['production', {akismet: '^5.3'}],
    ['local', {akismet: '^5.3', 'query-monitor': '^3.0'}],
  ])('sends require-dev to the local environment only (%s)', async (envName, plugins) => {
    writeFileSync(
      join(dir, 'composer.json'),
      JSON.stringify({require: {'wpackagist-plugin/akismet': '^5.3'}, 'require-dev': {'wpackagist-plugin/query-monitor': '^3.0'}}),
    )
    const {cmd, post} = make(false, [], envName)

    await cmd.run()

    expect(post.mock.calls[0][1]).toMatchObject({intent: {plugins}})
  })

  it('sends lock: null when composer.lock is missing', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    const {cmd, post} = make(false)

    await cmd.run()

    expect(post).toHaveBeenCalledWith(
      'loopress/v1/composer/sync',
      expect.objectContaining({lock: null}),
      expect.anything(),
    )
  })

  it('reports lock drift when the server resolved different versions than the local lock', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'monolog/monolog': '^3.0'}}))
    writeFileSync(join(dir, 'composer.lock'), '{"packages":[{"name":"monolog/monolog","version":"3.5.0"}]}')
    const {cmd, logs, post} = make(false)
    post.mockResolvedValue({
      ...OK,
      lockDrift: [
        {from: '3.5.0', name: 'monolog/monolog', to: '3.7.0'},
        {from: '1.0.0', name: 'psr/log', to: null},
      ],
    })

    const result = await cmd.run()

    expect(result.lockDrift).toHaveLength(2)
    expect(logs.log).toHaveBeenCalledWith('  monolog/monolog: 3.5.0 -> 3.7.0')
    expect(logs.log).toHaveBeenCalledWith('  psr/log: 1.0.0 -> (removed)')
    expect(logs.log).toHaveBeenCalledWith('Run `lps composer pull` to update your local composer.json and composer.lock.')
  })

  it('says nothing about drift when the server reports none', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    writeFileSync(join(dir, 'composer.lock'), '{"packages":[]}')
    const {cmd, logs, post} = make(false)
    post.mockResolvedValue({...OK, lockDrift: []})

    await cmd.run()

    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('different version'))
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

  it('logs the whole run, with a lock and the trimmed server output, for a single drifted package', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'monolog/monolog': '^3.0', 'psr/log': '^3.0'}}))
    writeFileSync(join(dir, 'composer.lock'), '{"packages":[]}')
    const {cmd, logs, post} = make(false, ['--force'])
    post.mockResolvedValue({...OK, lockDrift: [{from: null, name: 'psr/log', to: '3.0.0'}], output: '  Installing psr/log  \n'})

    const result = await cmd.run()

    expect(logs.log.mock.calls.map(([line]) => line)).toEqual([
      'Pushing composer.json (2 packages) to https://acme.com',
      '  + composer.lock sent for drift comparison (the server resolves versions from composer.json)',
      'Running Composer on the server, this can take a few minutes...',
      'Installing psr/log',
      'Composer run completed on the server.',
      '',
      'The server resolved 1 package to a different version than your local composer.lock:',
      '  psr/log: (absent) -> 3.0.0',
      'Run `lps composer pull` to update your local composer.json and composer.lock.',
    ])
    expect(post).toHaveBeenCalledWith('loopress/v1/composer/sync', expect.objectContaining({force: true, lock: '{"packages":[]}'}), {timeoutMs: 600_000})
    expect(result).toEqual({hasLock: true, lockDrift: [{from: null, name: 'psr/log', to: '3.0.0'}], packageCount: 2, status: 'success'})
    expect(cmd.deployments).toEqual(['success'])
  })

  it('treats a missing require map and a missing lockDrift as empty', async () => {
    writeFileSync(join(dir, 'composer.json'), '{}')
    const {cmd, logs, post} = make(false)
    post.mockResolvedValue({...OK, output: ' '.repeat(3)})

    const result = await cmd.run()

    expect(result).toEqual({hasLock: false, lockDrift: [], packageCount: 0, status: 'success'})
    expect(logs.log).toHaveBeenCalledWith('Pushing composer.json (0 packages) to https://acme.com')
    expect(logs.log).not.toHaveBeenCalledWith('')
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('composer.lock sent'))
  })

  it('returns a dry-run result that still reports the local lock', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    writeFileSync(join(dir, 'composer.lock'), '{}')
    const {cmd} = make(true)

    await expect(cmd.run()).resolves.toEqual({hasLock: true, lockDrift: [], packageCount: 0, status: 'dry-run'})
  })

  it('uses the exact collision and timeout messages', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    const collision = make(false)
    collision.post.mockRejectedValue(
      new Error('rejected', {
        cause: {response: {body: JSON.stringify({collisions: [{slug: 'x'}], error: 'unmanaged_plugins_present'}), statusCode: 422}},
      }),
    )
    const timeout = make(false)
    timeout.post.mockRejectedValue(new Error('Request timed out after 600s.', {cause: {name: 'TimeoutError'}}))

    await expect(collision.cmd.run()).rejects.toThrow(/^Plugins or themes are installed outside Loopress\. Re-run with --force to take them over\.$/)
    await expect(timeout.cmd.run()).rejects.toThrow(/^Request timed out after 600s\. The Composer run may still be in progress on the server\.$/)
  })

  it('rethrows any other sync failure unchanged', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    const {cmd, post} = make(false)
    post.mockRejectedValue(new Error('composer blew up'))

    await expect(cmd.run()).rejects.toThrow(/^composer blew up$/)
  })
})
