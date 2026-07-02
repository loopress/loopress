import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import Push from '../../../src/commands/snippet/push.js'
import {Snippet} from '../../../src/types/snippet.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

// loadSnippets() and ensureCanonicalFilename() are private; the cast below is the
// same escape hatch used throughout this suite to unit-test command internals
// without going through the full oclif run() lifecycle.
type PushWithLoadSnippets = {loadSnippets(path: string): Promise<Snippet[]>}
type PushWithEnsureCanonicalFilename = {ensureCanonicalFilename(snippet: Snippet, id: number, name: string): Promise<void>}

describe('snippet push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-push-test-'))
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

  describe('ensureCanonicalFilename', () => {
    it('renames a file with no id/slug in its name (e.g. a hand-created demo.php)', async () => {
      writeFileSync(join(dir, 'demo.php'), '<?php\n\necho "salut";')
      writeFileSync(join(dir, 'demo.json'), JSON.stringify({id: 8}))

      await ensureCanonicalFilename(
        {code: '<?php\n\necho "salut";', id: 8, name: 'demo', path: join(dir, 'demo.php'), type: 'php'},
        8,
        'demo',
      )

      const files = readdirSync(dir).sort()
      expect(files).toEqual(['8-demo.json', '8-demo.php'])
      expect(existsSync(join(dir, 'demo.php'))).toBe(false)
      expect(existsSync(join(dir, 'demo.json'))).toBe(false)
      expect(JSON.parse(readFileSync(join(dir, '8-demo.json'), 'utf8'))).toEqual({id: 8, name: 'demo'})
    })

    it('renames a file with no sidecar at all', async () => {
      writeFileSync(join(dir, 'foo.php'), '<?php echo 1;')

      await ensureCanonicalFilename({code: '<?php echo 1;', path: join(dir, 'foo.php'), type: 'php'} as Snippet, 5, 'foo')

      expect(readdirSync(dir).sort()).toEqual(['5-foo.json', '5-foo.php'])
    })

    it('leaves an already-canonical file in place', async () => {
      writeFileSync(join(dir, '6-hello.txt'), 'hi')
      writeFileSync(join(dir, '6-hello.json'), JSON.stringify({id: 6, name: 'hello', type: 'text'}))

      await ensureCanonicalFilename({code: 'hi', id: 6, name: 'hello', path: join(dir, '6-hello.txt'), type: 'text'}, 6, 'hello')

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
  })
})

function ensureCanonicalFilename(snippet: Snippet, id: number, name: string): Promise<void> {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return (cmd as unknown as PushWithEnsureCanonicalFilename).ensureCanonicalFilename(snippet, id, name)
}

function loadSnippets(path: string): Promise<Snippet[]> {
  const cmd = new Push([], fakeOclifConfig) as unknown as PushWithLoadSnippets
  return cmd.loadSnippets(path)
}
