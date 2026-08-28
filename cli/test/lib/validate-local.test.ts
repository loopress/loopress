import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {configManager} from '../../src/config/project-config.manager.js'
import {validateLocal} from '../../src/lib/validate-local.js'

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
    write('pages/2-home.html', '<p>hi</p>')
    write('pages/2-home.json', JSON.stringify({title: 'Home'}))
    write('forms/5-contact.json', JSON.stringify({id: 5, title: 'Contact'}))
    write('snippets/7-x.php', '<?php echo 1;')
    write('snippets/7-x.json', JSON.stringify({id: 7, type: 'php'}))
    write('api/ping.php', '<?php\ndeclare(strict_types=1);')

    const result = await validateLocal(dir)

    expect(result).toMatchObject({valid: true, problems: []})
    expect(result.checked).toBeGreaterThan(0)
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

  it('flags a snippet sidecar with an unknown type and a non-integer id', async () => {
    write('snippets/7-x.php', '<?php')
    write('snippets/7-x.json', JSON.stringify({id: 'nope', type: 'ruby'}))

    const result = await validateLocal(dir)

    const messages = result.problems.map((p) => p.message)
    expect(messages).toContain('"type": "ruby" is not one of css, html, js, php, text')
    expect(messages).toContain('"id" must be an integer')
  })

  it('flags an empty API route file', async () => {
    write('api/ping.php', '   \n')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: join(dir, 'api', 'ping.php'), message: 'API route file is empty'}),
    ])
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

  it('honours a rootDir override when resolving resource directories', async () => {
    write('loopress.json', JSON.stringify({rootDir: 'wp'}))
    write('wp/forms/5-contact.json', '{ not json')

    const result = await validateLocal(dir)

    expect(result.problems).toEqual([
      expect.objectContaining({file: join(dir, 'wp', 'forms', '5-contact.json')}),
    ])
  })
})
