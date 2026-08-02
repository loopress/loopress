import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {rename} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/form/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, rename: vi.fn(actual.rename)}
})

// loadFiles(), ensureCanonicalFilename() and pushForm() are private; the cast below is the
// same escape hatch used throughout this suite (see page/push.test.ts, snippet/push.test.ts)
// to unit-test command internals without going through the full oclif run() lifecycle.
type PushWithEnsureCanonicalFilename = {ensureCanonicalFilename(filePath: string, id: number, title: string): Promise<void>}
type PushWithLoadFiles = {loadFiles(dir: string): Promise<Array<{data: Record<string, unknown>; filePath: string}>>}
type PushWithPushForm = {
  failedCount: number
  pushForm(filePath: string, data: Record<string, unknown>, task?: {output: string}): Promise<void>
  wpClient: {post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

function ensureCanonicalFilename(filePath: string, id: number, title: string): Promise<void> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithEnsureCanonicalFilename).ensureCanonicalFilename(filePath, id, title)
}

function loadFiles(dir: string): Promise<Array<{data: Record<string, unknown>; filePath: string}>> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithLoadFiles).loadFiles(dir)
}

// Mirrors WpClient.isNotFoundError()'s expected shape (see lib/wp-client.ts).
function notFoundError(): Error {
  return Object.assign(new Error('not found'), {cause: {response: {statusCode: 404}}})
}

describe('form push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-form-push-test-'))
    vi.mocked(rename).mockClear()
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('loadFiles', () => {
    it('reads a well-formed .json file', async () => {
      // eslint-disable-next-line camelcase
      writeFileSync(join(dir, '9-contact.json'), JSON.stringify({id: 9, settings: {form_title: 'Contact'}}))

      const forms = await loadFiles(dir)

      // eslint-disable-next-line camelcase
      expect(forms).toEqual([{data: {id: 9, settings: {form_title: 'Contact'}}, filePath: join(dir, '9-contact.json')}])
    })

    it('skips a file with malformed JSON instead of aborting the rest', async () => {
      writeFileSync(join(dir, '1-broken.json'), '{ this is not valid json !!')
      writeFileSync(join(dir, '2-fine.json'), JSON.stringify({id: 2}))

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const forms = await (cmd as unknown as PushWithLoadFiles).loadFiles(dir)

      expect(forms).toHaveLength(1)
      expect(forms[0].data).toEqual({id: 2})
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('1-broken.json'))
    })

    it('skips a file that parses to valid JSON but not an object (e.g. a bare number)', async () => {
      writeFileSync(join(dir, '1-number.json'), '42')
      writeFileSync(join(dir, '2-fine.json'), JSON.stringify({id: 2}))

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const forms = await (cmd as unknown as PushWithLoadFiles).loadFiles(dir)

      expect(forms).toHaveLength(1)
      expect(forms[0].data).toEqual({id: 2})
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('not a JSON object'))
    })

    // typeof null === 'object' in JS, so a literal JSON `null` file only trips the explicit
    // `=== null` half of the guard, not the `typeof !== 'object'` half covered by the number
    // case above; both halves need their own case to be sure neither one is a no-op.
    it('skips a file that parses to a literal JSON null', async () => {
      writeFileSync(join(dir, '1-null.json'), 'null')

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const forms = await (cmd as unknown as PushWithLoadFiles).loadFiles(dir)

      expect(forms).toHaveLength(0)
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('not a JSON object'))
    })

    it('ignores non-.json files', async () => {
      writeFileSync(join(dir, '9-contact.json'), JSON.stringify({id: 9}))
      writeFileSync(join(dir, 'README.md'), '# notes')

      const forms = await loadFiles(dir)

      expect(forms).toHaveLength(1)
    })

    it('returns an empty array when the directory does not exist yet', async () => {
      const forms = await loadFiles(join(dir, 'does-not-exist'))

      expect(forms).toEqual([])
    })

    it('rethrows a readdir failure that is not ENOENT instead of silently returning no forms', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const eacces = Object.assign(new Error('EACCES'), {code: 'EACCES'})
      const readdirMock = vi.spyOn(await import('node:fs/promises'), 'readdir').mockRejectedValueOnce(eacces)

      await expect((cmd as unknown as PushWithLoadFiles).loadFiles(dir)).rejects.toThrow('EACCES')

      readdirMock.mockRestore()
    })
  })

  describe('ensureCanonicalFilename', () => {
    it('renames a file with no id/slug in its name to the canonical <id>-<slug>.json name', async () => {
      writeFileSync(join(dir, 'demo.json'), JSON.stringify({id: 8}))

      await ensureCanonicalFilename(join(dir, 'demo.json'), 8, 'demo')

      expect(readdirSync(dir).sort()).toEqual(['8-demo.json'])
      expect(existsSync(join(dir, 'demo.json'))).toBe(false)
    })

    it('leaves an already-canonical file in place, without calling rename at all', async () => {
      // eslint-disable-next-line camelcase
      writeFileSync(join(dir, '6-hello.json'), JSON.stringify({id: 6, settings: {form_title: 'hello'}}))

      await ensureCanonicalFilename(join(dir, '6-hello.json'), 6, 'hello')

      expect(readdirSync(dir).sort()).toEqual(['6-hello.json'])
      expect(rename).not.toHaveBeenCalled()
    })

    it('slugifies a title with spaces and punctuation for the new filename', async () => {
      writeFileSync(join(dir, 'weird name.json'), JSON.stringify({id: 9}))

      await ensureCanonicalFilename(join(dir, 'weird name.json'), 9, 'Weird Name!')

      expect(readdirSync(dir).sort()).toEqual(['9-weird-name.json'])
    })

    it('falls back to "untitled" for a title that slugifies to nothing', async () => {
      writeFileSync(join(dir, 'blank.json'), JSON.stringify({id: 4}))

      await ensureCanonicalFilename(join(dir, 'blank.json'), 4, '???')

      expect(readdirSync(dir).sort()).toEqual(['4-untitled.json'])
    })
  })

  describe('pushForm', () => {
    it('routes the failure message through task.output instead of warn, and rethrows so Listr marks the task failed', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushForm).wpClient = {post: vi.fn(), put}
      const task = {output: ''}

      await expect(
        // eslint-disable-next-line camelcase
        (cmd as unknown as PushWithPushForm).pushForm(join(dir, 'demo.json'), {id: 8, settings: {form_title: 'Demo'}}, task),
      ).rejects.toThrow('boom')

      expect(task.output).toBe('Failed to push Demo: boom')
      expect(logs.warn).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushForm).failedCount).toBe(1)
    })

    it('falls back to warn when called without a task', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushForm).wpClient = {post: vi.fn(), put}

      // eslint-disable-next-line camelcase
      await expect((cmd as unknown as PushWithPushForm).pushForm(join(dir, 'demo.json'), {id: 8, settings: {form_title: 'Demo'}})).rejects.toThrow(
        'boom',
      )

      expect(logs.warn).toHaveBeenCalledWith('  Failed to push Demo: boom')
      expect((cmd as unknown as PushWithPushForm).failedCount).toBe(1)
    })

    it('PUTs to loopress/v1/forms/<id> and renames the file to the canonical name', async () => {
      // eslint-disable-next-line camelcase
      writeFileSync(join(dir, 'demo.json'), JSON.stringify({id: 8, settings: {form_title: 'Demo'}}))
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockResolvedValueOnce({})
      ;(cmd as unknown as PushWithPushForm).wpClient = {post: vi.fn(), put}
      const task = {output: ''}

      // eslint-disable-next-line camelcase
      await (cmd as unknown as PushWithPushForm).pushForm(join(dir, 'demo.json'), {id: 8, settings: {form_title: 'Demo'}}, task)

      // eslint-disable-next-line camelcase
      expect(put).toHaveBeenCalledWith('loopress/v1/forms/8', {id: 8, settings: {form_title: 'Demo'}})
      expect(task.output).toBe('Pushed: Demo')
      expect(readdirSync(dir).sort()).toEqual(['8-demo.json'])
    })

    it('POSTs a new form when there is no local id, and renames the local file to the id WordPress assigned', async () => {
      // eslint-disable-next-line camelcase
      writeFileSync(join(dir, 'new.json'), JSON.stringify({settings: {form_title: 'New'}}))
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      // eslint-disable-next-line camelcase
      const post = vi.fn().mockResolvedValueOnce({id: 42, settings: {form_title: 'New'}})
      ;(cmd as unknown as PushWithPushForm).wpClient = {post, put: vi.fn()}

      // eslint-disable-next-line camelcase
      await (cmd as unknown as PushWithPushForm).pushForm(join(dir, 'new.json'), {settings: {form_title: 'New'}})

      // eslint-disable-next-line camelcase
      expect(post).toHaveBeenCalledWith('loopress/v1/forms', {settings: {form_title: 'New'}})
      expect(readdirSync(dir).sort()).toEqual(['42-new.json'])
    })

    it('skips the network entirely on a dry run, and reports what would happen on the task', async () => {
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true
      const post = vi.fn()
      const put = vi.fn()
      ;(cmd as unknown as PushWithPushForm).wpClient = {post, put}
      const task = {output: ''}

      // eslint-disable-next-line camelcase
      await (cmd as unknown as PushWithPushForm).pushForm(join(dir, 'new.json'), {settings: {form_title: 'New'}}, task)

      expect(post).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
      expect(task.output).toBe('[dry-run] Would push: New')
    })

    it('recreates a form whose local id no longer exists on the site', async () => {
      // eslint-disable-next-line camelcase
      writeFileSync(join(dir, '8-demo.json'), JSON.stringify({id: 8, settings: {form_title: 'Demo'}}))
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(notFoundError())
      // eslint-disable-next-line camelcase
      const post = vi.fn().mockResolvedValueOnce({id: 99, settings: {form_title: 'Demo'}})
      ;(cmd as unknown as PushWithPushForm).wpClient = {post, put}

      // eslint-disable-next-line camelcase
      await (cmd as unknown as PushWithPushForm).pushForm(join(dir, '8-demo.json'), {id: 8, settings: {form_title: 'Demo'}})

      // eslint-disable-next-line camelcase
      expect(put).toHaveBeenCalledWith('loopress/v1/forms/8', {id: 8, settings: {form_title: 'Demo'}})
      // eslint-disable-next-line camelcase
      expect(post).toHaveBeenCalledWith('loopress/v1/forms', {id: 8, settings: {form_title: 'Demo'}})
      expect(readdirSync(dir).sort()).toEqual(['99-demo.json'])
    })

    it('rethrows a PUT failure that is not a 404 instead of falling back to create', async () => {
      // eslint-disable-next-line camelcase
      writeFileSync(join(dir, '8-demo.json'), JSON.stringify({id: 8, settings: {form_title: 'Demo'}}))
      const cmd = new Push([], fakeOclifConfig)
      silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('server error'))
      const post = vi.fn()
      ;(cmd as unknown as PushWithPushForm).wpClient = {post, put}

      await expect(
        // eslint-disable-next-line camelcase
        (cmd as unknown as PushWithPushForm).pushForm(join(dir, '8-demo.json'), {id: 8, settings: {form_title: 'Demo'}}),
      ).rejects.toThrow('server error')

      expect(post).not.toHaveBeenCalled()
    })
  })
})
