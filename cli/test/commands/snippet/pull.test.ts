import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import Pull, {buildMetaFile, buildSnippetFile} from '../../../src/commands/snippet/pull.js'
import {NormalizedSnippet, SnippetType} from '../../../src/utils/snippet-format.js'
import {fakeOclifConfig} from '../../helpers/oclif.js'

type PullWithFindOrphanedFiles = {findOrphanedFiles(path: string, keepIds: Set<number>): Promise<string[]>}

function findOrphanedFiles(path: string, keepIds: Set<number>): Promise<string[]> {
  const cmd = new Pull([], fakeOclifConfig) as unknown as PullWithFindOrphanedFiles
  return cmd.findOrphanedFiles(path, keepIds)
}

const base: NormalizedSnippet = {
  active: false,
  code: '',
  description: '',
  id: 1,
  insertMethod: 'auto',
  location: 'everywhere',
  name: 'My Snippet',
  priority: 10,
  shortcodeAttributes: [],
  tags: [],
  type: 'php',
}

describe('pull helpers', () => {
  describe('findOrphanedFiles', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lps-pull-test-'))
    })

    afterEach(() => {
      rmSync(dir, {force: true, recursive: true})
    })

    it('finds the code file and sidecar of a snippet no longer present remotely', async () => {
      writeFileSync(join(dir, '12-coucou.html'), 'hi')
      writeFileSync(join(dir, '12-coucou.json'), JSON.stringify({id: 12, name: 'coucou'}))

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans.sort()).toEqual(['12-coucou.html', '12-coucou.json'])
    })

    it('keeps files whose id is still in the current remote list', async () => {
      writeFileSync(join(dir, '10-just-demo.php'), '<?php echo 1;')
      writeFileSync(join(dir, '10-just-demo.json'), JSON.stringify({id: 10, name: 'Just demo'}))

      const orphans = await findOrphanedFiles(dir, new Set([10]))

      expect(orphans).toEqual([])
    })

    it('never touches a hand-created file with no numeric id prefix', async () => {
      writeFileSync(join(dir, 'demo.php'), '<?php echo 1;')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('ignores unrelated files in the snippets directory', async () => {
      writeFileSync(join(dir, 'README.md'), '# notes')
      writeFileSync(join(dir, '.DS_Store'), '')

      const orphans = await findOrphanedFiles(dir, new Set())

      expect(orphans).toEqual([])
    })

    it('returns an empty list when the snippets directory does not exist yet', async () => {
      const orphans = await findOrphanedFiles(join(dir, 'does-not-exist'), new Set())

      expect(orphans).toEqual([])
    })
  })

  describe('buildSnippetFile', () => {
    it('prepends <?php when PHP code has no opening tag', () => {
      const snippet = {...base, code: "add_filter('x', 'y');"}
      expect(buildSnippetFile(snippet)).toBe("<?php\n\nadd_filter('x', 'y');")
    })

    it('does not double-add <?php when code already has it', () => {
      const snippet = {...base, code: "<?php\nadd_filter('x', 'y');"}
      expect(buildSnippetFile(snippet)).toBe("<?php\nadd_filter('x', 'y');")
    })

    it('does not add <?php for non-PHP types', () => {
      const snippet: NormalizedSnippet = {...base, type: 'css' as SnippetType, code: 'body { margin: 0; }'}
      expect(buildSnippetFile(snippet)).toBe('body { margin: 0; }')
    })

    it('returns code as-is for js type', () => {
      const snippet: NormalizedSnippet = {...base, type: 'js' as SnippetType, code: 'console.log(1)'}
      expect(buildSnippetFile(snippet)).toBe('console.log(1)')
    })

    it('returns code as-is for html type', () => {
      const snippet: NormalizedSnippet = {...base, type: 'html' as SnippetType, code: '<div>hi</div>'}
      expect(buildSnippetFile(snippet)).toBe('<div>hi</div>')
    })
  })

  describe('buildMetaFile', () => {
    it('includes required fields', () => {
      const meta = JSON.parse(buildMetaFile(base))
      expect(meta.id).toBe(1)
      expect(meta.name).toBe('My Snippet')
      expect(meta.type).toBe('php')
      expect(meta.active).toBe(false)
      expect(meta.location).toBe('everywhere')
    })

    it('omits description when empty', () => {
      const meta = JSON.parse(buildMetaFile({...base, description: ''}))
      expect(meta).not.toHaveProperty('description')
    })

    it('includes description when present', () => {
      const meta = JSON.parse(buildMetaFile({...base, description: 'A description'}))
      expect(meta.description).toBe('A description')
    })

    it('omits tags when empty', () => {
      const meta = JSON.parse(buildMetaFile({...base, tags: []}))
      expect(meta).not.toHaveProperty('tags')
    })

    it('includes tags when present', () => {
      const meta = JSON.parse(buildMetaFile({...base, tags: ['sample', 'dates']}))
      expect(meta.tags).toEqual(['sample', 'dates'])
    })

    it('omits insertMethod when it is the default "auto"', () => {
      const meta = JSON.parse(buildMetaFile({...base, insertMethod: 'auto'}))
      expect(meta).not.toHaveProperty('insertMethod')
    })

    it('includes insertMethod when it is "shortcode"', () => {
      const meta = JSON.parse(buildMetaFile({...base, insertMethod: 'shortcode'}))
      expect(meta.insertMethod).toBe('shortcode')
    })

    it('omits priority when it is the default 10', () => {
      const meta = JSON.parse(buildMetaFile({...base, priority: 10}))
      expect(meta).not.toHaveProperty('priority')
    })

    it('includes priority when it differs from the default', () => {
      const meta = JSON.parse(buildMetaFile({...base, priority: 20}))
      expect(meta.priority).toBe(20)
    })

    it('omits shortcodeAttributes when empty', () => {
      const meta = JSON.parse(buildMetaFile({...base, shortcodeAttributes: []}))
      expect(meta).not.toHaveProperty('shortcodeAttributes')
    })

    it('includes shortcodeAttributes when present', () => {
      const meta = JSON.parse(buildMetaFile({...base, shortcodeAttributes: ['color', 'size']}))
      expect(meta.shortcodeAttributes).toEqual(['color', 'size'])
    })

    it('produces valid JSON ending with a newline', () => {
      const output = buildMetaFile(base)
      expect(() => JSON.parse(output)).not.toThrow()
      expect(output.endsWith('\n')).toBe(true)
    })
  })
})
