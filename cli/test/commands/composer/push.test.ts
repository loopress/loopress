import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import ComposerPush from '../../../src/commands/composer/push.js'
import {EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

class TestComposerPush extends ComposerPush {
  deployments: string[] = []

  protected override async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    this.deployments.push(status)
  }

  setup(options: {dryRun: boolean; siteConfig: EnvironmentConfig}) {
    this.dryRun = options.dryRun
    this.siteConfig = options.siteConfig
    this.localConfig = {}
  }
}

function make(dryRun: boolean) {
  const cmd = new TestComposerPush([], fakeOclifConfig)
  cmd.setup({dryRun, siteConfig: makeEnv('production', 'https://acme.com')})
  const logs = silenceLogs(cmd)
  const post = vi.fn().mockResolvedValue(null)
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {post}
  return {cmd, logs, post}
}

describe('composer push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-composer-push-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('fails when there is no composer.json', async () => {
    const {cmd} = make(false)

    await expect(cmd.run()).rejects.toThrow(/No composer\.json found/)
  })

  it('does not call the API on dry-run', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '^5.3'}}))
    const {cmd, logs, post} = make(true)

    await cmd.run()

    expect(post).not.toHaveBeenCalled()
    expect(cmd.deployments).toEqual([])
    expect(logs.log).toHaveBeenCalledWith('Pushing composer.json (1 package) to https://acme.com')
  })

  it('pushes composer.json and composer.lock then records the deployment', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {'wpackagist-plugin/akismet': '^5.3'}}))
    writeFileSync(join(dir, 'composer.lock'), '{"packages": []}')
    const {cmd, post} = make(false)

    await cmd.run()

    expect(post).toHaveBeenCalledWith('loopress/v1/composer/sync', {
      composerJson: JSON.stringify({require: {'wpackagist-plugin/akismet': '^5.3'}}),
      composerLock: '{"packages": []}',
    })
    expect(cmd.deployments).toEqual(['success'])
  })

  it('warns when composer.lock is missing and sends null', async () => {
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({require: {}}))
    const {cmd, logs, post} = make(false)

    await cmd.run()

    expect(logs.warn).toHaveBeenCalledWith('No composer.lock found. The server will resolve versions freely.')
    expect(post).toHaveBeenCalledWith('loopress/v1/composer/sync', expect.objectContaining({composerLock: null}))
  })
})
