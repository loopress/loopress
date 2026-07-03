import {describe, expect, it} from 'vitest'

import {PushCommand} from '../../src/lib/push-command.js'
import {EnvironmentConfig} from '../../src/types/config.js'

const SITE: EnvironmentConfig = {addedAt: '2024-01-01', name: 'test', url: 'http://example.com'}

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

  async testCatch(err: Error) {
    try {
      await this.catch(err)
    } catch {}
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
