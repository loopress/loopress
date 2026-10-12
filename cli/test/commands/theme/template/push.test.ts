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

const child = {active: true, customized: [], exists: true, parent: 'twentytwentyfive', parts: [], stylesheet: 'twentytwentyfive-loopress', templates: [], unknownBlocks: []}

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
    mkdirSync(join(dir, 'theme', 'templates'), {recursive: true})
    mkdirSync(join(dir, 'theme', 'parts'), {recursive: true})
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('PUTs every template and part to the child theme endpoint in one request', async () => {
    writeFileSync(join(dir, 'theme', 'templates', 'single.html'), '<!-- wp:post-content /-->')
    writeFileSync(join(dir, 'theme', 'parts', 'header.html'), '<p>h</p>')
    const put = vi.fn().mockResolvedValue(child)

    const result = await makeCommand(put).run()

    expect(put).toHaveBeenCalledWith('loopress/v1/child-theme', {
      assets: [],
      blocks: [],
      parts: [{area: 'header', html: '<p>h</p>', slug: 'header', title: 'Header'}],
      style: '',
      templates: [{html: '<!-- wp:post-content /-->', slug: 'single'}],
    })
    expect(result).toEqual({
      active: true,
      blockStyles: [],
      customized: [],
      parts: ['header'],
      status: 'success',
      stylesheet: 'twentytwentyfive-loopress',
      templates: ['single'],
      unknownBlocks: [],
    })
  })

  it('sends the bundled CSS with the templates, and warns about a block the site does not know', async () => {
    mkdirSync(join(dir, 'theme', 'css'), {recursive: true})
    mkdirSync(join(dir, 'theme', 'blocks', 'core'), {recursive: true})
    writeFileSync(join(dir, 'theme', 'css', 'style.css'), '.c-card { padding: 1rem; }')
    writeFileSync(join(dir, 'theme', 'blocks', 'core', 'buton.css'), '.wp-block-button { color: red; }')
    const put = vi.fn().mockResolvedValue({...child, unknownBlocks: ['core/buton']})
    const cmd = makeCommand(put)

    const result = await cmd.run()

    expect(put).toHaveBeenCalledWith(
      'loopress/v1/child-theme',
      expect.objectContaining({blocks: [{css: expect.stringContaining('color:red'), name: 'core/buton'}], style: expect.stringContaining('.c-card{padding:1rem}')}),
    )
    expect(cmd.warn).toHaveBeenCalledWith(expect.stringContaining('core/buton'))
    expect(result).toMatchObject({blockStyles: ['core/buton'], unknownBlocks: ['core/buton']})
  })

  it('warns when the child is not active and when the Site Editor still overrides a file', async () => {
    writeFileSync(join(dir, 'theme', 'templates', 'single.html'), '<p/>')
    const cmd = makeCommand(vi.fn().mockResolvedValue({...child, active: false, customized: ['templates/single']}))

    await cmd.run()

    expect(cmd.warn).toHaveBeenCalledWith(expect.stringContaining('is not the active theme'))
    expect(cmd.warn).toHaveBeenCalledWith(expect.stringContaining('templates/single'))
  })

  it('refuses the whole push before any network call when a file is invalid', async () => {
    writeFileSync(join(dir, 'theme', 'templates', 'single.html'), '<!-- wp:template-part {"slug":"header","theme":"twentytwentyfive"} /-->')
    const put = vi.fn()

    await expect(makeCommand(put).run()).rejects.toThrow('"theme" attribute')
    expect(put).not.toHaveBeenCalled()
  })

  it('writes nothing on a dry run', async () => {
    writeFileSync(join(dir, 'theme', 'templates', 'single.html'), '<p/>')
    const put = vi.fn()
    const cmd = makeCommand(put)
    cmd.dryRun = true
    ;(cmd as unknown as {wpClient: {get: unknown}}).wpClient.get = vi.fn().mockResolvedValue({customized: [], parts: [], templates: []})

    expect(await cmd.run()).toEqual({blockStyles: [], parts: [], status: 'dry-run', templates: ['single']})
    expect(put).not.toHaveBeenCalled()
  })
})
