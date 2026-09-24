import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {validateLocal} from '../../src/lib/validate-local.js'
import {makeEnv} from '../helpers/project-fixtures.js'

let dir: string

function write(relPath: string, content: string): void {
  const full = join(dir, relPath)
  mkdirSync(join(full, '..'), {recursive: true})
  writeFileSync(full, content)
}

describe('validateLocal', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-validate-'))
    vi.restoreAllMocks()
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('reports no problems for an empty project', async () => {
    const result = await validateLocal(dir)

    expect(result.valid).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('passes a well formed tree', async () => {
    write('composer.json', JSON.stringify({require: {php: '^8.1'}}))
    write('acf/group_1.json', JSON.stringify({key: 'group_1'}))
    write('forms/5-contact.json', JSON.stringify({id: 5, title: 'Contact'}))
    write('seo/settings.json', JSON.stringify({titleSep: '-'}))
    write('snippets/7-x.php', '<?php echo 1;')
    write('snippets/7-x.json', JSON.stringify({id: 7, type: 'php'}))
    write('api/ping.php', '<?php\ndeclare(strict_types=1);')
    write('hooks/cleanup.php', '<?php do_action("x");')

    const result = await validateLocal(dir)

    expect(result).toMatchObject({valid: true, problems: []})
    // One check per: loopress.json, composer.json, acf, form, seo (1 each), snippets (code +
    // sidecar = 2), api, hooks. Exact count, not just >0, so a miscounted resource is caught.
    expect(result.checked).toBe(9)
  })

  it('checks JSON files nested in resource subdirectories (acf/<type>/, seo/post-meta/<type>/, seo/redirects/)', async () => {
    write('acf/field-groups/group_1.json', '{not json')
    write('seo/post-meta/page/about.json', '[]')
    write('seo/redirects/3-old.json', JSON.stringify({id: 3}))

    const result = await validateLocal(dir)

    expect(result.checked).toBe(4)
    expect(result.problems).toEqual([
      {file: join(dir, 'acf', 'field-groups', 'group_1.json'), message: expect.stringContaining('not valid JSON')},
      {file: join(dir, 'seo', 'post-meta', 'page', 'about.json'), message: 'expected a JSON object'},
    ])
  })

  it('checks tracked option files have a name, an autoload and a value', async () => {
    write('options/blogname.json', JSON.stringify({autoload: 'on', name: 'blogname', value: 'Acme'}))
    write('options/broken.json', JSON.stringify({autoload: 'on', name: 'broken'}))
    write('theme/twentytwentyfive.json', '"not an object"')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      {file: join(dir, 'theme', 'twentytwentyfive.json'), message: 'expected a JSON object'},
      {file: join(dir, 'options', 'broken.json'), message: 'missing a "value" field'},
    ])
  })

  it('ignores stray non-.json files in resource dirs and non-.php files in api/hooks', async () => {
    write('acf/notes.txt', 'not json, not counted')
    write('acf/group_1.json', JSON.stringify({key: 'group_1'}))
    write('api/README.md', 'notes, not a route file')
    write('api/ping.php', '<?php echo 1;')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([])
    expect(result.checked).toBe(3) // loopress.json + acf/group_1.json + api/ping.php
  })

  it('flags a resource JSON file that is not valid JSON', async () => {
    write('forms/5-contact.json', '{ not json')

    const result = await validateLocal(dir)

    expect(result.valid).toBe(false)
    expect(result.problems).toEqual([
      expect.objectContaining({file: join(dir, 'forms', '5-contact.json'), message: expect.stringContaining('not valid JSON')}),
    ])
  })

  it('flags a resource JSON file that is not an object', async () => {
    write('acf/field-groups.json', '[1, 2, 3]')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: join(dir, 'acf', 'field-groups.json'), message: 'expected a JSON object'}),
    ])
  })

  it('flags a resource JSON file that is null or a scalar, not just an array', async () => {
    write('acf/a.json', 'null')
    write('forms/b.json', '"just a string"')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({file: join(dir, 'acf', 'a.json'), message: 'expected a JSON object'}),
        expect.objectContaining({file: join(dir, 'forms', 'b.json'), message: 'expected a JSON object'}),
      ]),
    )
    expect(result.problems).toHaveLength(2)
  })

  it('flags a snippet sidecar with an unknown type and a non-integer id', async () => {
    write('snippets/7-x.php', '<?php')
    write('snippets/7-x.json', JSON.stringify({id: 'nope', type: 'ruby'}))

    const result = await validateLocal(dir)

    const messages = result.problems.map((p) => p.message)
    expect(messages).toContain('"type": "ruby" is not one of css, html, js, php, text')
    expect(messages).toContain('"id" must be an integer')
  })

  it('accepts a snippet sidecar with no type or id fields (both are optional)', async () => {
    write('snippets/8-y.php', '<?php echo 1;')
    write('snippets/8-y.json', JSON.stringify({name: 'Y'}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([])
  })

  it('surfaces a load-time skip warning and flags an unparseable snippet sidecar', async () => {
    write('snippets/9-z.php', '<?php echo 1;')
    write('snippets/9-z.json', '{ bad json')

    const result = await validateLocal(dir)

    const messages = result.problems.map((p) => p.message)
    expect(messages).toContain('not valid JSON')
    expect(messages.some((message) => message.includes('Skipping') && message.includes('9-z.json'))).toBe(true)
  })

  it('flags an empty API route file', async () => {
    write('api/ping.php', '   \n')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: join(dir, 'api', 'ping.php'), message: 'API route file is empty'}),
    ])
  })

  // Regression: checkPhpDir() used to scan only direct entries, silently skipping a nested
  // path-param route file (invoice-pdf/[order_id].php) or hook file (content/filters.php).
  it('flags an empty nested API route file', async () => {
    write('api/invoice-pdf/[order_id].php', '   \n')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({
        file: join(dir, 'api', 'invoice-pdf', '[order_id].php'),
        message: 'API route file is empty',
      }),
    ])
  })

  it('flags an empty hook file, top-level and nested', async () => {
    write('hooks/cleanup.php', '')
    write('hooks/content/filters.php', '   \n')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({file: join(dir, 'hooks', 'cleanup.php'), message: 'Hook file is empty'}),
        expect.objectContaining({file: join(dir, 'hooks', 'content', 'filters.php'), message: 'Hook file is empty'}),
      ]),
    )
  })

  it('flags loopress.json that is not valid JSON', async () => {
    write('loopress.json', '{ oops')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'loopress.json', message: expect.stringContaining('not valid JSON')}),
    ])
  })

  it('flags a projectId that is not a configured project', async () => {
    write('loopress.json', JSON.stringify({projectId: 'ghost'}))
    vi.spyOn(configManager, 'getProject').mockReturnValue(null)

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'loopress.json', message: expect.stringContaining('not a configured project')}),
    ])
  })

  it('flags a configured project that has no environments', async () => {
    write('loopress.json', JSON.stringify({projectId: 'acme'}))
    vi.spyOn(configManager, 'getProject').mockReturnValue({addedAt: '2024-01-01', environments: {}, name: 'acme'})

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'loopress.json', message: 'project "acme" has no environments configured'}),
    ])
  })

  it('accepts a configured project that has environments', async () => {
    write('loopress.json', JSON.stringify({projectId: 'acme'}))
    vi.spyOn(configManager, 'getProject').mockReturnValue({
      addedAt: '2024-01-01',
      environments: {production: makeEnv('production')},
      name: 'acme',
    })

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([])
  })

  it('accepts a valid plugins object', async () => {
    write('loopress.json', JSON.stringify({plugins: {akismet: '5.3.3'}}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([])
  })

  it('flags plugins when it is null or not an object', async () => {
    write('loopress.json', JSON.stringify({plugins: null}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'loopress.json', message: '"plugins" must be an object of slug -> version string'}),
    ])
  })

  it('flags plugins when it is a scalar', async () => {
    write('loopress.json', JSON.stringify({plugins: 'akismet'}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'loopress.json', message: '"plugins" must be an object of slug -> version string'}),
    ])
  })

  it('flags a non-string value in the plugins map', async () => {
    write('loopress.json', JSON.stringify({plugins: {woocommerce: 'latest', 'contact-form-7': 5}}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'loopress.json', message: 'plugin "contact-form-7" must map to a string'}),
    ])
  })

  it('flags composer.json whose require section is not an object', async () => {
    write('composer.json', JSON.stringify({require: ['a/b']}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'composer.json', message: '"require" must be an object'}),
    ])
  })

  it('flags composer.json require/require-dev when null or a scalar, not just an array', async () => {
    write('composer.json', JSON.stringify({require: null, 'require-dev': 'nope'}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'composer.json', message: '"require" must be an object'}),
      expect.objectContaining({file: 'composer.json', message: '"require-dev" must be an object'}),
    ])
  })

  it('accepts composer.json with valid require/require-dev objects', async () => {
    write('composer.json', JSON.stringify({require: {php: '^8.1'}, 'require-dev': {}}))

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([])
  })

  it('flags composer.json that is not valid JSON', async () => {
    write('composer.json', '{ not json')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: 'composer.json', message: expect.stringContaining('not valid JSON')}),
    ])
  })

  it('honours a rootDir override when resolving resource directories', async () => {
    write('loopress.json', JSON.stringify({rootDir: 'wp'}))
    write('wp/forms/5-contact.json', '{ not json')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: join(dir, 'wp', 'forms', '5-contact.json')}),
    ])
  })

  it('honours a per-resource directory override (formDir)', async () => {
    write('loopress.json', JSON.stringify({formDir: 'custom-forms'}))
    write('custom-forms/5-contact.json', '{ not json')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: join(dir, 'custom-forms', '5-contact.json')}),
    ])
  })

  it('propagates a non-ENOENT error reading loopress.json', async () => {
    mkdirSync(join(dir, 'loopress.json'))

    await expect(validateLocal(dir)).rejects.toThrow()
  })
})
