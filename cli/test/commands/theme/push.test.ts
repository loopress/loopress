import {beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/theme/pull.js'
import Push from '../../../src/commands/theme/push.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

class TestPush extends Push {
  setup(dryRun = false) {
    this.dryRun = dryRun
    this.siteConfig = makeEnv('staging', 'https://staging.acme.com')
    this.localConfig = {}
  }
}

class TestPull extends Pull {
  setup() {
    this.siteConfig = makeEnv('staging', 'https://staging.acme.com')
    this.localConfig = {}
  }
}

function makePush(argv: string[] = [], dryRun = false) {
  const cmd = new TestPush(argv, fakeOclifConfig)
  cmd.setup(dryRun)
  return {cmd, logs: silenceLogs(cmd)}
}

describe('theme push', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
  })

  it('pushes versions, then templates and parts, then Global Styles, --force only to versions', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = makePush(['--force'], true)

    await cmd.run()

    expect(vi.mocked(fakeOclifConfig.runCommand).mock.calls).toEqual([
      ['theme:version:push', ['--env', 'staging', '--yes', '--dry-run', '--force']],
      ['theme:template:push', ['--env', 'staging', '--yes', '--dry-run']],
      ['theme:style:push', ['--env', 'staging', '--yes', '--dry-run']],
    ])
  })

  it('continues past a failed step and reports it', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('boom')).mockResolvedValue({})
    const {cmd, logs} = makePush()

    await expect(cmd.run()).rejects.toThrow('1 theme resource failed to push. theme versions: boom')

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(3)
    expect(logs.log).toHaveBeenCalledWith('✓ Global Styles pushed')
  })
})

describe('theme pull', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
  })

  it('pulls versions then Global Styles', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const cmd = new TestPull([], fakeOclifConfig)
    cmd.setup()
    silenceLogs(cmd)

    const result = await cmd.run()

    expect(vi.mocked(fakeOclifConfig.runCommand).mock.calls).toEqual([
      ['theme:version:pull', ['--env', 'staging']],
      ['theme:style:pull', ['--env', 'staging']],
    ])
    expect(result.results.every((entry) => entry.status === 'pulled')).toBe(true)
  })
})
