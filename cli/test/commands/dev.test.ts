import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Dev from '../../src/commands/dev.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {type WatchTarget} from '../../src/lib/dev-watch.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

// Real chokidar drives its watcher off actual filesystem timing (awaitWriteFinish's
// stabilityThreshold alone is 300ms), which makes the watch() options and its event handlers
// slow and flaky to exercise for real. A stub lets tests assert on the exact options passed to
// watch() and fire 'add'/'change'/'unlink' synchronously instead.
const {watchMock} = vi.hoisted(() => ({watchMock: vi.fn()}))
vi.mock('chokidar', () => ({watch: watchMock}))

type ChokidarEvent = 'add' | 'change' | 'unlink'

function fakeWatcher() {
  const handlers = new Map<ChokidarEvent, (path: string) => void>()
  const watcher = {
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: ChokidarEvent, handler: (path: string) => void) => {
      handlers.set(event, handler)
      return watcher
    }),
  }
  return {emit(event: ChokidarEvent, path: string) { handlers.get(event)?.(path); }, watcher}
}

type DevWithPushBatch = {
  pushBatch(changesByType: Map<string, string[]>, targets: WatchTarget[]): Promise<void>
}

type DevWithParseTypeFlag = {
  parseTypeFlag(raw: string, flagName: 'only' | 'skip'): string[]
}

function make(argv: string[] = []): Dev {
  return new Dev(argv, fakeOclifConfig)
}

describe('dev', () => {
  let dir: string

  beforeEach(() => {
    resetFakeOclifConfig()
    watchMock.mockReset()
    dir = mkdtempSync(join(tmpdir(), 'lps-dev-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    vi.mocked(readLocalConfig).mockResolvedValue({})
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, {force: true, recursive: true})
  })

  it('errors when no project is configured', async () => {
    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('No project configured')
  })

  it('errors when the project has no "local" environment', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue(null)

    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('No "local" environment configured')
    // Specifically the "local" environment, not just whatever the project happens to have.
    expect(configManager.getEnvironment).toHaveBeenCalledWith('acme', 'local')
  })

  it('rejects an unknown --only resource type without touching project config', async () => {
    const cmd = make(['--only=bogus'])
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Unknown resource type "bogus" in --only')
    expect(configManager.getCurrentProject).not.toHaveBeenCalled()
  })

  it('rejects an unknown --skip resource type', async () => {
    const cmd = make(['--skip=bogus'])
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Unknown resource type "bogus" in --skip')
  })

  it('errors when none of the selected resource directories exist', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue({addedAt: '2024-01-01', name: 'local', token: 'u:p', url: 'http://localhost'})

    const cmd = make()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('Nothing to watch')
  })

  describe('pushBatch', () => {
    const targets: WatchTarget[] = [
      {commandId: 'snippet:push', path: join('snippets'), type: 'snippets'},
      {commandId: 'page:push', path: join('pages'), type: 'pages'},
    ]

    it('pushes each changed type to local, sequentially', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const changes = new Map([
        ['pages', ['pages/home.html']],
        ['snippets', ['snippets/hello.php', 'snippets/world.php']],
      ])
      await (cmd as unknown as DevWithPushBatch).pushBatch(changes, targets)

      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(1, 'page:push', ['--env', 'local'])
      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(2, 'snippet:push', ['--env', 'local'])
      // Exact match on the joined path list, not a substring: proves the ", " separator between
      // multiple changed files, not just that both filenames appear somewhere in the message.
      expect(log).toHaveBeenCalledWith('\n→ snippets changed (hello.php, world.php), pushing to local...')
      expect(log).toHaveBeenCalledWith('✓ snippets synced')
      expect(log).toHaveBeenCalledWith('✓ pages synced')
    })

    it('skips a changed type that has no matching watch target', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const changes = new Map([
        ['pages', ['pages/home.html']],
        ['plugins', ['loopress.json']], // not in `targets` above
      ])
      await (cmd as unknown as DevWithPushBatch).pushBatch(changes, targets)

      expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(1)
      expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('page:push', ['--env', 'local'])
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('plugins'))
    })

    it('logs a failure and still pushes the remaining types', async () => {
      vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({})

      const cmd = make()
      const {log} = silenceLogs(cmd)
      const changes = new Map([
        ['pages', ['pages/home.html']],
        ['snippets', ['snippets/hello.php']],
      ])
      await (cmd as unknown as DevWithPushBatch).pushBatch(changes, targets)

      expect(log).toHaveBeenCalledWith('✗ pages failed: boom')
      expect(log).toHaveBeenCalledWith('✓ snippets synced')
      expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(2)
    })
  })

  it('starts watching once a project, a "local" environment, and a resource directory all exist', async () => {
    mkdirSync(join(dir, 'snippets'))
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'acme'})
    vi.spyOn(configManager, 'getEnvironment').mockReturnValue({addedAt: '2024-01-01', name: 'local', token: 'u:p', url: 'http://localhost'})
    const {emit, watcher} = fakeWatcher()
    watchMock.mockReturnValue(watcher)

    const cmd = make(['--only=snippets'])
    const {log} = silenceLogs(cmd)

    // `watch()` blocks on SIGINT; fire it once the "Watching..." line proves we got past every
    // pre-flight guard, so this test doesn't need to actually wait for a real file event.
    const runPromise = cmd.run()
    await vi.waitFor(() => { expect(log).toHaveBeenCalledWith(expect.stringContaining('Watching for changes')); })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Watching snippets:'))

    expect(watchMock).toHaveBeenCalledWith([join(dir, 'snippets')], {
      awaitWriteFinish: {pollInterval: 100, stabilityThreshold: 300},
      ignoreInitial: true,
      ignored: expect.any(Function),
    })
    const options = watchMock.mock.calls[0][1] as {ignored: (path: string) => boolean}
    expect(options.ignored(join('node_modules', 'foo.js'))).toBe(true)
    expect(options.ignored(join('snippets', 'foo.php'))).toBe(false)

    expect(watcher.on).toHaveBeenCalledWith('add', expect.any(Function))
    expect(watcher.on).toHaveBeenCalledWith('change', expect.any(Function))
    expect(watcher.on).toHaveBeenCalledWith('unlink', expect.any(Function))

    emit('unlink', join('snippets', 'gone.php'))
    expect(log).toHaveBeenCalledWith(`⚠ ${join('snippets', 'gone.php')} deleted locally, not synced automatically`)

    process.emit('SIGINT')
    await runPromise

    expect(watcher.close).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('\nStopped watching.')
  })

  describe('parseTypeFlag', () => {
    it('trims whitespace around each resource type', () => {
      const cmd = make()
      silenceLogs(cmd)

      const parsed = (cmd as unknown as DevWithParseTypeFlag).parseTypeFlag(' snippets , pages ', 'only')

      expect(parsed).toEqual(['snippets', 'pages'])
    })

    it('drops empty segments left by consecutive or trailing commas', () => {
      const cmd = make()
      silenceLogs(cmd)

      const parsed = (cmd as unknown as DevWithParseTypeFlag).parseTypeFlag('snippets,,pages,', 'only')

      expect(parsed).toEqual(['snippets', 'pages'])
    })

    it('reports the flag name and the full list of valid types in the error', () => {
      const cmd = make()
      silenceLogs(cmd)

      expect(() => (cmd as unknown as DevWithParseTypeFlag).parseTypeFlag('bogus', 'skip')).toThrow(
        'Unknown resource type "bogus" in --skip. Valid types: snippets, pages, api, plugins',
      )
    })
  })
})
