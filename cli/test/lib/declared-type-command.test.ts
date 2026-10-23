import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import CptList from '../../src/commands/cpt/list.js'
import CptPull from '../../src/commands/cpt/pull.js'
import CptPush from '../../src/commands/cpt/push.js'
import CptRm from '../../src/commands/cpt/rm.js'
import PatternList from '../../src/commands/pattern/list.js'
import PatternPull from '../../src/commands/pattern/pull.js'
import TaxonomyList from '../../src/commands/taxonomy/list.js'
import TaxonomyRm from '../../src/commands/taxonomy/rm.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {type LoopressLocalConfig} from '../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

vi.mock('listr2', async () => {
  const {createListrMock} = await import('../helpers/listr.js')
  return createListrMock()
})

const {confirm} = vi.hoisted(() => ({confirm: vi.fn()}))
vi.mock('@inquirer/prompts', () => ({confirm}))

const interactive = vi.hoisted(() => ({value: true}))
vi.mock('../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

type Internals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
  siteConfig: EnvironmentConfig
  wpClient: {delete: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>}
  yes: boolean
}

type AnyCommand = {run(): Promise<unknown>}

function make<T extends AnyCommand>(
  Command: new (argv: string[], config: typeof fakeOclifConfig) => T,
  argv: string[],
  {dryRun = false, get = vi.fn(), yes = false}: {dryRun?: boolean; get?: ReturnType<typeof vi.fn>; yes?: boolean} = {},
) {
  const cmd = new Command(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd as never)
  const internals = cmd as unknown as Internals
  internals.dryRun = dryRun
  internals.yes = yes
  internals.localConfig = {}
  internals.siteConfig = makeEnv('production', 'https://acme.com')
  internals.wpClient = {delete: vi.fn().mockResolvedValue({}), get}
  return {cmd, internals, logs}
}

function notFound(error?: string): Error {
  return new Error('not found', {cause: {response: {body: error === undefined ? '' : JSON.stringify({error}), statusCode: 404}}})
}

describe('declared type commands', () => {
  beforeEach(() => {
    confirm.mockReset()
    interactive.value = true
  })

  describe('list', () => {
    it('prints each item with its source, count and post types, and warns about conflicts', async () => {
      const items = [
        {conflict: false, count: 2, label: 'Genres', managed: true, objectTypes: ['book', 'movie'], slug: 'genre', source: 'loopress'},
        {conflict: true, count: 1, label: 'Tags', managed: false, objectTypes: [], slug: 'post_tag', source: 'wordpress'},
        {conflict: false, count: 0, label: 'Brands', managed: false, slug: 'brand', source: 'acf'},
      ]
      const get = vi.fn().mockResolvedValue(items)
      const {cmd, logs} = make(TaxonomyList, [], {get})

      expect(await cmd.run()).toEqual(items)

      expect(get).toHaveBeenCalledWith('loopress/v1/registered-taxonomies')
      expect(logs.log.mock.calls.map(([line]) => line)).toEqual([
        'genre (Genres): Loopress, 2 terms, on book, movie',
        'post_tag (Tags): WordPress, 1 term',
        'brand (Brands): ACF, 0 terms',
      ])
      expect(logs.warn).toHaveBeenCalledTimes(1)
      expect(logs.warn).toHaveBeenCalledWith(
        'post_tag: declared in taxonomies/ but already registered by WordPress, the Loopress version is skipped',
      )
    })

    it('labels every source and the post type count', async () => {
      const get = vi.fn().mockResolvedValue([
        {conflict: false, count: 3, label: 'Books', managed: false, slug: 'book', source: 'cptui'},
        {conflict: false, count: 0, label: 'Events', managed: false, slug: 'event', source: 'other'},
      ])
      const {cmd, logs} = make(CptList, [], {get})

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/registered-post-types')
      expect(logs.log.mock.calls.map(([line]) => line)).toEqual(['book (Books): CPT UI, 3 published', 'event (Events): theme or plugin, 0 published'])
    })

    it('leaves the count out when its label is empty', async () => {
      const get = vi.fn().mockResolvedValue([{conflict: false, count: 0, label: 'Hero', managed: true, slug: 'hero', source: 'loopress'}])
      const {cmd, logs} = make(PatternList, [], {get})

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('hero (Hero): Loopress')
    })
  })

  describe('pull', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-declared-pull-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('writes one JSON file of arguments per item and removes the orphans', async () => {
      const path = join(dir, 'cpt')
      mkdirSync(path)
      writeFileSync(join(path, 'gone.json'), '{}')
      writeFileSync(join(path, 'notes.md'), '# kept')
      const get = vi.fn().mockResolvedValue([{args: {public: true}, revision: 'r1', slug: 'book'}])
      const {cmd, logs} = make(CptPull, [path], {get, yes: true})

      expect(await cmd.run()).toEqual({path, status: 'success'})

      expect(get).toHaveBeenCalledWith('loopress/v1/post-types')
      expect(readFileSync(join(path, 'book.json'), 'utf8')).toBe('{\n  "public": true\n}\n')
      expect(existsSync(join(path, 'gone.json'))).toBe(false)
      expect(existsSync(join(path, 'notes.md'))).toBe(true)
      expect(logs.log).toHaveBeenCalledWith('Pulling post types from https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`Path: ${path}`)
      expect(logs.log).toHaveBeenCalledWith(`Pulled 1 post type to ${path}`)
    })

    it('writes a pattern as its HTML file', async () => {
      const get = vi.fn().mockResolvedValue([{args: {content: '<p>Hi</p>', title: 'Hero'}, revision: 'r1', slug: 'hero'}])
      const {cmd} = make(PatternPull, [dir], {get, yes: true})

      await cmd.run()

      expect(get).toHaveBeenCalledWith('loopress/v1/patterns')
      expect(readFileSync(join(dir, 'hero.html'), 'utf8')).toBe('<!--\ntitle: Hero\n-->\n<p>Hi</p>')
    })

    it('only reports what it would do on a dry run', async () => {
      writeFileSync(join(dir, 'gone.json'), '{}')
      const get = vi.fn().mockResolvedValue([
        {args: {}, revision: 'r1', slug: 'book'},
        {args: {}, revision: 'r2', slug: 'movie'},
      ])
      const {cmd, logs} = make(CptPull, [dir], {dryRun: true, get})

      expect(await cmd.run()).toEqual({path: dir, status: 'dry-run'})

      expect(existsSync(join(dir, 'book.json'))).toBe(false)
      expect(logs.log).toHaveBeenCalledWith(`[dry-run] Would pull 2 post types to ${dir}`)
      expect(logs.log).toHaveBeenCalledWith(`[dry-run] Would remove 1 local file in ${dir} no longer present on WordPress: gone.json`)
    })
  })

  describe('rm', () => {
    it('removes after a confirmation that says what is kept', async () => {
      confirm.mockResolvedValue(true)
      const {cmd, internals, logs} = make(CptRm, ['book'])

      expect(await cmd.run()).toEqual({removed: true, slug: 'book', status: 'success'})

      expect(confirm).toHaveBeenCalledWith({
        default: false,
        message: "Remove post type book from https://acme.com? Its posts are kept in the database, hidden until it's pushed again.",
      })
      expect(internals.wpClient.delete).toHaveBeenCalledWith('loopress/v1/post-types/book')
      expect(logs.log).toHaveBeenCalledWith(
        "Removed post type book from https://acme.com. Its posts are kept in the database, hidden until it's pushed again.",
      )
    })

    it('encodes the slug in the endpoint and skips the prompt with --yes', async () => {
      const {cmd, internals} = make(TaxonomyRm, ['a b'], {yes: true})

      await cmd.run()

      expect(confirm).not.toHaveBeenCalled()
      expect(internals.wpClient.delete).toHaveBeenCalledWith('loopress/v1/taxonomies/a%20b')
    })

    it('aborts when the confirmation is declined', async () => {
      confirm.mockResolvedValue(false)
      const {cmd, internals, logs} = make(CptRm, ['book'])

      expect(await cmd.run()).toEqual({removed: false, slug: 'book', status: 'aborted'})

      expect(internals.wpClient.delete).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('Aborted.')
    })

    it('touches nothing on a dry run', async () => {
      const {cmd, internals, logs} = make(CptRm, ['book'], {dryRun: true})

      expect(await cmd.run()).toEqual({removed: false, slug: 'book', status: 'dry-run'})

      expect(confirm).not.toHaveBeenCalled()
      expect(internals.wpClient.delete).not.toHaveBeenCalled()
      expect(logs.log).toHaveBeenCalledWith('[dry-run] Would remove post type book from https://acme.com')
    })

    it('needs --yes outside a TTY', async () => {
      interactive.value = false
      const {cmd, internals} = make(CptRm, ['book'])

      await expect(cmd.run()).rejects.toThrow('Removing post type book needs confirmation. Re-run with --yes.')
      expect(internals.wpClient.delete).not.toHaveBeenCalled()
    })

    it('explains an item Loopress does not manage', async () => {
      const {cmd, internals} = make(TaxonomyRm, ['category'], {yes: true})
      internals.wpClient.delete.mockRejectedValue(notFound('Taxonomy not found'))

      await expect(cmd.run()).rejects.toThrow('taxonomy category is not managed by Loopress on https://acme.com.')
    })

    it('rethrows any other error', async () => {
      const {cmd, internals} = make(CptRm, ['book'], {yes: true})
      internals.wpClient.delete.mockRejectedValue(notFound('rest_no_route'))

      await expect(cmd.run()).rejects.toThrow(/^not found$/)
    })
  })

  describe('push', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-declared-push-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    function makePush(argv: string[], {dryRun = false, get = vi.fn(), post = vi.fn()} = {}) {
      const made = make(CptPush, argv, {dryRun, get, yes: true})
      const seams = made.cmd as unknown as {
        captureBeforePushState: ReturnType<typeof vi.fn>
        previewChanges: unknown[]
        recordSuccess: ReturnType<typeof vi.fn>
        wpClient: {get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>}
        writeAfterPushSnapshot: ReturnType<typeof vi.fn>
      }
      seams.captureBeforePushState = vi.fn().mockResolvedValue(new Map())
      seams.writeAfterPushSnapshot = vi.fn().mockResolvedValue(undefined)
      seams.recordSuccess = vi.fn().mockResolvedValue(undefined)
      seams.wpClient = {get, post}
      return {...made, seams}
    }

    it('pushes every file, warns about a broken one, and records the success', async () => {
      writeFileSync(join(dir, 'book.json'), '{"public": true}')
      writeFileSync(join(dir, 'movie.json'), '{}')
      writeFileSync(join(dir, 'broken.json'), '{nope')
      const get = vi.fn().mockRejectedValue(notFound())
      const post = vi.fn().mockResolvedValue({})
      const {cmd, logs, seams} = makePush([dir], {get, post})

      expect(await cmd.run()).toEqual({path: dir, pushed: ['book', 'movie'], status: 'success'})

      expect(post).toHaveBeenCalledWith('loopress/v1/post-types', {args: {public: true}, slug: 'book'})
      expect(post).toHaveBeenCalledWith('loopress/v1/post-types', {args: {}, slug: 'movie'})
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('broken.json'))
      expect(logs.log).toHaveBeenCalledWith('Pushing post types to https://acme.com')
      expect(logs.log).toHaveBeenCalledWith(`Path: ${dir}`)
      expect(logs.log).toHaveBeenCalledWith('Found 2 post types to push')
      expect(logs.log).toHaveBeenCalledWith('All post types pushed.')
      expect(seams.writeAfterPushSnapshot).toHaveBeenCalledWith(expect.objectContaining({resource: 'cpt'}), dir, expect.any(Map))
      expect(seams.recordSuccess).toHaveBeenCalled()
    })

    it('fails with the count of refused items', async () => {
      writeFileSync(join(dir, 'book.json'), '{}')
      writeFileSync(join(dir, 'movie.json'), '{}')
      const {cmd, seams} = makePush([dir], {get: vi.fn().mockRejectedValue(notFound()), post: vi.fn().mockRejectedValue(new Error('reserved'))})

      await expect(cmd.run()).rejects.toThrow('2 post types failed to push.')
      expect(seams.recordSuccess).not.toHaveBeenCalled()
    })

    it('returns the preview on a dry run, writing nothing', async () => {
      writeFileSync(join(dir, 'book.json'), '{}')
      const post = vi.fn()
      const {cmd, seams} = makePush([dir], {dryRun: true, post})
      seams.captureBeforePushState.mockImplementation(async () => {
        seams.previewChanges = [{id: 'book', status: 'created'}]
        return new Map()
      })

      expect(await cmd.run()).toEqual({changes: [{id: 'book', status: 'created'}], path: dir, pushed: ['book'], status: 'dry-run'})
      expect(post).not.toHaveBeenCalled()
      expect(seams.recordSuccess).not.toHaveBeenCalled()
    })

    it('rethrows a revision read failure other than a 404 as the item failure', async () => {
      writeFileSync(join(dir, 'book.json'), '{}')
      const post = vi.fn()
      const {cmd} = makePush([dir], {get: vi.fn().mockRejectedValue(new Error('timeout')), post})

      await expect(cmd.run()).rejects.toThrow('1 post type failed to push.')
      expect(post).not.toHaveBeenCalled()
    })
  })
})
