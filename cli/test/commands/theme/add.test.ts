import {mkdtempSync, rmSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Add from '../../../src/commands/theme/add.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type AddInternals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
}

function make(argv: string[], localConfig: LoopressLocalConfig = {}, dryRun = false) {
  const cmd = new Add(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as AddInternals
  internals.localConfig = localConfig
  internals.dryRun = dryRun
  return {cmd, logs}
}

describe('theme add', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lps-theme-add-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, {force: true, recursive: true})
  })

  it('adds a new theme pinned to "latest" by default', async () => {
    const {cmd, logs} = make(['generatepress'])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Added generatepress (latest). Run `lps theme push` to apply.')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.themes).toEqual({generatepress: 'latest'})
  })

  it('pins an exact version with --version', async () => {
    const {cmd} = make(['generatepress', '--version', '3.4.0'])

    await cmd.run()

    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.themes).toEqual({generatepress: '3.4.0'})
  })

  it('rejects a Composer constraint passed to --version', async () => {
    const {cmd} = make(['generatepress', '--version', '^3.4'])

    await expect(cmd.run()).rejects.toThrow(/exact version/)
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('preserves existing themes when adding a new one', async () => {
    const {cmd} = make(['generatepress'], {themes: {astra: '4.0.0'}})

    await cmd.run()

    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.themes).toEqual({astra: '4.0.0', generatepress: 'latest'})
  })

  it('updates the pinned version of a theme already present', async () => {
    const {cmd, logs} = make(['generatepress', '--version', '3.5.0'], {themes: {generatepress: '3.4.0'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Updated generatepress (3.5.0). Run `lps theme push` to apply.')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.themes.generatepress).toBe('3.5.0')
  })

  it('is a no-op when the theme is already pinned to the same value', async () => {
    const {cmd, logs} = make(['generatepress'], {themes: {generatepress: 'latest'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('generatepress is already pinned to latest, nothing to do.')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('does not write the file on a dry run, for a new theme', async () => {
    const {cmd, logs} = make(['generatepress'], {}, true)

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would add generatepress (latest)')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('reports "update" rather than "add" on a dry run for a theme already present', async () => {
    const {cmd, logs} = make(['generatepress', '--version', '3.5.0'], {themes: {generatepress: '3.4.0'}}, true)

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would update generatepress (3.5.0)')
  })
})
