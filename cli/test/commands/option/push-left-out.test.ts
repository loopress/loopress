import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/option/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type Internals = {
  dryRun: boolean
  failOnLeftOutFiles(): void
  previewChanges: Array<{id: string; status: string}>
  pushOption(option: {autoload: string; name: string; value: unknown}, task?: {output: string}): Promise<void>
  skipFile(message: string): void
  warn: ReturnType<typeof vi.fn>
}

function makeCmd(): Internals {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  const internals = cmd as unknown as Internals
  internals.warn = vi.fn()
  return internals
}

describe('files a push could not read', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-leftout-'))
    mkdirSync(dir, {recursive: true})
    writeFileSync(join(dir, 'broken.json'), '{nope')
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('warns once per file however many readers meet it, then fails the run naming it', () => {
    const cmd = makeCmd()
    const message = `Skipping "${join(dir, 'broken.json')}": Unexpected token`
    cmd.skipFile(message)
    cmd.skipFile(message)

    expect(cmd.warn).toHaveBeenCalledTimes(1)
    expect(() => {
      cmd.failOnLeftOutFiles()
    }).toThrow(/1 file left out because they could not be read: .*broken\.json/u)
  })

  it('does not fail a run that left nothing out', () => {
    expect(() => {
      makeCmd().failOnLeftOutFiles()
    }).not.toThrow()
  })

  it('prints no "Would push" for an option the preview already reported unchanged', async () => {
    const cmd = makeCmd()
    cmd.dryRun = true
    cmd.previewChanges = [
      {id: 'same', status: 'unchanged'},
      {id: 'other', status: 'changed'},
    ]
    const same = {output: ''}
    const other = {output: ''}

    await cmd.pushOption({autoload: 'no', name: 'same', value: 1}, same)
    await cmd.pushOption({autoload: 'no', name: 'other', value: 1}, other)

    expect(same.output).toBe('')
    expect(other.output).toBe('[dry-run] Would push: other')
  })
})
