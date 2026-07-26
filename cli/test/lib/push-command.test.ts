import {confirm} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {PushCommand} from '../../src/lib/push-command.js'
import {EnvironmentConfig} from '../../src/types/config.js'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

// Tests run without a TTY; keep that default and flip to true only in the tests that cover
// the interactive confirmation path.
const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../src/lib/interactive.js', () => ({
  isInteractive: () => interactive.value,
}))

const SITE: EnvironmentConfig = {addedAt: '2024-01-01', name: 'test', url: 'http://example.com'}
const PRODUCTION: EnvironmentConfig = {addedAt: '2024-01-01', name: 'production', url: 'https://acme.com'}

class TestPush extends PushCommand {
  calls: Array<'failure' | 'success'> = []

  protected override async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    this.calls.push(status)
  }

  async run(): Promise<void> {}

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
}

function make(dryRun: boolean, siteConfig?: EnvironmentConfig): TestPush {
  const cmd = new TestPush([], {} as never)
  cmd.setup(dryRun, siteConfig)
  return cmd
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
})
