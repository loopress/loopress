import {confirm} from '@inquirer/prompts'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import ComposerInit from '../../../src/commands/composer/init.js'
import {EnvironmentConfig} from '../../../src/types/config.js'
import {LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

class TestComposerInit extends ComposerInit {
  setup(options: {dryRun: boolean; localConfig?: LoopressLocalConfig; siteConfig: EnvironmentConfig}) {
    this.dryRun = options.dryRun
    this.localConfig = options.localConfig ?? {}
    this.siteConfig = options.siteConfig
  }
}

function make(dryRun: boolean, localConfig: LoopressLocalConfig = {}) {
  const cmd = new TestComposerInit([], fakeOclifConfig)
  cmd.setup({dryRun, localConfig, siteConfig: makeEnv('production', 'https://acme.com')})
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('composer init', () => {
  let dir: string

  beforeEach(() => {
    vi.clearAllMocks()
    dir = mkdtempSync(join(tmpdir(), 'lps-composer-init-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('writes a composer.json wired to WPackagist', async () => {
    const {cmd, logs} = make(false)

    await cmd.run()

    const written = JSON.parse(readFileSync(join(dir, 'composer.json'), 'utf8'))
    expect(written).toEqual({
      extra: {
        'installer-paths': {
          '../plugins/{$name}/': ['type:wordpress-plugin'],
          '../themes/{$name}/': ['type:wordpress-theme'],
        },
      },
      name: 'loopress/site-dependencies',
      repositories: [{type: 'composer', url: 'https://wpackagist.org'}],
      require: {
        'composer/installers': '^2.0',
      },
    })
    expect(logs.log).toHaveBeenCalledWith(`Wrote composer.json to ${join(dir, 'composer.json')}`)
  })

  it('does not write anything on dry-run', async () => {
    const {cmd, logs} = make(true)

    await cmd.run()

    expect(existsSync(join(dir, 'composer.json'))).toBe(false)
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run] Would write composer.json'))
  })

  it('asks before overwriting an existing composer.json and aborts if declined', async () => {
    const {writeFileSync} = await import('node:fs')
    writeFileSync(join(dir, 'composer.json'), '{}')
    vi.mocked(confirm).mockResolvedValueOnce(false)
    const {cmd, logs} = make(false)

    await cmd.run()

    expect(confirm).toHaveBeenCalledWith({default: false, message: 'composer.json already exists. Overwrite?'})
    expect(logs.log).toHaveBeenCalledWith('Aborted.')
  })

  it('overwrites composer.json when confirmed', async () => {
    const {writeFileSync} = await import('node:fs')
    writeFileSync(join(dir, 'composer.json'), '{}')
    vi.mocked(confirm).mockResolvedValueOnce(true)
    const {cmd} = make(false)

    await cmd.run()

    const written = JSON.parse(readFileSync(join(dir, 'composer.json'), 'utf8'))
    expect(written.require).toEqual({'composer/installers': '^2.0'})
  })

  it('writes composer.json under rootDir', async () => {
    mkdirSync(join(dir, 'wp'))
    const {cmd} = make(false, {rootDir: 'wp'})

    await cmd.run()

    expect(existsSync(join(dir, 'wp', 'composer.json'))).toBe(true)
  })
})
