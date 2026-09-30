import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../../src/commands/theme/version/push.js'
import {confirmUninstall} from '../../../../src/lib/interactive.js'
import {type EnvironmentConfig} from '../../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../../helpers/oclif.js'
import {makeEnv} from '../../../helpers/project-fixtures.js'

vi.mock('../../../../src/lib/interactive.js', () => ({confirmUninstall: vi.fn().mockResolvedValue(true)}))

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
  const lock404 = new Error('nf', {cause: {response: {statusCode: 404}}})
  get.mockImplementation(async (path: string) => {
    if (path === 'loopress/v1/composer/lock') throw lock404
    return []
  })
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, post}
  return {cmd, get, logs, post}
}

const native = (slug: string, version = '1.0.0', status: 'active' | 'inactive' = 'inactive') => ({
  status,
  stylesheet: slug,
  version,
})

function lockManaging(...slugs: string[]): string {
  return JSON.stringify({packages: slugs.map((slug) => ({name: `wpackagist-theme/${slug}`}))})
}

describe('theme push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-theme-push-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    vi.mocked(confirmUninstall).mockReset().mockResolvedValue(true)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('bails out when the project uses a composer.json', async () => {
    writeFileSync(join(dir, 'composer.json'), '{}')
    const {cmd, get, logs} = make({themes: {astra: '4.0.0'}})

    const result = await cmd.run()

    expect(result.status).toBe('composer-managed')
    expect(get).not.toHaveBeenCalled()
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('lps composer push'))
  })

  it('errors when loopress.json has no themes', async () => {
    const {cmd} = make({})
    await expect(cmd.run()).rejects.toThrow(/No themes found/)
  })

  it('reports in-sync and posts nothing when the manifest matches a managed site', async () => {
    const {cmd, get, post} = make({themes: {astra: '4.0.0'}})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock' ? {composerLock: lockManaging('astra')} : [native('astra', '4.0.0')],
    )

    const result = await cmd.run()

    expect(result.status).toBe('in-sync')
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses to take over an unmanaged theme folder without --force', async () => {
    const {cmd, get} = make({themes: {astra: '4.0.0'}})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock' ? {composerLock: '{"packages":[]}'} : [native('astra', '4.0.0')],
    )

    await expect(cmd.run()).rejects.toThrow(/--force/)
  })

  it('refuses a downgrade without --force', async () => {
    const {cmd, get} = make({themes: {astra: '4.0.0'}})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock' ? {composerLock: lockManaging('astra')} : [native('astra', '4.1.0')],
    )

    await expect(cmd.run()).rejects.toThrow(/downgrade/)
  })

  it("refuses to remove the site's active theme", async () => {
    // astra is active, installed, and managed, but absent from the manifest: it lands in
    // toRemove. generatepress is only there so the manifest isn't empty (a different error).
    const {cmd, get} = make({themes: {generatepress: '3.4.0'}})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock'
        ? {composerLock: lockManaging('astra', 'generatepress')}
        : [native('astra', '4.0.0', 'active'), native('generatepress', '3.4.0')],
    )

    await expect(cmd.run()).rejects.toThrow(/active theme/)
  })

  it("refuses to force-take-over the site's active theme too", async () => {
    const {cmd, get} = make({themes: {astra: '4.0.0'}}, ['--force'])
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock' ? {composerLock: '{"packages":[]}'} : [native('astra', '4.0.0', 'active')],
    )

    await expect(cmd.run()).rejects.toThrow(/active theme/)
  })

  it('sends the themes intent to /composer/sync on a real push', async () => {
    const {cmd, post} = make({themes: {astra: '4.0.0', generatepress: '3.4.0'}})

    await cmd.run()

    expect(post).toHaveBeenCalledWith(
      'loopress/v1/composer/sync',
      {force: false, intent: {themes: {astra: '4.0.0', generatepress: '3.4.0'}}, lock: null},
      {timeoutMs: 600_000},
    )
  })

  it('does not call the API on a dry run', async () => {
    const {cmd, post} = make({themes: {astra: '4.0.0'}})
    ;(cmd as unknown as {dryRun: boolean}).dryRun = true

    const result = await cmd.run()

    expect(post).not.toHaveBeenCalled()
    expect(result.status).toBe('dry-run')
    expect(result.installed).toEqual(['astra'])
  })

  it('aborts without pushing when the uninstall confirmation is declined', async () => {
    vi.mocked(confirmUninstall).mockResolvedValueOnce(false)
    // astra is managed and inactive but dropped from the manifest: it lands in toRemove
    // without tripping the active-theme guard, so confirmUninstall is what's actually gating it.
    const {cmd, get, post} = make({themes: {generatepress: '3.4.0'}})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock'
        ? {composerLock: lockManaging('astra', 'generatepress')}
        : [native('astra', '4.0.0', 'inactive'), native('generatepress', '3.4.0')],
    )

    await expect(cmd.run()).rejects.toThrow('Aborted.')
    expect(post).not.toHaveBeenCalled()
  })

  it('includes collisions in "installed" only when pushing with --force', async () => {
    const {cmd} = make({themes: {astra: '4.0.0'}}, ['--force'])

    const result = await cmd.run()

    expect(result.installed).toEqual(['astra'])
  })

  it('rejects with a clear message when the server rejects the push over an unmanaged collision', async () => {
    const {cmd, post} = make({themes: {astra: '4.0.0'}}, ['--force'])
    post.mockRejectedValue(
      new Error('conflict', {
        cause: {
          response: {
            body: JSON.stringify({collisions: [{slug: 'astra'}], error: 'unmanaged_plugins_present'}),
            statusCode: 422,
          },
        },
      }),
    )

    await expect(cmd.run()).rejects.toThrow(/--force/)
  })

  it('propagates a non-404 error fetching the instance lock', async () => {
    const {cmd, get} = make({themes: {astra: '4.0.0'}})
    get.mockImplementation(async (path: string) => {
      if (path === 'loopress/v1/composer/lock') throw new Error('server error', {cause: {response: {statusCode: 500}}})
      return []
    })

    await expect(cmd.run()).rejects.toThrow('server error')
  })

  it('still refreshes when only a "latest" pin exists (no other drift)', async () => {
    const {cmd, get, logs, post} = make({themes: {astra: 'latest'}})
    get.mockImplementation(async (path: string) =>
      path === 'loopress/v1/composer/lock' ? {composerLock: lockManaging('astra')} : [native('astra', '4.0.0')],
    )

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Refreshing themes pinned to "latest"'))
    expect(post).toHaveBeenCalled()
  })

  describe('plan output and exact messages', () => {
    function lines(logs: ReturnType<typeof silenceLogs>): string[] {
      return logs.log.mock.calls.map(([line]) => String(line))
    }

    it('logs every planned change, the trimmed sync output, then success', async () => {
      const {cmd, get, logs, post} = make({themes: {astra: '4.1.0', kadence: '1.0.0', neve: '3.0.0'}}, ['--force'])
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockManaging('astra', 'twentytwenty')}
          : [native('astra', '4.0.0'), native('twentytwenty'), native('neve', '3.0.0')],
      )
      // No `removed` in the response: falls back to the uninstalls the plan previewed.
      post.mockResolvedValue({...SYNC_OK, output: '  done  \n', removed: undefined})

      const result = await cmd.run()

      expect(lines(logs)).toEqual([
        'Pushing themes to https://acme.com',
        '  + kadence 1.0.0',
        '  ~ astra 4.0.0 to 4.1.0',
        '  - twentytwenty',
        '  ! neve (take over)',
        'done',
        'Themes synced.',
      ])
      expect(result).toEqual({
        installed: ['kadence', 'neve'],
        pinned: ['astra'],
        removed: ['twentytwenty'],
        status: 'success',
      })
    })

    it('does not log an empty sync output', async () => {
      const {cmd, logs, post} = make({themes: {astra: '4.0.0'}})
      post.mockResolvedValue({...SYNC_OK, output: '  '})

      await cmd.run()

      expect(lines(logs)).not.toContain('')
      expect(lines(logs)).toContain('Themes synced.')
    })

    it('says everything is in sync without the "latest" refresh line when there is nothing to do', async () => {
      const {cmd, get, logs, post} = make({themes: {astra: '4.0.0'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock' ? {composerLock: lockManaging('astra')} : [native('astra', '4.0.0')],
      )

      const result = await cmd.run()

      expect(lines(logs)).toContain('Everything is already in sync.')
      expect(post).not.toHaveBeenCalled()
      expect(result).toEqual({installed: [], pinned: [], removed: [], status: 'in-sync'})
    })

    it('does not log the "latest" refresh line when there is real drift to push', async () => {
      const {cmd, logs} = make({themes: {astra: 'latest', kadence: '1.0.0'}})

      await cmd.run()

      expect(lines(logs)).not.toContain('Refreshing themes pinned to "latest" to their newest releases.')
    })

    it('names every colliding theme and its version in the refusal', async () => {
      const {cmd, get} = make({themes: {astra: '4.0.0'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock' ? {composerLock: lockManaging()} : [native('astra', '3.9.0')],
      )

      await expect(cmd.run()).rejects.toThrow(
        'astra (3.9.0) installed outside Loopress. Re-run with --force to take them over, or remove them from loopress.json.',
      )
    })

    it('names the downgrade in the refusal, and lets it through with --force', async () => {
      const refused = make({themes: {astra: '4.0.0'}})
      const forced = make({themes: {astra: '4.0.0'}}, ['--force'])
      for (const {get} of [refused, forced]) {
        get.mockImplementation(async (path: string) =>
          path === 'loopress/v1/composer/lock' ? {composerLock: lockManaging('astra')} : [native('astra', '4.1.0')],
        )
      }

      await expect(refused.cmd.run()).rejects.toThrow(
        'Refusing to downgrade: astra 4.1.0 to 4.0.0. Re-run with --force.',
      )
      await forced.cmd.run()
      expect(forced.post).toHaveBeenCalledWith(
        'loopress/v1/composer/sync',
        {force: true, intent: {themes: {astra: '4.0.0'}}, lock: null},
        {timeoutMs: 600_000},
      )
    })

    it('names the active theme it refuses to remove', async () => {
      const {cmd, get} = make({themes: {astra: '4.0.0'}})
      get.mockImplementation(async (path: string) =>
        path === 'loopress/v1/composer/lock'
          ? {composerLock: lockManaging('astra', 'twentytwenty')}
          : [native('astra', '4.0.0'), native('twentytwenty', '1.0.0', 'active')],
      )

      await expect(cmd.run()).rejects.toThrow(
        'Refusing to uninstall "twentytwenty": it is the site\'s active theme. Switch the site to another theme, then re-run to remove it.',
      )
    })

    it('uses the exact collision refusal message from the server', async () => {
      const {cmd, post} = make({themes: {astra: '4.0.0'}})
      post.mockRejectedValue(
        new Error('conflict', {
          cause: {
            response: {
              body: JSON.stringify({collisions: [{slug: 'astra'}], error: 'unmanaged_plugins_present'}),
              statusCode: 422,
            },
          },
        }),
      )

      await expect(cmd.run()).rejects.toThrow(
        'The site rejected the push: themes installed outside Loopress. Re-run with --force.',
      )
    })

    it('rethrows any other sync failure unchanged', async () => {
      const {cmd, post} = make({themes: {astra: '4.0.0'}})
      post.mockRejectedValue(new Error('composer blew up'))

      await expect(cmd.run()).rejects.toThrow('composer blew up')
    })
  })
})
