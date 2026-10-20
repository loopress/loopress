import {confirm} from '@inquirer/prompts'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/page/push.js'
import {isInteractive} from '../../../src/lib/interactive.js'
import {type Page} from '../../../src/utils/page-format.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({confirm: vi.fn()}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: vi.fn(() => false)}))

type PushInternals = {
  dryRun: boolean
  failedCount: number
  localConfig: {pageDir?: string; rootDir?: string}
  overwrite: boolean
  parse: () => Promise<{args: {slug?: string}}>
  pushPage(page: Page, task?: {output: string}): Promise<boolean>
  recordSuccess: () => Promise<void>
  run(): Promise<unknown>
  siteConfig: unknown
  wpClient: {put: ReturnType<typeof vi.fn>}
}

const notManaged = (): Error =>
  new Error('A page with slug "about" already exists and is not managed by Loopress.', {
    cause: {response: {body: JSON.stringify({code: 'loopress_page_not_managed', error: 'x'}), statusCode: 409}},
  })

const page: Page = {fullWidth: false, hideTitle: false, html: '<p>x</p>', slug: 'about', status: 'draft', template: '', title: 'About'}

function makeCommand(put = vi.fn()): PushInternals {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  const internals = cmd as unknown as PushInternals
  internals.wpClient = {put}
  internals.siteConfig = makeEnv('local')
  internals.recordSuccess = async () => {}
  return internals
}

describe('page push', () => {
  describe('pushPage', () => {
    it('PUTs slug, title, status and html to loopress/v1/pages', async () => {
      const put = vi.fn().mockResolvedValueOnce({...page, link: 'https://example.test/about/'})
      const cmd = makeCommand(put)
      const task = {output: ''}

      await cmd.pushPage(page, task)

      expect(put).toHaveBeenCalledWith('loopress/v1/pages', page)
      expect(task.output).toBe('Pushed: about (draft) https://example.test/about/')
    })

    it('says when the push made home the site front page', async () => {
      const put = vi.fn().mockResolvedValueOnce({...page, frontPage: 'set', link: 'https://example.test/', status: 'publish'})
      const cmd = makeCommand(put)
      const task = {output: ''}

      await cmd.pushPage({...page, slug: 'home', status: 'publish'}, task)

      expect(task.output).toBe('Pushed: home (publish) https://example.test/ (now the site front page)')
    })

    it('surfaces the server refusal and counts the failure', async () => {
      const cmd = makeCommand(vi.fn().mockRejectedValueOnce(new Error('Page "about" is in the trash.')))
      const task = {output: ''}

      await expect(cmd.pushPage(page, task)).rejects.toThrow('in the trash')

      expect(task.output).toBe('Failed to push about: Page "about" is in the trash.')
      expect(cmd.failedCount).toBe(1)
    })
  })

  describe('run', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-page-push-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('refuses the whole push before any network call when the directory holds a bad file', async () => {
      writeFileSync(join(dir, 'about.html'), '<p/>')
      writeFileSync(join(dir, 'evil.php'), '<?php')
      const put = vi.fn()
      const cmd = makeCommand(put)
      cmd.localConfig = {pageDir: '.', rootDir: dir}
      cmd.parse = async () => ({args: {}})

      await expect(cmd.run()).rejects.toThrow('only .html files are allowed')
      expect(put).not.toHaveBeenCalled()
    })

    it('pushes only the requested slug', async () => {
      writeFileSync(join(dir, 'about.html'), '<!-- status: publish -->\n<p>a</p>')
      writeFileSync(join(dir, 'contact.html'), '<p>c</p>')
      const put = vi.fn().mockResolvedValue({link: '', status: 'publish'})
      const cmd = makeCommand(put)
      cmd.localConfig = {pageDir: '.', rootDir: dir}
      cmd.parse = async () => ({args: {slug: 'about'}})

      const result = await cmd.run()

      expect(result).toEqual({pushed: ['about'], status: 'success'})
      expect(put).toHaveBeenCalledTimes(1)
      expect(put).toHaveBeenCalledWith('loopress/v1/pages', {
        fullWidth: false,
        hideTitle: false,
        html: '<p>a</p>',
        slug: 'about',
        status: 'publish',
        template: '',
        title: 'About',
      })
    })

    it('pushes every page when no slug is given and reports success', async () => {
      writeFileSync(join(dir, 'about.html'), '<p>a</p>')
      writeFileSync(join(dir, 'contact.html'), '<p>c</p>')
      const put = vi.fn().mockResolvedValue({link: '', status: 'draft'})
      const cmd = makeCommand(put)
      const logs = (cmd as unknown as {log: ReturnType<typeof vi.fn>}).log
      cmd.localConfig = {pageDir: '.', rootDir: dir}
      cmd.parse = async () => ({args: {}})

      const result = await cmd.run()

      expect(result).toEqual({pushed: ['about', 'contact'], status: 'success'})
      expect(logs).toHaveBeenCalledWith('Found 2 pages to push')
      expect(logs).toHaveBeenCalledWith('All pages pushed.')
    })

    it('errors on an unknown slug before any network call', async () => {
      writeFileSync(join(dir, 'about.html'), '<p>a</p>')
      const put = vi.fn()
      const cmd = makeCommand(put)
      cmd.localConfig = {pageDir: '.', rootDir: dir}
      cmd.parse = async () => ({args: {slug: 'missing'}})

      await expect(cmd.run()).rejects.toThrow(`No page "missing" in ${dir} (expected missing.html).`)
      expect(put).not.toHaveBeenCalled()
    })

    it('returns a dry-run status without any write on a dry run', async () => {
      writeFileSync(join(dir, 'about.html'), '<p>a</p>')
      const put = vi.fn()
      const cmd = makeCommand(put)
      cmd.dryRun = true
      ;(cmd as unknown as {wpClient: {get: unknown}}).wpClient.get = vi.fn().mockResolvedValue([])
      cmd.localConfig = {pageDir: '.', rootDir: dir}
      cmd.parse = async () => ({args: {}})

      const result = await cmd.run()

      expect(result).toEqual({changes: [{id: 'about', status: 'created'}], pushed: ['about'], status: 'dry-run'})
      expect(put).not.toHaveBeenCalled()
    })

    it('errors with the failed count instead of reporting success', async () => {
      writeFileSync(join(dir, 'about.html'), '<p>a</p>')
      const cmd = makeCommand(vi.fn().mockRejectedValue(new Error('boom')))
      cmd.localConfig = {pageDir: '.', rootDir: dir}
      cmd.parse = async () => ({args: {}})

      await expect(cmd.run()).rejects.toThrow('1 page failed to push.')
    })
  })

  describe('taking over a page Loopress did not create', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-page-adopt-test-'))
      writeFileSync(join(dir, 'about.html'), '<p>a</p>')
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
      vi.mocked(isInteractive).mockReturnValue(false)
    })

    function makeRunCommand(put: Parameters<typeof makeCommand>[0]): PushInternals {
      const cmd = makeCommand(put)
      cmd.localConfig = {pageDir: '.', rootDir: dir}
      cmd.parse = async () => ({args: {}})
      return cmd
    }

    it('sends adopt on the first try with --overwrite', async () => {
      const put = vi.fn().mockResolvedValue({link: '', status: 'draft'})
      const cmd = makeRunCommand(put)
      cmd.overwrite = true

      await cmd.run()

      expect(put).toHaveBeenCalledWith('loopress/v1/pages', expect.objectContaining({adopt: true, slug: 'about'}))
    })

    it('fails without a terminal to ask in, naming --overwrite', async () => {
      const cmd = makeRunCommand(vi.fn().mockRejectedValue(notManaged()))
      const {warn} = (cmd as unknown as {warn: ReturnType<typeof vi.fn>})

      await expect(cmd.run()).rejects.toThrow('1 page failed to push.')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not created by Loopress: about. '))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('--overwrite'))
      expect(confirm).not.toHaveBeenCalled()
    })

    it('asks once, then pushes again with adopt', async () => {
      vi.mocked(isInteractive).mockReturnValue(true)
      vi.mocked(confirm).mockResolvedValueOnce(true)
      const put = vi.fn().mockRejectedValueOnce(notManaged()).mockResolvedValue({link: '', status: 'draft'})
      const cmd = makeRunCommand(put)

      const result = await cmd.run()

      expect(result).toEqual({pushed: ['about'], status: 'success'})
      expect(put).toHaveBeenLastCalledWith('loopress/v1/pages', expect.objectContaining({adopt: true}))
    })

    it('counts the page as failed when the takeover is declined', async () => {
      vi.mocked(isInteractive).mockReturnValue(true)
      vi.mocked(confirm).mockResolvedValueOnce(false)
      const put = vi.fn().mockRejectedValue(notManaged())
      const cmd = makeRunCommand(put)

      await expect(cmd.run()).rejects.toThrow('1 page failed to push.')
      expect(put).toHaveBeenCalledTimes(1)
    })
  })

  describe('pushPage dry run', () => {
    it('reports the slug and status without calling WordPress', async () => {
      const put = vi.fn()
      const cmd = makeCommand(put)
      cmd.dryRun = true
      const task = {output: ''}

      await cmd.pushPage(page, task)

      expect(put).not.toHaveBeenCalled()
      expect(task.output).toBe('[dry-run] Would push: about (draft)')
    })
  })
})
