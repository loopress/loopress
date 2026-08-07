import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {rename} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/page/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, rename: vi.fn(actual.rename)}
})

type LocalPage = {
  content: string
  contentPath: string
  meta: Record<string, unknown>
  metaPath: string
}

// loadFiles(), ensureCanonicalFilename() and pushPage() are private; the cast below is the
// same escape hatch used throughout this suite to unit-test command internals without going
// through the full oclif run() lifecycle (see snippet push.test.ts).
type PushWithEnsureCanonicalFilename = {ensureCanonicalFilename(page: LocalPage, id: number, title: string): Promise<void>}
type PushWithLoadFiles = {loadFiles(path: string): Promise<LocalPage[]>}
type PushWithPushPage = {
  failedCount: number
  pushPage(page: LocalPage, task?: {output: string}): Promise<void>
  wpClient: {post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

async function ensureCanonicalFilename(page: LocalPage, id: number, title: string): Promise<void> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithEnsureCanonicalFilename).ensureCanonicalFilename(page, id, title)
}

async function loadFiles(path: string): Promise<LocalPage[]> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithLoadFiles).loadFiles(path)
}

// Mirrors WpClient.isNotFoundError()'s expected shape (see lib/wp-client.ts).
function notFoundError(): Error {
  return new Error('not found', {cause: {response: {statusCode: 404}}})
}

describe('page push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-page-push-test-'))
    vi.mocked(rename).mockClear()
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('loadFiles', () => {
    it('reads an .html/.json pair with parsed meta', async () => {
      writeFileSync(join(dir, '9-contact.html'), '<p>Hi</p>')
      writeFileSync(join(dir, '9-contact.json'), JSON.stringify({id: 9, title: 'Contact'}))

      const pages = await loadFiles(dir)

      expect(pages).toEqual([
        {
          content: '<p>Hi</p>',
          contentPath: join(dir, '9-contact.html'),
          meta: {id: 9, title: 'Contact'},
          metaPath: join(dir, '9-contact.json'),
        },
      ])
    })

    it('defaults meta to {} when there is no sidecar json (fresh hand-created page)', async () => {
      writeFileSync(join(dir, 'contact.html'), '<p>Hi</p>')

      const pages = await loadFiles(dir)

      expect(pages).toHaveLength(1)
      expect(pages[0].meta).toEqual({})
    })

    it('skips a page with malformed sidecar JSON instead of aborting the rest', async () => {
      writeFileSync(join(dir, '1-broken.html'), '<p>Broken</p>')
      writeFileSync(join(dir, '1-broken.json'), '{ this is not valid json !!')
      writeFileSync(join(dir, '2-fine.html'), '<p>Fine</p>')
      writeFileSync(join(dir, '2-fine.json'), JSON.stringify({id: 2}))

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const pages = await (cmd as unknown as PushWithLoadFiles).loadFiles(dir)

      expect(pages).toHaveLength(1)
      expect(pages[0].meta).toEqual({id: 2})
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('1-broken.json'))
    })

    it('ignores non-.html files', async () => {
      writeFileSync(join(dir, '9-contact.html'), '<p>Hi</p>')
      writeFileSync(join(dir, 'README.md'), '# notes')

      const pages = await loadFiles(dir)

      expect(pages).toHaveLength(1)
    })

    it('returns an empty array when the directory does not exist yet', async () => {
      const pages = await loadFiles(join(dir, 'does-not-exist'))

      expect(pages).toEqual([])
    })

    it('rethrows a readdir failure that is not ENOENT instead of silently returning no pages', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const eacces = Object.assign(new Error('EACCES'), {code: 'EACCES'})
      const readdirMock = vi.spyOn(await import('node:fs/promises'), 'readdir').mockRejectedValueOnce(eacces)

      await expect((cmd as unknown as PushWithLoadFiles).loadFiles(dir)).rejects.toThrow('EACCES')

      readdirMock.mockRestore()
    })

    it('skips a sidecar that parses to valid JSON but not an object (e.g. a bare number)', async () => {
      writeFileSync(join(dir, '1-not-an-object.html'), '<p>Not an object</p>')
      writeFileSync(join(dir, '1-not-an-object.json'), '42')
      writeFileSync(join(dir, '2-fine.html'), '<p>Fine</p>')
      writeFileSync(join(dir, '2-fine.json'), JSON.stringify({id: 2}))

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const pages = await (cmd as unknown as PushWithLoadFiles).loadFiles(dir)

      expect(pages).toHaveLength(1)
      expect(pages[0].meta).toEqual({id: 2})
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('not a JSON object'))
    })

    // typeof null === 'object' in JS, so a literal JSON `null` sidecar only trips the explicit
    // `=== null` half of the guard, not the `typeof !== 'object'` half covered by the number
    // case above; both halves need their own case to be sure neither one is a no-op.
    it('skips a sidecar that parses to a literal JSON null', async () => {
      writeFileSync(join(dir, '1-null.html'), '<p>Null sidecar</p>')
      writeFileSync(join(dir, '1-null.json'), 'null')

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const pages = await (cmd as unknown as PushWithLoadFiles).loadFiles(dir)

      expect(pages).toHaveLength(0)
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('not a JSON object'))
    })
  })

  describe('ensureCanonicalFilename', () => {
    it('renames both files of a pair to the canonical <id>-<slug> name', async () => {
      writeFileSync(join(dir, 'demo.html'), '<p>Hi</p>')
      writeFileSync(join(dir, 'demo.json'), JSON.stringify({status: 'draft'}))

      await ensureCanonicalFilename(
        {content: '<p>Hi</p>', contentPath: join(dir, 'demo.html'), meta: {status: 'draft'}, metaPath: join(dir, 'demo.json')},
        8,
        'Demo Page',
      )

      const files = readdirSync(dir).sort()
      expect(files).toEqual(['8-demo-page.html', '8-demo-page.json'])
      expect(existsSync(join(dir, 'demo.html'))).toBe(false)
      expect(existsSync(join(dir, 'demo.json'))).toBe(false)
      expect(JSON.parse(readFileSync(join(dir, '8-demo-page.json'), 'utf8'))).toEqual({id: 8, status: 'draft'})
    })

    it('renames a content file that never had a sidecar', async () => {
      writeFileSync(join(dir, 'foo.html'), '<p>Hi</p>')

      await ensureCanonicalFilename({content: '<p>Hi</p>', contentPath: join(dir, 'foo.html'), meta: {}, metaPath: join(dir, 'foo.json')}, 5, 'Foo')

      expect(readdirSync(dir).sort()).toEqual(['5-foo.html', '5-foo.json'])
    })

    it('leaves an already-canonical pair in place, without calling rename at all', async () => {
      writeFileSync(join(dir, '6-hello.html'), '<p>Hi</p>')
      writeFileSync(join(dir, '6-hello.json'), JSON.stringify({id: 6}))

      await ensureCanonicalFilename(
        {content: '<p>Hi</p>', contentPath: join(dir, '6-hello.html'), meta: {id: 6}, metaPath: join(dir, '6-hello.json')},
        6,
        'hello',
      )

      expect(readdirSync(dir).sort()).toEqual(['6-hello.html', '6-hello.json'])
      // Same end state would also result from renaming a file to its own name, so the file
      // listing alone doesn't prove the early-return branch actually ran.
      expect(rename).not.toHaveBeenCalled()
    })

    it('slugifies a title with spaces and punctuation for the new filename', async () => {
      writeFileSync(join(dir, 'weird name.html'), '<p>Hi</p>')

      await ensureCanonicalFilename(
        {content: '<p>Hi</p>', contentPath: join(dir, 'weird name.html'), meta: {}, metaPath: join(dir, 'weird name.json')},
        9,
        'Weird Name!',
      )

      expect(readdirSync(dir).sort()).toEqual(['9-weird-name.html', '9-weird-name.json'])
    })

    it('persists the id under the current filename before attempting the rename, so a failed rename does not lose it', async () => {
      writeFileSync(join(dir, 'demo.html'), '<p>Hi</p>')

      vi.mocked(rename).mockRejectedValueOnce(new Error('EPERM'))

      await expect(
        ensureCanonicalFilename({content: '<p>Hi</p>', contentPath: join(dir, 'demo.html'), meta: {}, metaPath: join(dir, 'demo.json')}, 8, 'demo'),
      ).rejects.toThrow('EPERM')

      // The content file was never renamed (rename failed), but its sidecar already carries the
      // id: a retry of `page push` will read demo.html + demo.json, see the id, and PUT an
      // update instead of POSTing a duplicate create.
      expect(existsSync(join(dir, 'demo.html'))).toBe(true)
      expect(JSON.parse(readFileSync(join(dir, 'demo.json'), 'utf8'))).toEqual({id: 8})
    })
  })

  describe('pushPage', () => {
    // A failure is thrown before ensureCanonicalFilename ever touches disk, so these two don't
    // need real files at contentPath/metaPath, same as pushSnippet's failure tests in
    // snippet/push.test.ts.
    const page: LocalPage = {content: '<p>Hi</p>', contentPath: join('/tmp', 'demo.html'), meta: {id: 8, title: 'Demo'}, metaPath: join('/tmp', 'demo.json')}

    it('routes the failure message through task.output instead of warn, and rethrows so Listr marks the task failed', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushPage).wpClient = {post: vi.fn(), put}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushPage).pushPage(page, task)).rejects.toThrow('boom')

      expect(task.output).toBe('Failed to push Demo: boom')
      expect(logs.warn).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushPage).failedCount).toBe(1)
    })

    it('falls back to warn when called without a task', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushPage).wpClient = {post: vi.fn(), put}

      await expect((cmd as unknown as PushWithPushPage).pushPage(page)).rejects.toThrow('boom')

      expect(logs.warn).toHaveBeenCalledWith('  Failed to push Demo: boom')
      expect((cmd as unknown as PushWithPushPage).failedCount).toBe(1)
    })

    // A success reaches ensureCanonicalFilename, which renames real files on disk, so these two
    // need an actual pair in the temp dir first.
    it('PUTs to wp/v2/pages/<id> with content merged into the metadata payload, and reports success on the task', async () => {
      writeFileSync(join(dir, 'demo.html'), '<p>Hi</p>')
      writeFileSync(join(dir, 'demo.json'), JSON.stringify({id: 8, title: 'Demo'}))
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({})
      ;(cmd as unknown as PushWithPushPage).wpClient = {post: vi.fn(), put}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushPage).pushPage(
        {
          content: '<p>Hi</p>',
          contentPath: join(dir, 'demo.html'),
          meta: {id: 8, title: 'Demo'},
          metaPath: join(dir, 'demo.json'),
        },
        task,
      )

      expect(put).toHaveBeenCalledWith('wp/v2/pages/8', {content: '<p>Hi</p>', id: 8, title: 'Demo'})
      expect(task.output).toBe('Pushed: Demo')
    })

    it('POSTs a new page when there is no local id, and renames the local file to the id WordPress assigned', async () => {
      writeFileSync(join(dir, 'new.html'), '<p>Hi</p>')
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const post = vi.fn().mockResolvedValueOnce({id: 42})
      ;(cmd as unknown as PushWithPushPage).wpClient = {post, put: vi.fn()}

      await (cmd as unknown as PushWithPushPage).pushPage({
        content: '<p>Hi</p>',
        contentPath: join(dir, 'new.html'),
        meta: {title: 'New'},
        metaPath: join(dir, 'new.json'),
      })

      expect(post).toHaveBeenCalledWith('wp/v2/pages', {content: '<p>Hi</p>', title: 'New'})
      // Regression coverage: nothing else in this test observes whether ensureCanonicalFilename
      // actually ran after a successful create, only that `post` was called correctly.
      expect(readdirSync(dir).sort()).toEqual(['42-new.html', '42-new.json'])
    })

    it('skips the network entirely on a dry run, and reports what would happen on the task', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true
      const post = vi.fn()
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushPage).wpClient = {post, put}
      const task = {output: ''}

      await (cmd as unknown as PushWithPushPage).pushPage(
        {content: '<p>Hi</p>', contentPath: join(dir, 'new.html'), meta: {title: 'New'}, metaPath: join(dir, 'new.json')},
        task,
      )

      expect(post).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
      expect(task.output).toBe('[dry-run] Would push: New')
    })

    it('recreates a page whose local id no longer exists on the site, without the stale id in the create payload', async () => {
      writeFileSync(join(dir, '8-demo.html'), '<p>Hi</p>')
      writeFileSync(join(dir, '8-demo.json'), JSON.stringify({id: 8, title: 'Demo'}))
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(notFoundError())
      const post = vi.fn().mockResolvedValueOnce({id: 99})
      ;(cmd as unknown as PushWithPushPage).wpClient = {post, put}

      await (cmd as unknown as PushWithPushPage).pushPage({
        content: '<p>Hi</p>',
        contentPath: join(dir, '8-demo.html'),
        meta: {id: 8, title: 'Demo'},
        metaPath: join(dir, '8-demo.json'),
      })

      expect(put).toHaveBeenCalledWith('wp/v2/pages/8', {content: '<p>Hi</p>', id: 8, title: 'Demo'})
      // No `id` in the create payload: WordPress core rejects a POST that carries one with a
      // 400 "Cannot create existing post", even when that id no longer exists on the site.
      expect(post).toHaveBeenCalledWith('wp/v2/pages', {content: '<p>Hi</p>', title: 'Demo'})
      expect(readdirSync(dir).sort()).toEqual(['99-demo.html', '99-demo.json'])
    })
  })
})
