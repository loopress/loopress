import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/plugin/push.js'
import {confirmUninstall} from '../../../src/lib/interactive.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('../../../src/lib/interactive.js', () => ({confirmUninstall: vi.fn(async () => true)}))

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

  // Serves the site's plugin list, switching to `after` once the Composer sync has run, and an
  // instance lock listing `locked`.
  function site(
    {get, post}: Pick<ReturnType<typeof make>, 'get' | 'post'>,
    plugins: {after: unknown[]; before: unknown[]; locked: string[]},
  ) {
    const composerLock = JSON.stringify({packages: plugins.locked.map((name) => ({name: `wpackagist-plugin/${name}`}))})
    get.mockImplementation(async (path: string) => {
      if (path === 'loopress/v1/composer/lock') return {composerLock}
      return post.mock.calls.length > 0 ? plugins.after : plugins.before
    })
  }

  const statusCalls = (put: ReturnType<typeof vi.fn>) =>
    put.mock.calls.map(([path, body]) => `${String(path).split('/', 4)[3]} ${(body as {status: string}).status}`)

  describe('active state recorded in loopress.json', () => {
    it('deactivates a plugin pinned inactive, and never activates one it installs inactive', async () => {
      const {cmd, get, post, put} = make({
        plugins: {akismet: {active: false, version: '5.3.3'}, 'hello-dolly': {active: false, version: '1.7.2'}},
      })
      site(
        {get, post},
        {
          after: [native('hello-dolly', '1.7.2'), native('akismet', '5.3.3', 'inactive')],
          before: [native('hello-dolly', '1.7.2')],
          locked: ['hello-dolly'],
        },
      )

      const result = await cmd.run()

      expect(post).toHaveBeenCalledWith(
        'loopress/v1/composer/sync',
        {force: false, intent: {plugins: {akismet: '5.3.3', 'hello-dolly': '1.7.2'}}, lock: null},
        expect.anything(),
      )
      expect(statusCalls(put)).toEqual(['hello-dolly inactive'])
      expect(result.deactivated).toEqual(['hello-dolly'])
      expect(result.activated).toEqual([])
    })

    it('rejects --activate, which only makes sense for composer.json', async () => {
      const {cmd} = make({plugins: {akismet: '5.3.3'}}, ['--activate'])
      await expect(cmd.run()).rejects.toThrow('--activate only applies to projects with a composer.json')
    })
  })

  describe('with a composer.json', () => {
    const composerJson = {
      require: {
        'monolog/monolog': '^3.0',
        'wpackagist-plugin/akismet': '5.3.3',
        'wpackagist-plugin/hello-dolly': '^1.7',
        'wpackagist-plugin/woocommerce': '9.5.0',
        'wpackagist-theme/astra': '4.1.0',
      },
    }
    const before = [native('hello-dolly', '1.7.2', 'inactive'), native('woocommerce', '9.4.2')]
    const after = [...before, native('akismet', '5.3.3', 'inactive')]

    beforeEach(() => {
      writeFileSync(join(dir, 'composer.json'), JSON.stringify(composerJson))
    })

    it('pushes the whole file, restores plugins it switched off, and activates nothing else', async () => {
      const {cmd, get, logs, post, put} = make({plugins: {ignored: '1.0.0'}})
      site({get, post}, {after, before, locked: ['hello-dolly', 'woocommerce']})

      const result = await cmd.run()

      expect(post).toHaveBeenCalledWith(
        'loopress/v1/composer/sync',
        {
          force: false,
          intent: {
            libraries: {'monolog/monolog': '^3.0'},
            plugins: {akismet: '5.3.3', 'hello-dolly': '^1.7', woocommerce: '9.5.0'},
            themes: {astra: '4.1.0'},
          },
          lock: null,
        },
        expect.anything(),
      )
      // woocommerce is switched off for its file swap, then back on; nothing else is touched.
      expect(statusCalls(put)).toEqual(['woocommerce inactive', 'woocommerce active'])
      expect(result.activated).toEqual(['woocommerce'])
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('pushed whole (5 packages)'))
      expect(logs.log).toHaveBeenCalledWith('2 plugin(s) from composer.json are inactive: hello-dolly, akismet.')
    })

    it('activates every plugin it declares with --activate', async () => {
      const {cmd, get, post, put} = make({}, ['--activate'])
      site({get, post}, {after, before, locked: ['hello-dolly', 'woocommerce']})

      await cmd.run()

      expect(statusCalls(put)).toEqual([
        'woocommerce inactive',
        'woocommerce active',
        'hello-dolly active',
        'akismet active',
      ])
    })

    it('errors when composer.json declares no plugin', async () => {
      writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'monolog/monolog': '^3.0'}}))
      const {cmd} = make({})
      await expect(cmd.run()).rejects.toThrow('No wpackagist-plugin/* package in composer.json')
    })
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

  it('re-activates a plugin it deactivated for a forced takeover', async () => {
    const {cmd, get, put} = make({plugins: {woocommerce: '9.4.2'}}, ['--force'])
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock'
        ? {composerLock: '{"packages":[]}'}
        : [native('woocommerce', '9.4.2', 'active')],
    )

    const result = await cmd.run()

    expect(put).toHaveBeenCalledWith('wp/v2/plugins/woocommerce/woocommerce.php', {status: 'inactive'})
    expect(put).toHaveBeenCalledWith('wp/v2/plugins/woocommerce/woocommerce.php', {status: 'active'})
    expect(result.activated).toContain('woocommerce')
  })

  it('activates a plugin freshly installed by this push', async () => {
    const {cmd, get, put} = make({plugins: {akismet: '5.3.3'}})
    let pluginsCalls = 0
    get.mockImplementation(async (path: string) => {
      if (path === 'loopress/v1/composer/lock') throw new Error('nf', {cause: {response: {statusCode: 404}}})
      pluginsCalls += 1
      // Not installed yet on the pre-sync fetch; present (inactive) once sync() installs it.
      return pluginsCalls === 1 ? [] : [native('akismet', '5.3.3', 'inactive')]
    })

    const result = await cmd.run()

    expect(put).toHaveBeenCalledWith('wp/v2/plugins/akismet/akismet.php', {status: 'active'})
    expect(result.activated).toContain('akismet')
  })

  it('restores the plugins it deactivated when the sync fails', async () => {
    const {cmd, get, post, put} = make({plugins: {woocommerce: '9.4.2'}}, ['--force'])
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock'
        ? {composerLock: '{"packages":[]}'}
        : [native('woocommerce', '9.4.2', 'active')],
    )
    post.mockRejectedValue(new Error('composer blew up'))

    await expect(cmd.run()).rejects.toThrow(/composer blew up/)

    expect(put).toHaveBeenCalledWith('wp/v2/plugins/woocommerce/woocommerce.php', {status: 'inactive'})
    expect(put).toHaveBeenCalledWith('wp/v2/plugins/woocommerce/woocommerce.php', {status: 'active'})
  })

  describe('plan, prune, removal and sync edge cases', () => {
    const lockOf = (...slugs: string[]) =>
      JSON.stringify({packages: slugs.map((slug) => ({name: `wpackagist-plugin/${slug}`}))})

    beforeEach(() => {
      vi.mocked(confirmUninstall).mockReset().mockResolvedValue(true)
    })

    function lines(logs: ReturnType<typeof silenceLogs>): string[] {
      return logs.log.mock.calls.map(([line]) => String(line))
    }

    it('logs one plan section per kind of change, then the sync output', async () => {
      const {cmd, get, logs, post} = make({plugins: {akismet: '5.3.3', hello: '1.0.0', woocommerce: '9.4.2'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockOf('hello', 'woocommerce', 'jetpack')}
          : [native('hello', '1.0.0', 'inactive'), native('woocommerce', '9.3.0'), native('jetpack', '1.0.0')],
      )
      // No `removed` in the response: falls back to the uninstalls the plan previewed.
      post.mockResolvedValue({...SYNC_OK, output: '  Installed akismet  \n', removed: undefined})

      const result = await cmd.run()

      expect(lines(logs)).toEqual(
        expect.arrayContaining([
          'Pushing plugins to https://acme.com',
          '\nTo install (1):',
          '  + akismet 5.3.3',
          '\nTo re-pin (1):',
          '  ~ woocommerce 9.3.0 to 9.4.2',
          '\nTo activate (1):',
          '  ↑ hello',
          '\nTo uninstall (1):',
          '  - jetpack',
          '  ⊘ deactivating jetpack',
          'Installed akismet',
          'Plugins synced.',
        ]),
      )
      expect(lines(logs)).not.toContain('\nTo take over (0):')
      expect(result).toEqual({
        activated: ['woocommerce', 'hello'],
        deactivated: [],
        installed: ['akismet'],
        pinned: ['woocommerce'],
        pruned: [],
        removed: ['jetpack'],
        status: 'success',
      })
      expect(confirmUninstall).toHaveBeenCalledWith(['jetpack'], false)
    })

    it('takes the removed list from the server response when it returns one', async () => {
      const {cmd, get, post} = make({plugins: {akismet: '5.3.3'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockOf('akismet', 'jetpack')}
          : [native('akismet', '5.3.3')],
      )
      post.mockResolvedValue({...SYNC_OK, removed: ['jetpack', 'other']})

      const result = await cmd.run()

      expect(result.removed).toEqual(['jetpack', 'other'])
    })

    it('does not log an empty sync output', async () => {
      const {cmd, logs, post} = make({plugins: {akismet: '5.3.3'}})
      post.mockResolvedValue({...SYNC_OK, output: ' '.repeat(3)})

      await cmd.run()

      expect(lines(logs)).not.toContain('')
      expect(lines(logs)).toContain('Plugins synced.')
    })

    it('aborts before touching the site when the uninstall is declined', async () => {
      vi.mocked(confirmUninstall).mockResolvedValue(false)
      const {cmd, get, post, put} = make({plugins: {akismet: '5.3.3'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockOf('akismet', 'jetpack')}
          : [native('akismet', '5.3.3'), native('jetpack')],
      )

      await expect(cmd.run()).rejects.toThrow('Aborted.')
      expect(put).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    })

    it('passes --yes through to the uninstall confirmation', async () => {
      const {cmd} = make({plugins: {akismet: '5.3.3'}}, ['--yes'])
      ;(cmd as unknown as {yes: boolean}).yes = true

      await cmd.run()

      expect(confirmUninstall).toHaveBeenCalledWith([], true)
    })

    it('deactivates untracked active plugins with --prune, and reports them as pruned', async () => {
      const {cmd, get, logs, post, put} = make({plugins: {akismet: '5.3.3'}}, ['--prune'])
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockOf('akismet')}
          : [native('akismet', '5.3.3'), native('hello', '1.0.0'), native('dormant', '1.0.0', 'inactive')],
      )

      const result = await cmd.run()

      expect(post).toHaveBeenCalled()
      expect(put).toHaveBeenCalledTimes(1)
      expect(put).toHaveBeenCalledWith('wp/v2/plugins/hello/hello.php', {status: 'inactive'})
      expect(lines(logs)).toEqual(expect.arrayContaining(['\nTo deactivate (--prune) (1):', '  ⊘ hello']))
      expect(result.pruned).toEqual(['hello'])
    })

    it('leaves untracked plugins alone without --prune, and then has nothing to do', async () => {
      const {cmd, get, logs, post} = make({plugins: {akismet: '5.3.3'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockOf('akismet')}
          : [native('akismet', '5.3.3'), native('hello', '1.0.0')],
      )

      const result = await cmd.run()

      expect(post).not.toHaveBeenCalled()
      expect(lines(logs)).toContain('Everything is already in sync.')
      expect(result).toEqual({
        activated: [],
        deactivated: [],
        installed: [],
        pinned: [],
        pruned: [],
        removed: [],
        status: 'in-sync',
      })
    })

    it('still syncs a manifest pinned to "latest" that shows no drift, to pick up a newer release', async () => {
      const {cmd, get, logs, post} = make({plugins: {akismet: 'latest'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock' ? {composerLock: lockOf('akismet')} : [native('akismet', '5.3.3')],
      )

      const result = await cmd.run()

      expect(lines(logs)).toContain('Refreshing plugins not pinned to an exact version to their newest releases.')
      expect(post).toHaveBeenCalled()
      expect(result.status).toBe('success')
    })

    it('does not log the "latest" refresh line when there is real drift to push', async () => {
      const {cmd, logs} = make({plugins: {akismet: 'latest', hello: '1.0.0'}})

      await cmd.run()

      expect(lines(logs)).not.toContain('Refreshing plugins not pinned to an exact version to their newest releases.')
    })

    it('lists the take-over section and reports collisions as installed with --force, including on a dry run', async () => {
      const {cmd, get, logs} = make({plugins: {woocommerce: '9.4.2'}}, ['--force'])
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock' ? {composerLock: lockOf()} : [native('woocommerce', '9.4.2')],
      )

      const result = await cmd.run()

      expect(lines(logs)).toEqual(
        expect.arrayContaining(['\nTo take over (1):', '  ! woocommerce (installed outside Loopress)']),
      )
      expect(result.installed).toEqual(['woocommerce'])
    })

    it('names every colliding plugin and its version in the refusal', async () => {
      const {cmd, get} = make({plugins: {akismet: '5.3.3', woocommerce: '9.4.2'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockOf()}
          : [native('woocommerce', '9.4.2'), native('akismet', '5.0.0')],
      )

      await expect(cmd.run()).rejects.toThrow(
        /^2 plugin\(s\) are already installed outside Loopress: (woocommerce \(9\.4\.2\), akismet \(5\.0\.0\)|akismet \(5\.0\.0\), woocommerce \(9\.4\.2\))\./,
      )
    })

    it('names the downgrade in the refusal', async () => {
      const {cmd, get} = make({plugins: {woocommerce: '9.4.2'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock' ? {composerLock: lockOf('woocommerce')} : [native('woocommerce', '9.5.0')],
      )

      await expect(cmd.run()).rejects.toThrow(/^Refusing to downgrade: woocommerce 9\.5\.0 to 9\.4\.2\./)
    })

    it('lets a downgrade through with --force', async () => {
      const {cmd, get, post} = make({plugins: {woocommerce: '9.4.2'}}, ['--force'])
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock' ? {composerLock: lockOf('woocommerce')} : [native('woocommerce', '9.5.0')],
      )

      await cmd.run()

      expect(post).toHaveBeenCalledWith('loopress/v1/composer/sync', expect.objectContaining({force: true}), {
        timeoutMs: 600_000,
      })
    })

    it('turns a 422 unmanaged-plugins refusal from the site into an actionable error', async () => {
      const {cmd, post} = make({plugins: {akismet: '5.3.3'}})
      post.mockRejectedValue(
        new Error('422', {
          cause: {
            response: {
              body: JSON.stringify({
                collisions: [{slug: 'akismet'}, {slug: 'hello'}],
                error: 'unmanaged_plugins_present',
              }),
              statusCode: 422,
            },
          },
        }),
      )

      await expect(cmd.run()).rejects.toThrow(
        'The site rejected the push: akismet, hello installed outside Loopress. Re-run with --force.',
      )
    })

    it('rethrows a failure reading the instance lock that is not a 404', async () => {
      const {cmd, get} = make({plugins: {akismet: '5.3.3'}})
      get.mockImplementation(async (path: string) => {
        if (path === 'loopress/v1/composer/lock')
          throw new Error('server error', {cause: {response: {statusCode: 500}}})
        return []
      })

      await expect(cmd.run()).rejects.toThrow('server error')
    })

    it('skips activating a freshly installed plugin that still is not listed after the sync', async () => {
      const {cmd, put} = make({plugins: {akismet: '5.3.3'}})

      const result = await cmd.run()

      expect(put).not.toHaveBeenCalled()
      expect(result.activated).toEqual([])
    })
  })
})
