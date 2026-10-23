import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Diff from '../../../../src/commands/theme/template/diff.js'
import {fakeOclifConfig, silenceLogs} from '../../../helpers/oclif.js'
import {makeEnv} from '../../../helpers/project-fixtures.js'

class TestDiff extends Diff {
  setup(rootDir: string) {
    this.siteConfig = makeEnv('staging', 'https://staging.acme.com')
    this.projectId = 'id-acme'
    this.localConfig = {rootDir}
  }
}

describe('theme template diff', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-template-diff-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
    process.exitCode = undefined
  })

  it('compares templates and parts against the child theme, a Site Editor edit included', async () => {
    mkdirSync(join(dir, 'theme', 'templates'), {recursive: true})
    mkdirSync(join(dir, 'theme', 'parts'), {recursive: true})
    writeFileSync(join(dir, 'theme', 'templates', 'single.html'), '<p/>')
    writeFileSync(join(dir, 'theme', 'parts', 'header.html'), '<p/>')
    const cmd = new TestDiff(['--json'], fakeOclifConfig)
    cmd.setup(dir)
    silenceLogs(cmd)
    const get = vi.fn().mockResolvedValue({
      customized: ['parts/header'],
      parts: [{area: 'header', html: '<p/>', slug: 'header', title: 'Header'}],
      templates: [{html: '<p/>', slug: 'single'}],
    })
    ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}

    const result = await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/child-theme')
    expect(Object.keys(result.resources)).toEqual(['template', 'part'])
    expect(result.resources.template).toEqual({added: [], changed: [], removed: []})
    expect(result.resources.part.changed.map((change) => change.id)).toEqual(['header'])
    expect(result.drift).toBe(true)
  })
})
