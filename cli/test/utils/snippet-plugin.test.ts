import {expect} from 'chai'

import {getSnippetPlugin} from '../../src/utils/snippet-plugin.js'

describe('snippet-plugin', () => {
  describe('CodeSnippetsPlugin', () => {
    const plugin = getSnippetPlugin('code-snippets')

    describe('endpoint', () => {
      it('builds the correct URL', () => {
        expect(plugin.endpoint('https://example.com')).to.equal('https://example.com/wp-json/code-snippets/v1/snippets')
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

        expect(result.id).to.equal(1)
        expect(result.name).to.equal('My Snippet')
        expect(result.description).to.equal('A description')
        expect(result.code).to.equal('<?php echo "hello";')
        expect(result.tags).to.deep.equal(['foo', 'bar'])
        expect(result.active).to.be.true
        expect(result.type).to.equal('php')
      })

      it('handles missing optional fields gracefully', () => {
        const result = plugin.fromRemote({code: '', name: 'x'})
        expect(result.description).to.equal('')
        expect(result.tags).to.deep.equal([])
        expect(result.active).to.be.false
      })

      // ── type resolution ───────────────────────────────────────────────────────

      it('uses the API type when valid', () => {
        const result = plugin.fromRemote({code: '', name: 'x', type: 'css'})
        expect(result.type).to.equal('css')
      })

      it('infers php when code starts with <?', () => {
        const result = plugin.fromRemote({code: '<?php echo 1;', name: 'x'})
        expect(result.type).to.equal('php')
      })

      it('infers html when the first line starts with <', () => {
        const result = plugin.fromRemote({code: '<!-- comment -->\n<div>hi</div>', name: 'x'})
        expect(result.type).to.equal('html')
      })

      it('defaults to php for plain PHP code without an opening tag', () => {
        const result = plugin.fromRemote({code: 'add_filter("the_content", "fn");', name: 'x'})
        expect(result.type).to.equal('php')
      })

      it('does not infer html from XML embedded deeper in PHP code', () => {
        const code = '// init\nadd_filter("f", function() {\n  return \'<rdf:RDF/>\';\n});'
        const result = plugin.fromRemote({code, name: 'x'})
        expect(result.type).to.equal('php')
      })
    })
  })

  describe('WPCodePlugin', () => {
    const plugin = getSnippetPlugin('wpcode')

    describe('endpoint', () => {
      it('builds the correct URL', () => {
        expect(plugin.endpoint('https://example.com')).to.equal(
          'https://example.com/wp-json/loopress/v1/wpcode/snippets',
        )
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

        expect(result.id).to.equal(2)
        expect(result.name).to.equal('WPCode Snippet')
        expect(result.description).to.equal('A note')
        expect(result.active).to.be.false
        expect(result.type).to.equal('js')
      })

      it('uses the API type when valid', () => {
        const result = plugin.fromRemote({code: '', title: 'x', type: 'html'})
        expect(result.type).to.equal('html')
      })

      it('falls back to content detection when API type is unrecognized', () => {
        const result = plugin.fromRemote({code: '<!-- html -->', title: 'x', type: 'unknown'})
        expect(result.type).to.equal('html')
      })
    })
  })
})
