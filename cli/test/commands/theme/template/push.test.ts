import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../../src/commands/theme/template/push.js'
import {fakeOclifConfig, silenceLogs} from '../../../helpers/oclif.js'
import {makeEnv} from '../../../helpers/project-fixtures.js'

type PushInternals = {
  dryRun: boolean
  localConfig: {partDir?: string; rootDir?: string; templateDir?: string}
  parse: () => Promise<unknown>
  recordSuccess: () => Promise<void>
  run(): Promise<unknown>
  siteConfig: unknown
  warn: ReturnType<typeof vi.fn>
  wpClient: {put: ReturnType<typeof vi.fn>}
}

const child = {active: true, customized: [], exists: true, parent: 'twentytwentyfive', parts: [], stylesheet: 'twentytwentyfive-loopress', templates: []}

describe('template push', () => {
  let dir: string

  function makeCommand(put = vi.fn().mockResolvedValue(child)): PushInternals {
    const cmd = new Push([], fakeOclifConfig)
    silenceLogs(cmd)
    const internals = cmd as unknown as PushInternals
    internals.wpClient = {put}
    internals.siteConfig = makeEnv('local')
    internals.recordSuccess = async () => {}
    internals.localConfig = {rootDir: dir}
    internals.parse = async () => ({})
    internals.warn = vi.fn()
    return internals
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-template-push-test-'))
    mkdirSync(join(dir, 'templates'))
    mkdirSync(join(dir, 'parts'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('PUTs every template and part to the child theme endpoint in one request', async () => {
    writeFileSync(join(dir, 'templates', 'single.html'), '<!-- wp:post-content /-->')
    writeFileSync(join(dir, 'parts', 'header.html'), '<p>h</p>')
    const put = vi.fn().mockResolvedValue(child)

    const result = await makeCommand(put).run()

    expect(put).toHaveBeenCalledWith('loopress/v1/child-theme', {
      parts: [{area: 'header', html: '<p>h</p>', slug: 'header', title: 'Header'}],
      templates: [{html: '<!-- wp:post-content /-->', slug: 'single'}],
    })
    expect(result).toEqual({active: true, customized: [], parts: ['header'], status: 'success', stylesheet: 'twentytwentyfive-loopress', templates: ['single']})
  })

  it('warns when the child is not active and when the Site Editor still overrides a file', async () => {
    writeFileSync(join(dir, 'templates', 'single.html'), '<p/>')
    const cmd = makeCommand(vi.fn().mockResolvedValue({...child, active: false, customized: ['templates/single']}))

    await cmd.run()

    expect(cmd.warn).toHaveBeenCalledWith(expect.stringContaining('is not the active theme'))
    expect(cmd.warn).toHaveBeenCalledWith(expect.stringContaining('templates/single'))
  })

  it('refuses the whole push before any network call when a file is invalid', async () => {
    writeFileSync(join(dir, 'templates', 'single.html'), '<!-- wp:template-part {"slug":"header","theme":"twentytwentyfive"} /-->')
    const put = vi.fn()

    await expect(makeCommand(put).run()).rejects.toThrow('"theme" attribute')
    expect(put).not.toHaveBeenCalled()
  })

  it('writes nothing on a dry run', async () => {
    writeFileSync(join(dir, 'templates', 'single.html'), '<p/>')
    const put = vi.fn()
    const cmd = makeCommand(put)
    cmd.dryRun = true
    ;(cmd as unknown as {wpClient: {get: unknown}}).wpClient.get = vi.fn().mockResolvedValue({customized: [], parts: [], templates: []})

    expect(await cmd.run()).toEqual({parts: [], status: 'dry-run', templates: ['single']})
    expect(put).not.toHaveBeenCalled()
  })
})
