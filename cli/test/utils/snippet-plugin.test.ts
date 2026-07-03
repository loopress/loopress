import {describe, expect, it} from 'vitest'

import {getSnippetPlugin, SnippetPayloadInput} from '../../src/utils/snippet-plugin.js'

function payloadInput(overrides: Partial<SnippetPayloadInput> = {}): SnippetPayloadInput {
  return {
    active: true,
    code: '',
    insertMethod: 'auto',
    location: 'everywhere',
    name: 'My snippet',
    path: 'snippets/1-my-snippet.php',
    priority: 10,
    shortcodeAttributes: [],
    tags: [],
    type: 'php',
    ...overrides,
  }
}

describe('CodeSnippetsPlugin', () => {
  const plugin = getSnippetPlugin('code-snippets')

  describe('endpointPath', () => {
    it('builds the correct wp-json path', () => {
      expect(plugin.endpointPath()).toBe('code-snippets/v1/snippets')
    })
  })

  describe('toPayload', () => {
    it('strips <?php and trailing whitespace from code before sending', () => {
      const payload = plugin.toPayload(payloadInput({code: '<?php\n\nadd_filter("x", "y");'}))
      expect(payload.code).toBe('add_filter("x", "y");')
    })

    it('strips <?php case-insensitively', () => {
      const payload = plugin.toPayload(payloadInput({code: '<?PHP echo 1;'}))
      expect(payload.code).toBe('echo 1;')
    })

    it('leaves code unchanged when there is no <?php', () => {
      const payload = plugin.toPayload(payloadInput({code: 'add_filter("x", "y");'}))
      expect(payload.code).toBe('add_filter("x", "y");')
    })

    it('sets name from argument', () => {
      const payload = plugin.toPayload(payloadInput({name: 'My snippet'}))
      expect(payload.name).toBe('My snippet')
    })

    it('sends the active argument as-is', () => {
      expect(plugin.toPayload(payloadInput({active: true})).active).toBe(true)
      expect(plugin.toPayload(payloadInput({active: false})).active).toBe(false)
    })

    it('sends the priority argument as-is', () => {
      expect(plugin.toPayload(payloadInput({priority: 20})).priority).toBe(20)
    })

    it('sends the tags from the sidecar as-is, without adding a default tag', () => {
      expect(plugin.toPayload(payloadInput({tags: ['foo', 'bar']})).tags).toEqual(['foo', 'bar'])
      expect(plugin.toPayload(payloadInput({tags: []})).tags).toEqual([])
    })

    // Code Snippets has no independent "type" field: the type is baked into `scope`
    // (see WPCode_Snippet::get_type_from_scope() upstream). `type` is never sent.
    it('does not send a "type" key at all', () => {
      expect(plugin.toPayload(payloadInput())).not.toHaveProperty('type')
    })

    it.each([
      ['php', 'everywhere', 'global'],
      ['php', 'frontend', 'front-end'],
      ['php', 'admin', 'admin'],
      ['php', 'once', 'single-use'],
      ['css', 'frontend', 'site-css'],
      ['css', 'admin', 'admin-css'],
      ['js', 'header', 'site-head-js'],
      ['js', 'footer', 'site-footer-js'],
      ['html', 'header', 'head-content'],
      ['html', 'footer', 'footer-content'],
      ['html', 'everywhere', 'content'],
    ] as const)('computes scope "%s" from type "%s" and location "%s"', (type, location, scope) => {
      expect(plugin.toPayload(payloadInput({location, type})).scope).toBe(scope)
    })

    it.each([
      ['php', 'header'],
      ['php', 'body'],
      ['css', 'everywhere'],
      ['css', 'once'],
      ['js', 'admin'],
      ['js', 'everywhere'],
      ['html', 'admin'],
      ['html', 'once'],
    ] as const)('throws for the unsupported "%s"/"%s" type/location combination', (type, location) => {
      expect(() => plugin.toPayload(payloadInput({location, type}))).toThrow()
    })

    it('throws for the "text" type, which Code Snippets does not support', () => {
      expect(() => plugin.toPayload(payloadInput({type: 'text'}))).toThrow()
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
        priority: 15,
        scope: 'global',
        tags: ['foo', 'bar'],
      })

      expect(result.id).toBe(1)
      expect(result.name).toBe('My Snippet')
      expect(result.description).toBe('A description')
      expect(result.code).toBe('<?php echo "hello";')
      expect(result.tags).toEqual(['foo', 'bar'])
      expect(result.active).toBe(true)
      expect(result.type).toBe('php')
      expect(result.location).toBe('everywhere')
      expect(result.priority).toBe(15)
      expect(result.insertMethod).toBe('auto')
      expect(result.shortcodeAttributes).toEqual([])
    })

    it('handles missing optional fields gracefully', () => {
      const result = plugin.fromRemote({code: '', name: 'x'})
      expect(result.description).toBe('')
      expect(result.tags).toEqual([])
      expect(result.active).toBe(false)
      expect(result.priority).toBe(10)
    })

    // type/location derivation from scope

    it.each([
      ['global', 'php', 'everywhere'],
      ['admin', 'php', 'admin'],
      ['front-end', 'php', 'frontend'],
      ['single-use', 'php', 'once'],
      ['site-css', 'css', 'frontend'],
      ['admin-css', 'css', 'admin'],
      ['site-head-js', 'js', 'header'],
      ['site-footer-js', 'js', 'footer'],
      ['head-content', 'html', 'header'],
      ['footer-content', 'html', 'footer'],
      ['content', 'html', 'everywhere'],
    ] as const)('derives type "%s" -> "%s" and location "%s" from scope', (scope, type, location) => {
      const result = plugin.fromRemote({code: '', name: 'x', scope})
      expect(result.type).toBe(type)
      expect(result.location).toBe(location)
    })

    it('defaults to the "global" scope (php/everywhere) when scope is missing', () => {
      const result = plugin.fromRemote({code: '', name: 'x'})
      expect(result.type).toBe('php')
      expect(result.location).toBe('everywhere')
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
      const payload = plugin.toPayload(payloadInput({code: '<?php echo 1;', name: 'My snippet'}))
      expect(payload.title).toBe('My snippet')
    })

    it('strips <?php and trailing whitespace from code before sending', () => {
      const payload = plugin.toPayload(payloadInput({code: '<?php\n\nadd_filter("x", "y");'}))
      expect(payload.code).toBe('add_filter("x", "y");')
    })

    it('strips <?php case-insensitively', () => {
      const payload = plugin.toPayload(payloadInput({code: '<?PHP echo 1;'}))
      expect(payload.code).toBe('echo 1;')
    })

    it('leaves code unchanged when there is no <?php', () => {
      const payload = plugin.toPayload(payloadInput({code: 'add_filter("x", "y");'}))
      expect(payload.code).toBe('add_filter("x", "y");')
    })

    it('sends the type argument as-is, instead of hardcoding "php"', () => {
      const payload = plugin.toPayload(payloadInput({code: 'Just a message', type: 'text'}))
      expect(payload.type).toBe('text')
    })

    it('sends the active argument as-is', () => {
      expect(plugin.toPayload(payloadInput({active: true})).active).toBe(true)
      expect(plugin.toPayload(payloadInput({active: false})).active).toBe(false)
    })

    it('sends the priority argument as-is', () => {
      expect(plugin.toPayload(payloadInput({priority: 20})).priority).toBe(20)
    })

    it('sends the tags from the sidecar as-is, without adding a default tag', () => {
      expect(plugin.toPayload(payloadInput({tags: ['foo', 'bar']})).tags).toEqual(['foo', 'bar'])
      expect(plugin.toPayload(payloadInput({tags: []})).tags).toEqual([])
    })

    it.each([
      ['php', 'everywhere', 'everywhere'],
      ['php', 'frontend', 'frontend_only'],
      ['php', 'admin', 'admin_only'],
      ['php', 'once', 'on_demand'],
      ['php', 'header', 'site_wide_header'],
      ['php', 'body', 'site_wide_body'],
      ['php', 'footer', 'site_wide_footer'],
      ['css', 'header', 'site_wide_header'],
      ['css', 'body', 'site_wide_body'],
      ['css', 'footer', 'site_wide_footer'],
      ['js', 'footer', 'site_wide_footer'],
      ['html', 'header', 'site_wide_header'],
    ] as const)('maps location "%s" to the WPCode taxonomy term "%s" for %s snippets', (type, location, term) => {
      const payload = plugin.toPayload(payloadInput({insertMethod: 'auto', location, type}))
      expect(payload.location).toBe(term)
    })

    it.each([
      ['css', 'everywhere'],
      ['css', 'admin'],
      ['css', 'once'],
      ['js', 'admin'],
      ['html', 'frontend'],
    ] as const)('throws when "%s" snippets use the PHP-only "%s" location', (type, location) => {
      expect(() => plugin.toPayload(payloadInput({insertMethod: 'auto', location, type}))).toThrow()
    })

    it('omits the location when using the shortcode insert method', () => {
      const payload = plugin.toPayload(payloadInput({insertMethod: 'shortcode', location: 'everywhere'}))
      expect(payload).not.toHaveProperty('location')
      expect(payload.insert_method).toBe('shortcode')
    })

    it('sends shortcode attributes only in shortcode insert method', () => {
      const shortcodePayload = plugin.toPayload(
        payloadInput({insertMethod: 'shortcode', shortcodeAttributes: ['color', 'size']}),
      )
      expect(shortcodePayload.shortcode_attributes).toEqual(['color', 'size'])

      const autoPayload = plugin.toPayload(payloadInput({insertMethod: 'auto', shortcodeAttributes: ['color']}))
      expect(autoPayload).not.toHaveProperty('shortcode_attributes')
    })
  })

  describe('fromRemote', () => {
    it('maps all fields from the API response', () => {
      const result = plugin.fromRemote({
        active: false,
        code: '<?php echo "wpcode";',
        id: 2,
        'insert_method': 'auto',
        location: 'site_wide_footer',
        note: 'A note',
        priority: 5,
        'shortcode_attributes': ['color'],
        tags: ['baz'],
        title: 'WPCode Snippet',
        type: 'js',
      })

      expect(result.id).toBe(2)
      expect(result.name).toBe('WPCode Snippet')
      expect(result.description).toBe('A note')
      expect(result.active).toBe(false)
      expect(result.type).toBe('js')
      expect(result.location).toBe('footer')
      expect(result.priority).toBe(5)
      expect(result.insertMethod).toBe('auto')
      expect(result.shortcodeAttributes).toEqual(['color'])
    })

    it('uses the API type when valid', () => {
      const result = plugin.fromRemote({code: '', title: 'x', type: 'html'})
      expect(result.type).toBe('html')
    })

    it('falls back to content detection when API type is unrecognized', () => {
      const result = plugin.fromRemote({code: '<!-- html -->', title: 'x', type: 'unknown'})
      expect(result.type).toBe('html')
    })

    it('reports insert method "shortcode" only when explicitly set, otherwise "auto"', () => {
      expect(plugin.fromRemote({code: '', 'insert_method': 'shortcode', title: 'x'}).insertMethod).toBe('shortcode')
      expect(plugin.fromRemote({code: '', 'insert_method': 'auto', title: 'x'}).insertMethod).toBe('auto')
      expect(plugin.fromRemote({code: '', title: 'x'}).insertMethod).toBe('auto')
    })

    it.each([
      ['everywhere', 'everywhere'],
      ['frontend_only', 'frontend'],
      ['admin_only', 'admin'],
      ['on_demand', 'once'],
      ['site_wide_header', 'header'],
      ['site_wide_body', 'body'],
      ['site_wide_footer', 'footer'],
    ] as const)('maps the WPCode taxonomy term "%s" back to the canonical location "%s"', (term, location) => {
      const result = plugin.fromRemote({code: '', location: term, title: 'x', type: 'php'})
      expect(result.location).toBe(location)
    })

    it('falls back to the type default location when the stored location is unrecognized', () => {
      const result = plugin.fromRemote({code: '', location: 'before_post', title: 'x', type: 'css'})
      expect(result.location).toBe('header')
    })

    it('defaults priority to 10 when missing', () => {
      expect(plugin.fromRemote({code: '', title: 'x'}).priority).toBe(10)
    })

    it('defaults shortcode attributes to an empty array when missing', () => {
      expect(plugin.fromRemote({code: '', title: 'x'}).shortcodeAttributes).toEqual([])
    })
  })
})
