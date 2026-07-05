import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import ComposerPull from '../../../src/commands/composer/pull.js'
import {EnvironmentConfig} from '../../../src/types/config.js'
import {LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

class TestComposerPull extends ComposerPull {
  setup(options: {dryRun: boolean; localConfig: LoopressLocalConfig; siteConfig: EnvironmentConfig}) {
    this.dryRun = options.dryRun
    this.localConfig = options.localConfig
    this.siteConfig = options.siteConfig
  }
}

function make(dryRun: boolean, localConfig: LoopressLocalConfig = {}) {
  const cmd = new TestComposerPull([], fakeOclifConfig)
  cmd.setup({dryRun, localConfig, siteConfig: makeEnv('production', 'https://acme.com')})
  silenceLogs(cmd)
  const get = vi.fn().mockResolvedValue({composerLock: '{"packages": []}'})
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
  return {cmd, get}
}

describe('composer pull', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-composer-pull-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, {force: true, recursive: true})
  })

  it('writes composer.lock from the API response', async () => {
    const {cmd, get} = make(false)

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/composer/lock')
    expect(readFileSync(join(dir, 'composer.lock'), 'utf8')).toBe('{"packages": []}')
  })

  it('respects rootDir from loopress.json', async () => {
    const {cmd} = make(false, {rootDir: '.'})

    await cmd.run()

    expect(existsSync(join(dir, 'composer.lock'))).toBe(true)
  })

  it('writes nothing on dry-run', async () => {
    const {cmd, get} = make(true)

    await cmd.run()

    expect(get).toHaveBeenCalledOnce()
    expect(existsSync(join(dir, 'composer.lock'))).toBe(false)
  })
})
