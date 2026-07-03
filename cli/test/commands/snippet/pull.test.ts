import {describe, expect, it} from 'vitest'

import {buildMetaFile, buildSnippetFile} from '../../../src/commands/snippet/pull.js'
import {NormalizedSnippet, SnippetType} from '../../../src/utils/snippet-plugin.js'

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
