import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Rollback from '../../../src/commands/page/rollback.js'
import {type LoopressCommand} from '../../../src/lib/base.js'
import {type CommandClass} from '../../../src/lib/php-files-command.js'
import {type RollbackResult} from '../../../src/lib/rollback-command.js'
import {writeSnapshot} from '../../../src/lib/snapshot-store.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => false}))

const ConcreteRollback = Rollback as unknown as CommandClass<Omit<LoopressCommand, 'run'> & {run(): Promise<RollbackResult>}>

const page = (slug: string, overrides: Record<string, unknown> = {}) => ({fullWidth: false, hideTitle: false, html: `<p>${slug}</p>`, link: '', slug, status: 'publish', template: '', title: slug, ...overrides})

describe('page rollback', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'lps-page-rollback-test-'))
    resetFakeOclifConfig()
  })

  afterEach(() => {
    rmSync(rootDir, {force: true, recursive: true})
  })

  it('writes back each page the push changed, header included, and warns about the one it created', async () => {
    await writeSnapshot({
      afterState: new Map([
        ['about', {html: '<p>new</p>', status: 'publish', title: 'about'}],
        ['contact', {html: '<p>contact</p>', status: 'publish', title: 'contact'}],
      ]),
      beforeState: new Map([['about', {fullWidth: true, html: '<p>old</p>', status: 'draft', title: 'about'}]]),
      environment: 'staging',
      resource: 'page',
      rootDir,
    })
    const get = vi.fn().mockResolvedValue([page('about', {html: '<p>new</p>'}), page('contact')])
    const put = vi.fn().mockResolvedValue({})
    const warn = vi.fn()
    const cmd = new ConcreteRollback([], fakeOclifConfig)
    silenceLogs(cmd)
    Object.assign(cmd, {dryRun: false, localConfig: {rootDir}, siteConfig: makeEnv('staging'), warn, wpClient: {get, put}, yes: false})

    const result = await cmd.run()

    expect(result.status).toBe('success')
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith('loopress/v1/pages', {
      adopt: true,
      fullWidth: true,
      hideTitle: false,
      html: '<p>old</p>',
      slug: 'about',
      status: 'draft',
      template: '',
      title: 'about',
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('will NOT be removed (contact)'))
    expect(fakeOclifConfig.runCommand).not.toHaveBeenCalled()
  })
})
