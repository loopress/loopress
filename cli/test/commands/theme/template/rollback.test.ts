import {createHash} from 'node:crypto'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../../src/commands/theme/template/push.js'
import Rollback from '../../../../src/commands/theme/template/rollback.js'
import {type LoopressCommand} from '../../../../src/lib/base.js'
import {type CommandClass} from '../../../../src/lib/php-files-command.js'
import {type RollbackResult} from '../../../../src/lib/rollback-command.js'
import {readSnapshot} from '../../../../src/lib/snapshot-store.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../../helpers/oclif.js'
import {makeEnv} from '../../../helpers/project-fixtures.js'

vi.mock('../../../../src/lib/interactive.js', () => ({isInteractive: () => false}))

type ChildFile = {html: string; slug: string}
type Site = {css: Record<string, string>; parts: ChildFile[]; templates: ChildFile[]}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

// A fake child theme endpoint: the PUT replaces every file, the way ChildThemeController does.
function fakeSite(site: Site) {
  const answer = () => ({active: true, customized: [], exists: true, parent: 'tt5', stylesheet: 'tt5-loopress', unknownBlocks: [], ...structuredClone(site)})
  const get = vi.fn(async () => answer())
  const put = vi.fn(async (_endpoint: string, body: {blocks: Array<{css: string; name: string}>; parts: ChildFile[]; style: string; templates: ChildFile[]}) => {
    site.templates = body.templates.map(({html, slug}) => ({html, slug}))
    site.parts = body.parts.map(({html, slug}) => ({html, slug}))
    site.css = Object.fromEntries([
      ...(body.style === '' ? [] : [['style.css', sha256(body.style)]]),
      ...body.blocks.map((block) => [`blocks/${block.name}.css`, sha256(block.css)]),
    ])
    return answer()
  })
  return {get, put}
}

const ConcreteRollback = Rollback as unknown as CommandClass<Omit<LoopressCommand, 'run'> & {run(): Promise<RollbackResult>}>

describe('theme template rollback', () => {
  let dir: string

  function command<T extends {run(): Promise<unknown>}>(Command: new (argv: string[], config: typeof fakeOclifConfig) => T, argv: string[], wp: ReturnType<typeof fakeSite>, warn = vi.fn()): T {
    const cmd = new Command(argv, fakeOclifConfig)
    silenceLogs(cmd as unknown as LoopressCommand)
    Object.assign(cmd, {dryRun: false, localConfig: {rootDir: dir}, async recordSuccess() {}, siteConfig: makeEnv('staging'), warn, wpClient: wp, yes: false})
    return cmd
  }

  async function push(wp: ReturnType<typeof fakeSite>): Promise<void> {
    const cmd = command(Push as unknown as new (argv: string[], config: typeof fakeOclifConfig) => {run(): Promise<unknown>}, [], wp)
    Object.assign(cmd, {parse: async () => ({})})
    await cmd.run()
  }

  function write(path: string, content: string): void {
    mkdirSync(join(dir, path, '..'), {recursive: true})
    writeFileSync(join(dir, path), content)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-template-rollback-test-'))
    resetFakeOclifConfig()
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('puts back the child theme the last push replaced: a removed template, an added part and the CSS', async () => {
    const site: Site = {css: {}, parts: [], templates: []}
    const wp = fakeSite(site)
    write('theme/templates/single.html', '<p>single v1</p>')
    write('theme/templates/page.html', '<p>page</p>')
    write('theme/css/style.css', 'body{color:red}')
    await push(wp)
    const before = structuredClone(site)

    // The second push removes page.html, changes single.html, adds a part and changes the CSS.
    rmSync(join(dir, 'theme/templates/page.html'))
    write('theme/templates/single.html', '<p>single v2</p>')
    write('theme/parts/header.html', '<p>header</p>')
    write('theme/css/style.css', 'body{color:blue}')
    await push(wp)
    expect(site).not.toEqual(before)

    const warn = vi.fn()
    const result = await command(ConcreteRollback, [], wp, warn).run()

    expect(result.status).toBe('success')
    expect(site).toEqual(before)
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps the CSS that push sent, and says so, when the snapshot has no copy of the one before', async () => {
    // CSS already on the site, pushed from somewhere else: its content is unknown here.
    const site: Site = {css: {'style.css': sha256('body{color:green}')}, parts: [], templates: [{html: '<p>old</p>', slug: 'single'}]}
    const wp = fakeSite(site)
    write('theme/templates/single.html', '<p>new</p>')
    write('theme/css/style.css', 'body{color:blue}')
    await push(wp)
    const pushedCss = {...site.css}
    expect((await readSnapshot(dir, 'theme-template', 'staging')).payload).not.toHaveProperty('beforeCss')

    const warn = vi.fn()
    await command(ConcreteRollback, [], wp, warn).run()

    expect(site.templates).toEqual([{html: '<p>old</p>', slug: 'single'}])
    expect(site.css).toEqual(pushedCss)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^The theme CSS is not restored/))
  })

  it("refuses to write one theme's snapshot into the child of another parent activated since", async () => {
    const site: Site = {css: {}, parts: [], templates: []}
    const wp = fakeSite(site)
    write('theme/templates/single.html', '<p>single</p>')
    await push(wp)
    const other = {active: true, customized: [], exists: true, parent: 'tt4', parts: [], stylesheet: 'tt4-loopress', templates: []}
    wp.get.mockResolvedValue(other as never)
    wp.put.mockClear()

    const cmd = command(ConcreteRollback, ['--yes'], wp)
    Object.assign(cmd, {yes: true})

    await expect(cmd.run()).rejects.toThrow(/snapshot is of tt5-loopress, the child theme of the active theme is now tt4-loopress/)
    expect(wp.put).not.toHaveBeenCalled()
  })

  it('changes nothing on a dry run', async () => {
    const site: Site = {css: {}, parts: [], templates: []}
    const wp = fakeSite(site)
    write('theme/templates/single.html', '<p>single</p>')
    await push(wp)
    wp.put.mockClear()

    const cmd = command(ConcreteRollback, [], wp)
    Object.assign(cmd, {dryRun: true})
    const result = await cmd.run()

    expect(result).toMatchObject({restored: {added: [], changed: [], removed: ['templates/single']}, status: 'dry-run'})
    expect(wp.put).not.toHaveBeenCalled()
  })
})
