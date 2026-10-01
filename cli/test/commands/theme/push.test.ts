import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/theme/pull.js'
import Push from '../../../src/commands/theme/push.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

class TestPush extends Push {
  setup(dryRun: boolean, yes: boolean, themes?: Record<string, string>) {
    this.dryRun = dryRun
    this.yes = yes
    this.siteConfig = makeEnv('staging', 'https://staging.acme.com')
    this.localConfig = {themes}
  }
}

class TestPull extends Pull {
  setup() {
    this.siteConfig = makeEnv('staging', 'https://staging.acme.com')
    this.localConfig = {}
  }
}

function makePush(options: {argv?: string[]; dryRun?: boolean; themes?: Record<string, string>; yes?: boolean} = {}) {
  const cmd = new TestPush(options.argv ?? [], fakeOclifConfig)
  cmd.setup(options.dryRun ?? false, options.yes ?? false, options.themes ?? {astra: '4.0.0'})
  return {cmd, logs: silenceLogs(cmd)}
}

describe('theme push', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
  })

  it('pushes versions, then templates and parts, then Global Styles, --force only to versions', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = makePush({argv: ['--force'], dryRun: true})

    await cmd.run()

    expect(vi.mocked(fakeOclifConfig.runCommand).mock.calls).toEqual([
      ['theme:version:push', ['--env', 'staging', '--production-confirmed', '--dry-run', '--force']],
      ['theme:template:push', ['--env', 'staging', '--production-confirmed', '--dry-run']],
      ['theme:style:push', ['--env', 'staging', '--production-confirmed', '--dry-run']],
    ])
  })

  it('forwards --yes only when the user passed it, so theme uninstalls still ask by default', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = makePush({yes: true})

    await cmd.run()

    expect(fakeOclifConfig.runCommand).toHaveBeenCalledWith('theme:version:push', ['--env', 'staging', '--production-confirmed', '--yes'])
  })

  it('skips the versions step when loopress.json has no themes and there is no composer.json', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    vi.spyOn(process, 'cwd').mockReturnValue(mkdtempSync(join(tmpdir(), 'lps-theme-push-')))
    const {cmd} = makePush({themes: {}})

    await cmd.run()

    expect(vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)).toEqual(['theme:template:push', 'theme:style:push'])
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
