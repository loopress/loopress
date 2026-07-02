import {describe, expect, it} from 'vitest'

import {getSnippetPlugin} from '../../src/utils/snippet-plugin.js'

describe('snippet-plugin', () => {
  describe('CodeSnippetsPlugin', () => {
    const plugin = getSnippetPlugin('code-snippets')

    describe('endpointPath', () => {
      it('builds the correct wp-json path', () => {
        expect(plugin.endpointPath()).toBe('code-snippets/v1/snippets')
      })
    })

    describe('toPayload', () => {
      it('strips <?php and trailing whitespace from code before sending', () => {
        const payload = plugin.toPayload(
          'My snippet',
          '<?php\n\nadd_filter("x", "y");',
          'snippets/1-my-snippet.php',
          'php',
        )
        expect(payload.code).toBe('add_filter("x", "y");')
      })

      it('strips <?php case-insensitively', () => {
        const payload = plugin.toPayload('My snippet', '<?PHP echo 1;', 'snippets/1-my-snippet.php', 'php')
        expect(payload.code).toBe('echo 1;')
      })

      it('leaves code unchanged when there is no <?php', () => {
        const payload = plugin.toPayload('My snippet', 'add_filter("x", "y");', 'snippets/1-my-snippet.php', 'php')
        expect(payload.code).toBe('add_filter("x", "y");')
      })

      it('sets name from argument', () => {
        const payload = plugin.toPayload('My snippet', '', 'snippets/1-my-snippet.php', 'php')
        expect(payload.name).toBe('My snippet')
      })

      it('sends the type argument as-is, without hardcoding it', () => {
        const payload = plugin.toPayload('My snippet', 'Just a message', 'snippets/1-my-snippet.txt', 'text')
        expect(payload.type).toBe('text')
      })
    })

    describe('fromRemote', () => {
      it('maps all fields from the API response', () => {
        const result = plugin.fromRemote({
          active: true,
          code: '<?php echo "hello";',
          desc: 'A description',
          id: 1,
          name: 'My Snippet',
          tags: ['foo', 'bar'],
          type: 'php',
        })

        expect(result.id).toBe(1)
        expect(result.name).toBe('My Snippet')
        expect(result.description).toBe('A description')
        expect(result.code).toBe('<?php echo "hello";')
        expect(result.tags).toEqual(['foo', 'bar'])
        expect(result.active).toBe(true)
        expect(result.type).toBe('php')
      })

      it('handles missing optional fields gracefully', () => {
        const result = plugin.fromRemote({code: '', name: 'x'})
        expect(result.description).toBe('')
        expect(result.tags).toEqual([])
        expect(result.active).toBe(false)
      })

      // type resolution

      it('uses the API type when valid', () => {
        const result = plugin.fromRemote({code: '', name: 'x', type: 'css'})
        expect(result.type).toBe('css')
      })

      it('infers php when code starts with <?', () => {
        const result = plugin.fromRemote({code: '<?php echo 1;', name: 'x'})
        expect(result.type).toBe('php')
      })

      it('infers html when the first line starts with <', () => {
        const result = plugin.fromRemote({code: '<!-- comment -->\n<div>hi</div>', name: 'x'})
        expect(result.type).toBe('html')
      })

      it('defaults to php for plain PHP code without an opening tag', () => {
        const result = plugin.fromRemote({code: 'add_filter("the_content", "fn");', name: 'x'})
        expect(result.type).toBe('php')
      })

      it('does not infer html from XML embedded deeper in PHP code', () => {
        const code = '// init\nadd_filter("f", function() {\n  return \'<rdf:RDF/>\';\n});'
        const result = plugin.fromRemote({code, name: 'x'})
        expect(result.type).toBe('php')
      })
    })
  })

  describe('WPCodePlugin', () => {
    const plugin = getSnippetPlugin('wpcode')

    describe('endpointPath', () => {
      it('builds the correct wp-json path', () => {
        expect(plugin.endpointPath()).toBe('loopress/v1/wpcode/snippets')
      })
    })

    describe('toPayload', () => {
      it('sets title from name argument', () => {
        const payload = plugin.toPayload('My snippet', '<?php echo 1;', 'snippets/1-my-snippet.php', 'php')
        expect(payload.title).toBe('My snippet')
      })

      it('passes code as-is without stripping <?php', () => {
        const code = '<?php echo 1;'
        const payload = plugin.toPayload('x', code, 'snippets/1-x.php', 'php')
        expect(payload.code).toBe(code)
      })

      it('sends the type argument as-is, instead of hardcoding "php"', () => {
        const payload = plugin.toPayload('My snippet', 'Just a message', 'snippets/1-my-snippet.txt', 'text')
        expect(payload.type).toBe('text')
      })
    })

    describe('fromRemote', () => {
      it('maps all fields from the API response', () => {
        const result = plugin.fromRemote({
          active: false,
          code: '<?php echo "wpcode";',
          id: 2,
          note: 'A note',
          tags: ['baz'],
          title: 'WPCode Snippet',
          type: 'js',
        })

        expect(result.id).toBe(2)
        expect(result.name).toBe('WPCode Snippet')
        expect(result.description).toBe('A note')
        expect(result.active).toBe(false)
        expect(result.type).toBe('js')
      })

      it('uses the API type when valid', () => {
        const result = plugin.fromRemote({code: '', title: 'x', type: 'html'})
        expect(result.type).toBe('html')
      })

      it('falls back to content detection when API type is unrecognized', () => {
        const result = plugin.fromRemote({code: '<!-- html -->', title: 'x', type: 'unknown'})
        expect(result.type).toBe('html')
      })
    })
  })
})
