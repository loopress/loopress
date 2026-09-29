import {confirm} from '@inquirer/prompts'
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Promote from '../../src/commands/promote.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {readLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

vi.mock('../../src/utils/loopress-config.js', () => ({
  readLocalConfig: vi.fn(),
}))

const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../src/lib/interactive.js', () => ({
  isInteractive: () => interactive.value,
}))

const PROJECT = makeListedProject(
  'id-acme',
  'acme',
  {
    production: makeEnv('production', 'https://acme.com'),
    staging: makeEnv('staging', 'https://staging.acme.com'),
  },
  true,
)

function make(argv: string[]) {
  const cmd = new Promote(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('promote', () => {
  beforeEach(() => {
    resetFakeOclifConfig()
    vi.clearAllMocks()
    interactive.value = false
    vi.mocked(readLocalConfig).mockResolvedValue({})
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(PROJECT)
  })

  it('pulls from <from> then pushes to <to>, both with the env and --yes', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make(['staging', 'production', '--yes'])

    const result = await cmd.run()

    expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(1, 'pull', ['--env', 'staging', '--yes'])
    expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(2, 'push', ['--env', 'production', '--yes'])
    expect(result).toEqual({from: 'staging', status: 'promoted', to: 'production'})
  })

  it('on --dry-run, really pulls into a scratch copy of the project and dry-runs the push from it', async () => {
    const project = mkdtempSync(join(tmpdir(), 'lps-promote-test-'))
    writeFileSync(join(project, 'loopress.json'), '{}')
    // Stryker's worker-thread pool disallows process.chdir(), so the cwd is faked instead.
    let cwd = project
    vi.spyOn(process, 'cwd').mockImplementation(() => cwd)
    vi.spyOn(process, 'chdir').mockImplementation((dir) => {
      cwd = resolve(dir)
    })
    const cwds: string[] = []
    let hadLocalConfig = false
    const noRotate: Array<string | undefined> = []
    vi.mocked(fakeOclifConfig.runCommand).mockImplementation(async () => {
      cwds.push(process.cwd())
      noRotate.push(process.env.LOOPRESS_NO_AUTO_ROTATE)
      hadLocalConfig = existsSync(join(cwd, 'loopress.json'))
      writeFileSync(join(cwd, 'pulled.txt'), 'from staging')
      return {}
    })
    const {cmd} = make(['staging', 'production', '--dry-run'])

    try {
      const result = await cmd.run()

      expect(confirm).not.toHaveBeenCalled()
      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(1, 'pull', ['--env', 'staging', '--yes'])
      expect(fakeOclifConfig.runCommand).toHaveBeenNthCalledWith(2, 'push', ['--env', 'production', '--yes', '--dry-run'])
      expect(result).toEqual({from: 'staging', status: 'dry-run', to: 'production'})
      expect(cwds[0]).not.toBe(project)
      expect(cwds[1]).toBe(cwds[0])
      expect(hadLocalConfig).toBe(true)
      expect(existsSync(cwds[0])).toBe(false)
      expect(cwd).toBe(project)
      expect(existsSync(join(project, 'pulled.txt'))).toBe(false)
      expect(noRotate).toEqual(['1', '1'])
      expect(process.env.LOOPRESS_NO_AUTO_ROTATE).toBeUndefined()
    } finally {
      rmSync(project, {force: true, recursive: true})
    }
  })

  it.each([['an absolute rootDir', {rootDir: '/elsewhere'}], ['a resource dir escaping the project', {snippetsDir: '../shared/snippets'}]])(
    'refuses --dry-run with %s, the scratch pull would write outside the copy',
    async (_label, localConfig) => {
      vi.mocked(readLocalConfig).mockResolvedValue(localConfig)
      const {cmd} = make(['staging', 'production', '--dry-run'])

      await expect(cmd.run()).rejects.toThrow(/--dry-run can't preview safely: .* is outside the project\. Run `lps diff --env <from> --against <to>` instead\./)
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    },
  )

  it('errors, listing the available environments, when <from> is unknown', async () => {
    const {cmd} = make(['nope', 'production', '--yes'])

    await expect(cmd.run()).rejects.toThrow(/Environment "nope" not found in project "acme"\. Available: production, staging/)
    expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
  })

  it('errors when <from> and <to> are the same environment', async () => {
    const {cmd} = make(['staging', 'staging', '--yes'])

    await expect(cmd.run()).rejects.toThrow('<from> and <to> must be different environments.')
  })

  it('errors when no project is configured', async () => {
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(null)
    const {cmd} = make(['staging', 'production', '--yes'])

    await expect(cmd.run()).rejects.toThrow('No project configured. Run `lps project config` first.')
  })

  it('resolves the project pinned by loopress.json', async () => {
    vi.mocked(readLocalConfig).mockResolvedValue({projectId: 'id-acme'})
    vi.spyOn(configManager, 'getProject').mockReturnValue(PROJECT)
    vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
    const {cmd} = make(['staging', 'production', '--yes'])

    await cmd.run()

    expect(configManager.getProject).toHaveBeenCalledWith('id-acme')
    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(2)
  })

  it('does not push when the pull fails', async () => {
    vi.mocked(fakeOclifConfig.runCommand).mockRejectedValueOnce(new Error('2 resources failed to pull.'))
    const {cmd} = make(['staging', 'production', '--yes'])

    await expect(cmd.run()).rejects.toThrow(/Pull from staging failed, production left untouched: 2 resources failed to pull\./)
    expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(1)
  })

  describe('confirmation', () => {
    it('refuses outside a TTY without --yes', async () => {
      const {cmd} = make(['staging', 'production'])

      await expect(cmd.run()).rejects.toThrow(/overwrites local tracked files.*Pass --yes to confirm/s)
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    })

    it('prompts in a TTY and aborts when declined', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(false)
      const {cmd} = make(['staging', 'production'])

      await expect(cmd.run()).rejects.toThrow('Aborted.')
      expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
    })

    it('prompts in a TTY and proceeds when accepted', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(true)
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd} = make(['production', 'staging'])

      await cmd.run()

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({default: true}))
      expect(fakeOclifConfig.runCommand).toHaveBeenCalledTimes(2)
    })

    it('defaults the prompt to no and names production when <to> is production', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(true)
      vi.mocked(fakeOclifConfig.runCommand).mockResolvedValue({})
      const {cmd} = make(['staging', 'production'])

      await cmd.run()

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({default: false, message: expect.stringContaining('production environment')}),
      )
    })
  })
})
