import {confirm} from '@inquirer/prompts'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type ResourceState} from '../../src/lib/diff-state.js'
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

  async testCaptureBeforePushState(provider: ResourceStateProvider, dir: string) {
    return this.captureBeforePushState(provider, dir)
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

  async testWriteAfterPushSnapshot(provider: ResourceStateProvider, dir: string, beforeState: ResourceState | undefined) {
    await this.writeAfterPushSnapshot(provider, dir, beforeState)
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

  describe('captureBeforePushState() / writeAfterPushSnapshot()', () => {
    let rootDir: string

    beforeEach(() => {
      rootDir = mkdtempSync(join(tmpdir(), 'lps-push-command-snapshot-'))
    })

    afterEach(() => {
      rmSync(rootDir, {force: true, recursive: true})
    })

    function makeWithClient(dryRun: boolean, siteConfig: EnvironmentConfig): TestPush {
      const cmd = make(dryRun, siteConfig)
      cmd.setRootDir(rootDir)
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {}
      return cmd
    }

    it('captureBeforePushState reads and returns the remote state', async () => {
      const cmd = makeWithClient(false, SITE)
      const remote = vi.fn(async () => new Map([['1', {name: 'on site now'}]]))

      const beforeState = await cmd.testCaptureBeforePushState(fakeProvider({remote}), rootDir)

      expect(remote).toHaveBeenCalledOnce()
      expect(beforeState).toEqual(new Map([['1', {name: 'on site now'}]]))
    })

    it('captureBeforePushState does nothing on a dry run', async () => {
      const cmd = makeWithClient(true, SITE)
      const remote = vi.fn(async () => new Map())

      const beforeState = await cmd.testCaptureBeforePushState(fakeProvider({remote}), rootDir)

      expect(remote).not.toHaveBeenCalled()
      expect(beforeState).toBeUndefined()
    })

    it('captureBeforePushState warns and returns undefined when the remote read fails', async () => {
      const cmd = makeWithClient(false, SITE)
      const warn = vi.spyOn(cmd, 'warn').mockImplementation((input) => input)

      const beforeState = await cmd.testCaptureBeforePushState(
        fakeProvider({
          async remote() {
            throw new Error('site unreachable')
          },
        }),
        rootDir,
      )

      expect(beforeState).toBeUndefined()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('site unreachable'))
    })

    it('writeAfterPushSnapshot pairs beforeState with a fresh post-push remote read, not the local files', async () => {
      const cmd = makeWithClient(false, SITE)
      const beforeState = new Map([['1', {name: 'on site before'}]])
      // Deliberately different from what a naive "local files about to be pushed" read would
      // have shown, the exact case a server-assigned id or a readonly-skipped item produces:
      // what actually landed on the server is the only correct after-state.
      const remote = vi.fn(async () => new Map([['1', {name: 'on site after'}]]))
      const local = vi.fn(async () => new Map([['1', {name: 'never pushed, irrelevant'}]]))

      await cmd.testWriteAfterPushSnapshot(fakeProvider({local, remote}), rootDir, beforeState)

      expect(local).not.toHaveBeenCalled()
      expect(remote).toHaveBeenCalledOnce()
      const [snapshot] = await listSnapshots(rootDir, 'snippet', 'test')
      expect(snapshot.environment).toBe('test')
    })

    it('writeAfterPushSnapshot does nothing on a dry run', async () => {
      const cmd = makeWithClient(true, SITE)
      const remote = vi.fn(async () => new Map())

      await cmd.testWriteAfterPushSnapshot(fakeProvider({remote}), rootDir, new Map([['1', {}]]))

      expect(remote).not.toHaveBeenCalled()
      expect(await listSnapshots(rootDir, 'snippet', 'test')).toEqual([])
    })

    it('writeAfterPushSnapshot does nothing when beforeState is undefined (capture already failed or was a dry run)', async () => {
      const cmd = makeWithClient(false, SITE)
      const remote = vi.fn(async () => new Map())

      await cmd.testWriteAfterPushSnapshot(fakeProvider({remote}), rootDir, undefined)

      expect(remote).not.toHaveBeenCalled()
      expect(await listSnapshots(rootDir, 'snippet', 'test')).toEqual([])
    })

    it('writeAfterPushSnapshot warns instead of throwing when the post-push remote read fails', async () => {
      const cmd = makeWithClient(false, SITE)
      const warn = vi.spyOn(cmd, 'warn').mockImplementation((input) => input)

      await cmd.testWriteAfterPushSnapshot(
        fakeProvider({
          async remote() {
            throw new Error('site unreachable')
          },
        }),
        rootDir,
        new Map([['1', {}]]),
      )

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('site unreachable'))
      expect(await listSnapshots(rootDir, 'snippet', 'test')).toEqual([])
    })
  })
})
