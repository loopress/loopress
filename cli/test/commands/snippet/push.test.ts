import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {rename} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/snippet/push.js'
import {Snippet} from '../../../src/types/snippet.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, rename: vi.fn(actual.rename)}
})

// loadSnippets() and ensureCanonicalFilename() are private; the cast below is the
// same escape hatch used throughout this suite to unit-test command internals
// without going through the full oclif run() lifecycle.
type PushWithLoadSnippets = {loadSnippets(path: string): Promise<Snippet[]>}
type PushWithEnsureCanonicalFilename = {ensureCanonicalFilename(snippet: Snippet, id: number, name: string): Promise<void>}
type PushWithPushSnippet = {
  failedCount: number
  pushSnippet(snippet: Snippet, task?: {output: string}): Promise<void>
  wpClient: {put: ReturnType<typeof vi.fn>}
}

describe('snippet push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-push-test-'))
    vi.mocked(rename).mockClear()
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('loadSnippets type resolution', () => {
    it('uses the type recorded in the sidecar .json meta file', () => {
      writeFileSync(join(dir, '1-hello.txt'), 'Just a message')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, name: 'Hello', type: 'text'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets).toHaveLength(1)
        expect(snippets[0].type).toBe('text')
      })
    })

    it('falls back to the file extension when the meta file has no type', () => {
      writeFileSync(join(dir, '1-hello.txt'), 'Just a message')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, name: 'Hello'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].type).toBe('text')
      })
    })

    it('falls back to the file extension when there is no meta file at all', () => {
      writeFileSync(join(dir, '2-legacy.php'), '<?php echo 1;')

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].type).toBe('php')
      })
    })

    it('falls back to the file extension when the meta type is invalid', () => {
      writeFileSync(join(dir, '3-css.css'), 'body { margin: 0; }')
      writeFileSync(join(dir, '3-css.json'), JSON.stringify({id: 3, name: 'Style', type: 'not-a-real-type'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].type).toBe('css')
      })
    })

    it('never relabels a non-php snippet as php just because it lacks meta', () => {
      writeFileSync(join(dir, '4-note.txt'), 'Thank you for reading!')

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].type).toBe('text')
      })
    })
  })

  describe('loadSnippets active resolution', () => {
    it('uses the active flag recorded in the sidecar .json meta file', () => {
      writeFileSync(join(dir, '1-hello.txt'), 'Just a message')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({active: true, id: 1, name: 'Hello'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].active).toBe(true)
      })
    })

    it('defaults to inactive when the meta file has no active flag', () => {
      writeFileSync(join(dir, '1-hello.txt'), 'Just a message')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, name: 'Hello'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].active).toBe(false)
      })
    })

    it('defaults to inactive when there is no meta file at all', () => {
      writeFileSync(join(dir, '2-legacy.php'), '<?php echo 1;')

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].active).toBe(false)
      })
    })
  })

  describe('loadSnippets tags resolution', () => {
    it('uses the tags recorded in the sidecar .json meta file', () => {
      writeFileSync(join(dir, '1-hello.txt'), 'Just a message')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, name: 'Hello', tags: ['foo', 'bar']}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].tags).toEqual(['foo', 'bar'])
      })
    })

    it('defaults to no tags when the meta file has no tags', () => {
      writeFileSync(join(dir, '1-hello.txt'), 'Just a message')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, name: 'Hello'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].tags).toEqual([])
      })
    })

    it('defaults to no tags when there is no meta file at all', () => {
      writeFileSync(join(dir, '2-legacy.php'), '<?php echo 1;')

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].tags).toEqual([])
      })
    })
  })

  describe('loadSnippets location resolution', () => {
    it('uses the location recorded in the sidecar .json meta file', () => {
      writeFileSync(join(dir, '1-hello.php'), '<?php echo 1;')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, location: 'frontend', name: 'Hello'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].location).toBe('frontend')
      })
    })

    it('defaults to a type-appropriate location when the meta file has no location', () => {
      writeFileSync(join(dir, '1-hello.php'), '<?php echo 1;')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, name: 'Hello'}))
      writeFileSync(join(dir, '2-style.css'), 'body { margin: 0; }')
      writeFileSync(join(dir, '2-style.json'), JSON.stringify({id: 2, name: 'Style'}))

      return loadSnippets(dir).then((snippets) => {
        const byType: Record<string, string> = {}
        for (const snippet of snippets) byType[snippet.type] = snippet.location

        expect(byType.php).toBe('everywhere')
        expect(byType.css).toBe('header')
      })
    })

    it('ignores an invalid location and falls back to the type default', () => {
      writeFileSync(join(dir, '1-hello.php'), '<?php echo 1;')
      writeFileSync(join(dir, '1-hello.json'), JSON.stringify({id: 1, location: 'not-a-real-location', name: 'Hello'}))

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].location).toBe('everywhere')
      })
    })
  })

  describe('loadSnippets insertMethod/priority/shortcodeAttributes resolution', () => {
    it('uses the insertMethod, priority and shortcodeAttributes recorded in the sidecar', () => {
      writeFileSync(join(dir, '1-hello.php'), '<?php echo 1;')
      writeFileSync(
        join(dir, '1-hello.json'),
        JSON.stringify({id: 1, insertMethod: 'shortcode', name: 'Hello', priority: 25, shortcodeAttributes: ['color']}),
      )

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].insertMethod).toBe('shortcode')
        expect(snippets[0].priority).toBe(25)
        expect(snippets[0].shortcodeAttributes).toEqual(['color'])
      })
    })

    it('defaults insertMethod to "auto", priority to 10 and shortcodeAttributes to an empty array', () => {
      writeFileSync(join(dir, '2-legacy.php'), '<?php echo 1;')

      return loadSnippets(dir).then((snippets) => {
        expect(snippets[0].insertMethod).toBe('auto')
        expect(snippets[0].priority).toBe(10)
        expect(snippets[0].shortcodeAttributes).toEqual([])
      })
    })
  })

  describe('loadSnippets error isolation', () => {
    it('skips a snippet with a malformed sidecar .json instead of aborting the whole push', async () => {
      writeFileSync(join(dir, '1-broken.php'), '<?php echo 1;')
      writeFileSync(join(dir, '1-broken.json'), '{ this is not valid json !!')
      writeFileSync(join(dir, '2-fine.php'), '<?php echo 2;')
      writeFileSync(join(dir, '2-fine.json'), JSON.stringify({id: 2, name: 'Fine'}))

      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)

      const snippets = await (cmd as unknown as PushWithLoadSnippets).loadSnippets(dir)

      expect(snippets).toHaveLength(1)
      expect(snippets[0].name).toBe('Fine')
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('1-broken.json'))
    })
  })

  describe('ensureCanonicalFilename', () => {
    it('renames a file with no id/slug in its name (e.g. a hand-created demo.php)', async () => {
      writeFileSync(join(dir, 'demo.php'), '<?php\n\necho "salut";')
      writeFileSync(join(dir, 'demo.json'), JSON.stringify({id: 8}))

      await ensureCanonicalFilename(
        {
          active: false,
          code: '<?php\n\necho "salut";',
          id: 8,
          insertMethod: 'auto',
          location: 'everywhere',
          name: 'demo',
          path: join(dir, 'demo.php'),
          priority: 10,
          shortcodeAttributes: [],
          tags: [],
          type: 'php',
        },
        8,
        'demo',
      )

      const files = readdirSync(dir).sort()
      expect(files).toEqual(['8-demo.json', '8-demo.php'])
      expect(existsSync(join(dir, 'demo.php'))).toBe(false)
      expect(existsSync(join(dir, 'demo.json'))).toBe(false)
      expect(JSON.parse(readFileSync(join(dir, '8-demo.json'), 'utf8'))).toEqual({id: 8, name: 'demo', type: 'php'})
    })

    it('renames a file with no sidecar at all', async () => {
      writeFileSync(join(dir, 'foo.php'), '<?php echo 1;')

      await ensureCanonicalFilename({code: '<?php echo 1;', path: join(dir, 'foo.php'), type: 'php'} as Snippet, 5, 'foo')

      expect(readdirSync(dir).sort()).toEqual(['5-foo.json', '5-foo.php'])
    })

    it('leaves an already-canonical file in place', async () => {
      writeFileSync(join(dir, '6-hello.txt'), 'hi')
      writeFileSync(join(dir, '6-hello.json'), JSON.stringify({id: 6, name: 'hello', type: 'text'}))

      await ensureCanonicalFilename(
        {
          active: false,
          code: 'hi',
          id: 6,
          insertMethod: 'auto',
          location: 'footer',
          name: 'hello',
          path: join(dir, '6-hello.txt'),
          priority: 10,
          shortcodeAttributes: [],
          tags: [],
          type: 'text',
        },
        6,
        'hello',
      )

      expect(readdirSync(dir).sort()).toEqual(['6-hello.json', '6-hello.txt'])
    })

    it('slugifies a name with spaces and punctuation for the new filename', async () => {
      writeFileSync(join(dir, 'weird name.php'), '<?php echo 1;')

      await ensureCanonicalFilename(
        {code: '<?php echo 1;', path: join(dir, 'weird name.php'), type: 'php'} as Snippet,
        9,
        'Weird Name!',
      )

      expect(readdirSync(dir).sort()).toEqual(['9-weird-name.json', '9-weird-name.php'])
    })

    it('persists the id under the current filename before attempting the rename, so a failed rename does not lose it', async () => {
      writeFileSync(join(dir, 'demo.php'), '<?php echo 1;')

      vi.mocked(rename).mockRejectedValueOnce(new Error('EPERM'))

      await expect(ensureCanonicalFilename({code: '<?php echo 1;', path: join(dir, 'demo.php'), type: 'php'} as Snippet, 8, 'demo')).rejects.toThrow(
        'EPERM',
      )

      // The source file was never renamed (rename failed), but its sidecar already carries
      // the id: a retry of `snippet push` will read demo.php + demo.json and see the id,
      // so it PUTs an update instead of POSTing a duplicate create.
      expect(existsSync(join(dir, 'demo.php'))).toBe(true)
      expect(JSON.parse(readFileSync(join(dir, 'demo.json'), 'utf8'))).toEqual({id: 8, name: 'demo', type: 'php'})
    })
  })

  describe('pushSnippet', () => {
    const snippet = {
      active: false,
      code: '<?php echo 1;',
      id: 8,
      insertMethod: 'auto',
      location: 'everywhere',
      name: 'demo',
      path: join('/tmp', 'demo.php'),
      priority: 10,
      shortcodeAttributes: [],
      tags: [],
      type: 'php',
    } as Snippet

    it('routes the failure message through task.output instead of warn, and rethrows so Listr marks the task failed', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushSnippet).wpClient = {put}
      const task = {output: ''}

      await expect((cmd as unknown as PushWithPushSnippet).pushSnippet(snippet, task)).rejects.toThrow('boom')

      expect(task.output).toBe('Failed to push demo: boom')
      expect(logs.warn).not.toHaveBeenCalled()
      expect((cmd as unknown as PushWithPushSnippet).failedCount).toBe(1)
    })

    it('falls back to warn when called without a task (e.g. directly in tests)', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const logs = silenceLogs(cmd)
      const put = vi.fn().mockRejectedValueOnce(new Error('boom'))
      ;(cmd as unknown as PushWithPushSnippet).wpClient = {put}

      await expect((cmd as unknown as PushWithPushSnippet).pushSnippet(snippet)).rejects.toThrow('boom')

      expect(logs.warn).toHaveBeenCalledWith('  Failed to push demo: boom')
      expect((cmd as unknown as PushWithPushSnippet).failedCount).toBe(1)
    })
  })
})

function ensureCanonicalFilename(snippet: Snippet, id: number, name: string): Promise<void> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithEnsureCanonicalFilename).ensureCanonicalFilename(snippet, id, name)
}

function loadSnippets(path: string): Promise<Snippet[]> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithLoadSnippets).loadSnippets(path)
}
