import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Dev from '../../src/commands/dev.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {WatchTarget} from '../../src/lib/dev-watch.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

type DevWithPushBatch = {
  pushBatch(changesByType: Map<string, string[]>, targets: WatchTarget[]): Promise<void>
}

function make(argv: string[] = []): Dev {
  return new Dev(argv, fakeOclifConfig)
}

describe('dev', () => {
  let dir: string

  beforeEach(() => {
    resetFakeOclifConfig()
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
        ['snippets', ['snippets/hello.php']],
      ])
      await (cmd as unknown as DevWithPushBatch).pushBatch(changes, targets)

      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(1, 'page:push', ['--env', 'local'])
      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(2, 'snippet:push', ['--env', 'local'])
      expect(log).toHaveBeenCalledWith(expect.stringContaining('→ snippets changed (hello.php)'))
      expect(log).toHaveBeenCalledWith('✓ snippets synced')
      expect(log).toHaveBeenCalledWith('✓ pages synced')
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

    const cmd = make(['--only=snippets'])
    const {log} = silenceLogs(cmd)

    // `watch()` blocks on SIGINT; fire it once the "Watching..." line proves we got past every
    // pre-flight guard, so this test doesn't need to actually wait for a real file event.
    const runPromise = cmd.run()
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining('Watching for changes')))
    process.emit('SIGINT')

    await runPromise
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Watching snippets:'))
  })
})
