import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/plugin/push.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const SYNC_OK = {composerJson: '{}', composerLock: null, message: 'ok', output: 'Nothing to install', removed: []}

class TestPush extends Push {
  protected override async guardProductionPush(): Promise<void> {}
  protected override async recordDeployment(): Promise<void> {}

  setup(config: LoopressLocalConfig, siteConfig: EnvironmentConfig) {
    this.localConfig = config
    this.siteConfig = siteConfig
    this.dryRun = false
  }
}

function make(config: LoopressLocalConfig, argv: string[] = []) {
  const cmd = new TestPush(argv, fakeOclifConfig)
  cmd.setup(config, makeEnv('production', 'https://acme.com'))
  const logs = silenceLogs(cmd)
  const get = vi.fn()
  const post = vi.fn().mockResolvedValue(SYNC_OK)
  const put = vi.fn().mockResolvedValue({})
  // 404 on the instance lock = nothing managed yet.
  const lock404 = new Error('nf', {cause: {response: {statusCode: 404}}})
  get.mockImplementation(async (path: string) => {
    if (path === 'loopress/v1/composer/lock') throw lock404
    return []
  })
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, post, put}
  return {cmd, get, logs, post, put}
}

const native = (slug: string, version = '1.0.0', status = 'active') => ({
  name: slug,
  plugin: `${slug}/${slug}.php`,
  status,
  version,
})

describe('plugin push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-plugin-push-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('bails out when the project uses a composer.json', async () => {
    writeFileSync(join(dir, 'composer.json'), '{}')
    const {cmd, get, logs} = make({plugins: {akismet: '5.3.3'}})

    const result = await cmd.run()

    expect(result.status).toBe('composer-managed')
    expect(get).not.toHaveBeenCalled()
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('lps composer push'))
  })

  it('errors when loopress.json has no plugins', async () => {
    const {cmd} = make({})
    await expect(cmd.run()).rejects.toThrow(/No plugins found/)
  })

  it('reports in-sync and posts nothing when the manifest matches a managed site', async () => {
    const {cmd, get, post} = make({plugins: {akismet: '5.3.3'}})
    const lock = JSON.stringify({packages: [{name: 'wpackagist-plugin/akismet'}]})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock' ? {composerLock: lock} : [native('akismet', '5.3.3')],
    )

    const result = await cmd.run()

    expect(result.status).toBe('in-sync')
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses to take over an unmanaged plugin folder without --force', async () => {
    const {cmd, get} = make({plugins: {woocommerce: '9.4.2'}})
    get.mockImplementation(async (path: string) => {
      if (path === 'loopress/v1/composer/lock') throw new Error('nf', {cause: {response: {statusCode: 404}}})
      return [native('woocommerce', '9.4.2')]
    })

    await expect(cmd.run()).rejects.toThrow(/--force/)
  })

  it('refuses a downgrade without --force', async () => {
    const {cmd, get} = make({plugins: {woocommerce: '9.4.2'}})
    const lock = JSON.stringify({packages: [{name: 'wpackagist-plugin/woocommerce'}]})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock' ? {composerLock: lock} : [native('woocommerce', '9.5.0')],
    )

    await expect(cmd.run()).rejects.toThrow(/downgrade/)
  })

  it('sends the plugins intent to /composer/sync on a real push', async () => {
    const {cmd, post} = make({plugins: {akismet: '5.3.3', woocommerce: '9.4.2'}})

    await cmd.run()

    expect(post).toHaveBeenCalledWith(
      'loopress/v1/composer/sync',
      {force: false, intent: {plugins: {akismet: '5.3.3', woocommerce: '9.4.2'}}, lock: null},
      {timeoutMs: 600_000},
    )
  })

  it('does not call the API on a dry run', async () => {
    const {cmd, post} = make({plugins: {akismet: '5.3.3'}})
    ;(cmd as unknown as {dryRun: boolean}).dryRun = true

    const result = await cmd.run()

    expect(post).not.toHaveBeenCalled()
    expect(result.status).toBe('dry-run')
    expect(result.installed).toEqual(['akismet'])
  })
})
