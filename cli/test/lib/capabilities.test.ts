import {describe, expect, it, vi} from 'vitest'

import {activateTheme, getCapabilities, integrationFix, missingIntegration, missingModule} from '../../src/lib/capabilities.js'
import {type WpClient} from '../../src/lib/wp-client.js'
import {makeCapabilities, makeLightCapabilities} from '../helpers/capabilities.js'

function fakeWp(get: () => Promise<unknown>): {get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; wp: WpClient} {
  const fns = {get: vi.fn(get), post: vi.fn(async () => ({active: 'b', changed: true, previous: 'a'}))}
  return {...fns, wp: fns as unknown as WpClient}
}

describe('getCapabilities', () => {
  it('asks the site once per client', async () => {
    const {get, wp} = fakeWp(async () => makeCapabilities())

    await getCapabilities(wp, 'local')
    await getCapabilities(wp, 'local')

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('loopress/v1/capabilities')
  })

  it('asks to update a plugin that predates the endpoint', async () => {
    const {wp} = fakeWp(async () => {
      throw new Error('Endpoint not found (404).', {cause: {response: {statusCode: 404}}})
    })

    await expect(getCapabilities(wp, 'staging')).rejects.toThrow('The Loopress plugin on staging is too old for this CLI. Update it, then try again.')
  })

  it('passes any other failure through', async () => {
    const {wp} = fakeWp(async () => {
      throw new Error('Authentication failed (401).')
    })

    await expect(getCapabilities(wp, 'staging')).rejects.toThrow('Authentication failed (401).')
  })

  it('asks again after a theme activation', async () => {
    const {get, post, wp} = fakeWp(async () => makeCapabilities())
    await getCapabilities(wp, 'local')

    await activateTheme(wp, 'b')
    await getCapabilities(wp, 'local')

    expect(post).toHaveBeenCalledWith('loopress/v1/theme/activate', {stylesheet: 'b'})
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe('missingIntegration', () => {
  it('is undefined when the site has what the resource needs, or the resource needs nothing', () => {
    for (const kind of ['acf', 'form', 'snippets', 'themeStyles', 'cpt'] as const) {
      expect(missingIntegration(kind, makeCapabilities())).toBeUndefined()
    }
  })

  it('names the plugins that would provide a missing integration', () => {
    const none = makeCapabilities({integrations: {acf: false, form: false, snippets: false}})

    expect(missingIntegration('acf', none)).toEqual({plugins: ['advanced-custom-fields'], reason: 'ACF is not active'})
    expect(missingIntegration('form', none)).toEqual({plugins: ['wpforms-lite'], reason: 'no supported form plugin is active'})
    expect(missingIntegration('snippets', none)).toEqual({
      plugins: ['code-snippets', 'insert-headers-and-footers'],
      reason: 'no supported snippet plugin is active',
    })
  })

  it('sends a Light site to Full for snippets and the other Full-only features', () => {
    const light = makeLightCapabilities()
    expect(missingIntegration('snippets', light)).toEqual({fix: 'Install Loopress Full', needsFull: true, reason: 'snippets need Loopress Full'})
    expect(missingIntegration('api', light)?.reason).toBe('API routes need Loopress Full')
    expect(missingIntegration('hooks', light)?.reason).toBe('hooks need Loopress Full')
    expect(missingIntegration('page', light)?.reason).toBe('pages need Loopress Full')
    expect(missingIntegration('pattern', light)?.reason).toBe('block patterns need Loopress Full')
    expect(missingIntegration('template', light)?.reason).toBe('templates and parts need Loopress Full')
    expect(missingIntegration('menu', light)).toBeUndefined()
  })

  it('lets Full through for its own features', () => {
    expect(missingIntegration('api', makeCapabilities())).toBeUndefined()
    expect(missingModule('dependencies', 'plugins', makeCapabilities())).toBeUndefined()
    expect(missingModule('dependencies', 'plugins', makeLightCapabilities())?.needsFull).toBe(true)
  })

  it('refuses Global Styles on a classic theme', () => {
    expect(missingIntegration('themeStyles', makeCapabilities({theme: {active: 'astra', isBlock: false}}))).toEqual({
      reason: 'the active theme "astra" is a classic theme',
    })
  })
})

describe('integrationFix', () => {
  const snippets = {plugins: ['code-snippets', 'insert-headers-and-footers'], reason: 'no supported snippet plugin is active'}

  it('asks to declare the plugin where the project declares its plugins', () => {
    expect(integrationFix(snippets, {fromComposer: true, plugins: ['akismet']})).toBe(
      'Declare code-snippets (or insert-headers-and-footers) (wpackagist-plugin/code-snippets in composer.json), then activate it: `lps plugin push --activate`',
    )
    expect(integrationFix(snippets, {fromComposer: false, plugins: []})).toBe(
      'Declare code-snippets (or insert-headers-and-footers) ("code-snippets" in loopress.json plugins), then activate it: "code-snippets": {"active": true, ...} in loopress.json, then `lps plugin push`',
    )
  })

  it('asks to activate a plugin the project already declares', () => {
    expect(integrationFix(snippets, {fromComposer: true, plugins: ['insert-headers-and-footers']})).toBe(
      'The project declares insert-headers-and-footers, activate it: `lps plugin push --activate`',
    )
  })

  it('gives the fixed remedy, or nothing when there is none', () => {
    expect(integrationFix({fix: 'Install Loopress Full', reason: 'x'}, {fromComposer: true, plugins: []})).toBe('Install Loopress Full')
    expect(integrationFix({reason: 'classic theme'}, {fromComposer: true, plugins: []})).toBeUndefined()
  })
})
