import {confirm} from '@inquirer/prompts'
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {LoopressCommand} from '../../src/lib/base.js'
import {EnvironmentConfig} from '../../src/types/config.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../helpers/project-fixtures.js'

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

// Tests run without a TTY; keep that default and flip to true only in the tests that cover
// the interactive confirmation path.
const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../src/lib/interactive.js', () => ({
  isInteractive: () => interactive.value,
}))

class TestCommand extends LoopressCommand {
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  get resolvedDryRun(): boolean {
    return this.dryRun
  }

  get resolvedSiteConfig(): EnvironmentConfig {
    return this.siteConfig
  }

  get resolvedYes(): boolean {
    return this.yes
  }

  async run(): Promise<void> {}

  setYes(value: boolean): void {
    this.yes = value
  }

  async testRemoveOrphanedFiles(dir: string, orphans: string[], reason: string): Promise<void> {
    await this.removeOrphanedFiles(dir, orphans, reason)
  }
}

async function initWith(argv: string[]): Promise<TestCommand> {
  const cmd = new TestCommand(argv, fakeOclifConfig)
  await cmd.init()
  return cmd
}

describe('LoopressCommand.init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    interactive.value = false
    vi.mocked(readLocalConfig).mockResolvedValue({})
  })

  it('falls back to the configured environment when no flags are given', async () => {
    vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production', 'https://acme.com'))

    const cmd = await initWith([])

    expect(cmd.resolvedSiteConfig.url).toBe('https://acme.com')
    expect(cmd.resolvedSiteConfig.token).toBe('user:pass')
  })

  it('sets dryRun from the --dry-run flag', async () => {
    vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production'))

    const cmd = await initWith(['--dry-run'])
    expect(cmd.resolvedDryRun).toBe(true)

    const cmd2 = await initWith([])
    expect(cmd2.resolvedDryRun).toBe(false)
  })

  it('does not fall back to the global environment when loopress.json is broken', async () => {
    vi.mocked(readLocalConfig).mockRejectedValue(new Error('loopress.json is not valid JSON.'))
    const getCurrentEnv = vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production'))

    await expect(initWith([])).rejects.toThrow('loopress.json is not valid JSON.')
    expect(getCurrentEnv).not.toHaveBeenCalled()
  })

  it('sets yes from the --yes flag', async () => {
    vi.spyOn(configManager, 'getCurrentEnv').mockReturnValue(makeEnv('production'))

    const cmd = await initWith(['--yes'])
    expect(cmd.resolvedYes).toBe(true)

    const cmd2 = await initWith([])
    expect(cmd2.resolvedYes).toBe(false)
  })

  it('resolves --env against the globally active project, beating the active environment', async () => {
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(
      makeListedProject('id-acme', 'acme', {
        production: makeEnv('production', 'https://acme.com'),
        staging: makeEnv('staging', 'https://staging.acme.com'),
      }),
    )

    const cmd = await initWith(['--env', 'staging'])

    expect(cmd.resolvedSiteConfig.url).toBe('https://staging.acme.com')
  })

  it('resolves --env against the project pinned by loopress.json', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
    vi.spyOn(configManager, 'getProject').mockReturnValue(
      makeListedProject('id-acme', 'acme', {
        production: makeEnv('production', 'https://acme.com'),
        staging: makeEnv('staging', 'https://staging.acme.com'),
      }),
    )

    const cmd = await initWith(['--env', 'staging'])

    expect(cmd.resolvedSiteConfig.url).toBe('https://staging.acme.com')
  })

  it('errors listing the available environments when --env names an unknown one', async () => {
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(
      makeListedProject('id-acme', 'acme', {
        production: makeEnv('production'),
        staging: makeEnv('staging'),
      }),
    )

    await expect(initWith(['--env', 'nope'])).rejects.toThrow(
      /Environment "nope" not found in project "acme"\. Available: production, staging/,
    )
  })
})

describe('LoopressCommand.removeOrphanedFiles', () => {
  let dir: string

  beforeEach(() => {
    vi.clearAllMocks()
    interactive.value = false
    dir = mkdtempSync(join(tmpdir(), 'lps-remove-orphans-test-'))
    writeFileSync(join(dir, 'orphan.json'), '{}')
    writeFileSync(join(dir, 'kept.json'), '{}')
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  function makeCmd(): {cmd: TestCommand; logs: ReturnType<typeof silenceLogs>} {
    const cmd = new TestCommand([], fakeOclifConfig)
    const logs = silenceLogs(cmd)
    return {cmd, logs}
  }

  it('does nothing when there are no orphans', async () => {
    const {cmd, logs} = makeCmd()

    await cmd.testRemoveOrphanedFiles(dir, [], 'no longer present on WordPress')

    expect(logs.warn).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'orphan.json'))).toBe(true)
  })

  it('removes the files and warns without prompting outside a TTY', async () => {
    const {cmd, logs} = makeCmd()

    await cmd.testRemoveOrphanedFiles(dir, ['orphan.json'], 'no longer present on WordPress')

    expect(confirm).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'orphan.json'))).toBe(false)
    expect(existsSync(join(dir, 'kept.json'))).toBe(true)
    expect(logs.warn).toHaveBeenCalledWith('Removed 1 local file no longer present on WordPress: orphan.json')
  })

  it('shows the list and asks in a TTY, removing when accepted', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(true)
    const {cmd, logs} = makeCmd()

    await cmd.testRemoveOrphanedFiles(dir, ['orphan.json'], 'no longer present on WordPress')

    expect(confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Remove 1 local file no longer present on WordPress: orphan.json?',
    })
    expect(existsSync(join(dir, 'orphan.json'))).toBe(false)
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Removed 1 local file'))
  })

  it('keeps the files when the confirmation is declined', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(false)
    const {cmd, logs} = makeCmd()

    await cmd.testRemoveOrphanedFiles(dir, ['orphan.json'], 'no longer present on WordPress')

    expect(existsSync(join(dir, 'orphan.json'))).toBe(true)
    expect(logs.warn).not.toHaveBeenCalled()
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Kept 1 local file'))
  })

  it('skips the prompt with --yes even in a TTY', async () => {
    interactive.value = true
    const {cmd, logs} = makeCmd()
    cmd.setYes(true)

    await cmd.testRemoveOrphanedFiles(dir, ['orphan.json'], 'no longer present on WordPress')

    expect(confirm).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'orphan.json'))).toBe(false)
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Removed 1 local file'))
  })
})
