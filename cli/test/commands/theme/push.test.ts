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
    // A project with templates or parts, unless a test says otherwise.
    this.localConfig = {activateChildTheme: true, ...(themes && {themes})}
  }
}

class TestPull extends Pull {
  setup(dryRun = false) {
    this.dryRun = dryRun
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

  // What the MCP server shows as the preview: each step's per-item changes, not just its label.
  it("returns each step's own result", async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockImplementation(async (id: string) => ({step: id}))
    const {cmd} = makePush({dryRun: true})

    const {results} = await cmd.run()

    expect(results.find((entry) => entry.label === 'templates and parts')).toEqual({
      label: 'templates and parts',
      result: {step: 'theme:template:push'},
      status: 'pushed',
    })
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

  it('skips templates and parts when the project has none and does not ask for the child theme', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    vi.spyOn(process, 'cwd').mockReturnValue(mkdtempSync(join(tmpdir(), 'lps-theme-push-')))
    const {cmd} = makePush()
    ;(cmd as unknown as {localConfig: Record<string, unknown>}).localConfig = {themes: {astra: '4.0.0'}}

    await cmd.run()

    expect(vi.mocked(fakeOclifConfig.runCommand).mock.calls.map(([id]) => id)).toEqual(['theme:version:push', 'theme:style:push'])
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

  it('forwards --dry-run and logs each step', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const cmd = new TestPull([], fakeOclifConfig)
    cmd.setup(true)
    const logs = silenceLogs(cmd)

    await cmd.run()

    expect(vi.mocked(fakeOclifConfig.runCommand).mock.calls[0]).toEqual(['theme:version:pull', ['--env', 'staging', '--dry-run']])
    expect(logs.log.mock.calls.map(([line]) => line)).toEqual([
      '\n→ Pulling theme versions...',
      '✓ theme versions pulled',
      '\n→ Pulling Global Styles...',
      '✓ Global Styles pulled',
    ])
  })

  it('continues past a failed step, then fails naming every failure', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('no themes')).mockRejectedValueOnce(new Error('classic theme'))
    const cmd = new TestPull([], fakeOclifConfig)
    cmd.setup()
    const logs = silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow('2 theme resources failed to pull. theme versions: no themes; Global Styles: classic theme')
    expect(logs.log).toHaveBeenCalledWith('✗ theme versions failed: no themes')
  })

  it('fails on a single failed step after running the others', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('classic theme'))
    const cmd = new TestPull([], fakeOclifConfig)
    cmd.setup()
    silenceLogs(cmd)

    await expect(cmd.run()).rejects.toThrow(/^1 theme resource failed to pull\. Global Styles: classic theme$/)
  })
})
