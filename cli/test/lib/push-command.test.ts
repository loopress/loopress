import {confirm} from '@inquirer/prompts'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PushCommand} from '../../src/lib/push-command.js'
import {type ResourceStateProvider} from '../../src/lib/resource-state.js'
import {listSnapshots} from '../../src/lib/snapshot-store.js'
import {type EnvironmentConfig} from '../../src/types/config.js'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

// Tests run without a TTY; keep that default and flip to true only in the tests that cover
// the interactive confirmation path.
const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../src/lib/interactive.js', () => ({
  isInteractive: () => interactive.value,
}))

const SITE: EnvironmentConfig = {addedAt: '2024-01-01', name: 'test', url: 'https://example.com'}
const PRODUCTION: EnvironmentConfig = {addedAt: '2024-01-01', name: 'production', url: 'https://acme.com'}

class TestPush extends PushCommand {
  calls: Array<'failure' | 'success'> = []

  protected override async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    this.calls.push(status)
  }

  async run(): Promise<void> {}

  setRootDir(rootDir: string) {
    this.localConfig = {rootDir}
  }

  setup(dryRun: boolean, siteConfig?: EnvironmentConfig) {
    this.dryRun = dryRun
    this.siteConfig = siteConfig!
  }

  setYes(value: boolean) {
    this.yes = value
  }

  async testCatch(err: Error) {
    try {
      await this.catch(err)
    } catch {}
  }

  async testGuard() {
    await this.guardProductionPush()
  }

  async testRecordSuccess() {
    await this.recordSuccess()
  }

  async testSnapshotBeforePush(provider: ResourceStateProvider, dir: string) {
    await this.snapshotBeforePush(provider, dir)
  }
}

function make(dryRun: boolean, siteConfig?: EnvironmentConfig): TestPush {
  const cmd = new TestPush([], {} as never)
  cmd.setup(dryRun, siteConfig)
  return cmd
}

// A minimal stand-in ResourceStateProvider, just enough for snapshotBeforePush() to call
// remote()/local() and hand the results to writeSnapshot().
function fakeProvider(options: {
  local?: () => Promise<Map<string, unknown>>
  remote?: () => Promise<Map<string, unknown>>
}): ResourceStateProvider {
  return {
    dirKind: 'snippets',
    local: options.local ?? (async () => new Map([['1', {name: 'local'}]])),
    remote: options.remote ?? (async () => new Map([['1', {name: 'remote'}]])),
    resource: 'snippet',
    title: 'Snippets',
  }
}

describe('PushCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    interactive.value = false
  })

  describe('guardProductionPush()', () => {
    it('lets non-production environments through silently', async () => {
      const cmd = make(false, SITE)

      await cmd.testGuard()

      expect(confirm).not.toHaveBeenCalled()
    })

    it('refuses a production push without --yes outside a TTY', async () => {
      const cmd = make(false, PRODUCTION)

      await expect(cmd.testGuard()).rejects.toThrow(/production.*--yes/)
    })

    it('matches the environment name case-insensitively', async () => {
      const cmd = make(false, {...PRODUCTION, name: 'Production'})

      await expect(cmd.testGuard()).rejects.toThrow(/production.*--yes/)
    })

    it('lets a production push through with --yes without prompting', async () => {
      const cmd = make(false, PRODUCTION)
      cmd.setYes(true)

      await cmd.testGuard()

      expect(confirm).not.toHaveBeenCalled()
    })

    it('is skipped on dry-run', async () => {
      const cmd = make(true, PRODUCTION)

      await cmd.testGuard()

      expect(confirm).not.toHaveBeenCalled()
    })

    it('asks in a TTY and proceeds when accepted', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(true)
      const cmd = make(false, PRODUCTION)

      await cmd.testGuard()

      expect(confirm).toHaveBeenCalledWith({default: true, message: 'Push to production (https://acme.com)?'})
    })

    it('asks in a TTY and aborts when declined', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(false)
      const cmd = make(false, PRODUCTION)

      await expect(cmd.testGuard()).rejects.toThrow('Aborted.')
    })

    it('does not record a failure deployment when the guard refused', async () => {
      const cmd = make(false, PRODUCTION)

      await expect(cmd.testGuard()).rejects.toThrow()
      await cmd.testCatch(new Error('refused'))

      expect(cmd.calls).toEqual([])
    })
  })

  describe('recordSuccess()', () => {
    it('records success when dryRun is false', async () => {
      const cmd = make(false, SITE)
      await cmd.testRecordSuccess()
      expect(cmd.calls).toEqual(['success'])
    })

    it('does not record when dryRun is true', async () => {
      const cmd = make(true, SITE)
      await cmd.testRecordSuccess()
      expect(cmd.calls).toHaveLength(0)
    })
  })

  describe('catch()', () => {
    it('records failure when dryRun is false', async () => {
      const cmd = make(false, SITE)
      await cmd.testCatch(new Error('boom'))
      expect(cmd.calls).toEqual(['failure'])
    })

    it('does not record when dryRun is true', async () => {
      const cmd = make(true, SITE)
      await cmd.testCatch(new Error('boom'))
      expect(cmd.calls).toHaveLength(0)
    })

    it('does not record when siteConfig is not set', async () => {
      const cmd = make(false)
      await cmd.testCatch(new Error('boom'))
      expect(cmd.calls).toHaveLength(0)
    })
  })

  describe('snapshotBeforePush()', () => {
    let rootDir: string

    beforeEach(() => {
      rootDir = mkdtempSync(join(tmpdir(), 'lps-push-command-snapshot-'))
    })

    afterEach(() => {
      rmSync(rootDir, {force: true, recursive: true})
    })

    it('writes a snapshot of the remote (before) and local (about to be pushed) state', async () => {
      const cmd = make(false, SITE)
      cmd.setRootDir(rootDir)
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {}

      await cmd.testSnapshotBeforePush(
        fakeProvider({local: async () => new Map([['1', {name: 'about to push'}]]), remote: async () => new Map([['1', {name: 'on site now'}]])}),
        rootDir,
      )

      const [snapshot] = await listSnapshots(rootDir, 'snippet')
      expect(snapshot.environment).toBe('test')
    })

    it('does nothing on a dry run', async () => {
      const cmd = make(true, SITE)
      cmd.setRootDir(rootDir)
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {}
      const remote = vi.fn(async () => new Map())

      await cmd.testSnapshotBeforePush(fakeProvider({remote}), rootDir)

      expect(remote).not.toHaveBeenCalled()
      expect(await listSnapshots(rootDir, 'snippet')).toEqual([])
    })

    it('warns instead of throwing when reading the remote or local state fails', async () => {
      const cmd = make(false, SITE)
      cmd.setRootDir(rootDir)
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {}
      const warn = vi.spyOn(cmd, 'warn').mockImplementation((input) => input)

      await cmd.testSnapshotBeforePush(
        fakeProvider({
          async remote() {
            throw new Error('site unreachable')
          },
        }),
        rootDir,
      )

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('site unreachable'))
      expect(await listSnapshots(rootDir, 'snippet')).toEqual([])
    })
  })
})
