import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/template/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PushInternals = {
  dryRun: boolean
  failedCount: number
  localConfig: {rootDir?: string; templateDir?: string}
  parse: () => Promise<{args: {slug?: string}}>
  recordSuccess: () => Promise<void>
  run(): Promise<unknown>
  siteConfig: unknown
  wpClient: {put: ReturnType<typeof vi.fn>}
}

describe('template push', () => {
  let dir: string

  function makeCommand(put = vi.fn(), slug?: string): PushInternals {
    const cmd = new Push([], fakeOclifConfig)
    silenceLogs(cmd)
    const internals = cmd as unknown as PushInternals
    internals.wpClient = {put}
    internals.siteConfig = makeEnv('local')
    internals.recordSuccess = async () => {}
    internals.localConfig = {rootDir: dir, templateDir: '.'}
    internals.parse = async () => ({args: {slug}})
    return internals
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-template-push-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('PUTs slug, title and markup to loopress/v1/templates', async () => {
    writeFileSync(join(dir, 'landing.html'), '<!-- title: Landing page -->\n<!-- wp:post-content /-->')
    writeFileSync(join(dir, 'bare.html'), '<!-- wp:post-content /-->')
    const put = vi.fn().mockResolvedValue({})

    const result = await makeCommand(put, 'landing').run()

    expect(result).toEqual({pushed: ['landing'], status: 'success'})
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith('loopress/v1/templates', {html: '<!-- wp:post-content /-->', slug: 'landing', title: 'Landing page'})
  })

  it('refuses the whole push before any network call when the directory holds a bad file', async () => {
    writeFileSync(join(dir, 'landing.html'), '<!-- status: publish -->\n<p/>')
    const put = vi.fn()

    await expect(makeCommand(put).run()).rejects.toThrow('unknown header key "status" (allowed: title)')
    expect(put).not.toHaveBeenCalled()
  })

  it('errors on an unknown slug before any network call', async () => {
    const put = vi.fn()

    await expect(makeCommand(put, 'missing').run()).rejects.toThrow(`No template "missing" in ${dir} (expected missing.html).`)
    expect(put).not.toHaveBeenCalled()
  })

  it('writes nothing on a dry run', async () => {
    writeFileSync(join(dir, 'landing.html'), '<p/>')
    const put = vi.fn()
    const cmd = makeCommand(put)
    cmd.dryRun = true

    expect(await cmd.run()).toEqual({pushed: ['landing'], status: 'dry-run'})
    expect(put).not.toHaveBeenCalled()
  })

  it('errors with the failed count when the server refuses', async () => {
    writeFileSync(join(dir, 'landing.html'), '<p/>')

    await expect(makeCommand(vi.fn().mockRejectedValue(new Error('not a block theme'))).run()).rejects.toThrow('1 template failed to push.')
  })
})
