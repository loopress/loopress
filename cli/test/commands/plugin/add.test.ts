import {mkdtempSync, rmSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Add from '../../../src/commands/plugin/add.js'
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

describe('plugin add', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lps-plugin-add-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, {force: true, recursive: true})
  })

  it('adds a new plugin pinned to "latest" by default', async () => {
    const {cmd, logs} = make(['woocommerce'])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Added woocommerce (latest). Run `lps plugin push` to apply.')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({woocommerce: 'latest'})
  })

  it('pins an exact version with --version', async () => {
    const {cmd} = make(['woocommerce', '--version', '9.4.2'])

    await cmd.run()

    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({woocommerce: '9.4.2'})
  })

  it('rejects a Composer constraint passed to --version', async () => {
    const {cmd} = make(['woocommerce', '--version', '^9.4'])

    await expect(cmd.run()).rejects.toThrow(/exact version/)
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('preserves existing plugins when adding a new one', async () => {
    const {cmd} = make(['woocommerce'], {plugins: {acf: '6.3.0'}})

    await cmd.run()

    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({acf: '6.3.0', woocommerce: 'latest'})
  })

  it('updates the pinned version of a plugin already present', async () => {
    const {cmd, logs} = make(['woocommerce', '--version', '9.5.0'], {plugins: {woocommerce: '9.4.2'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Updated woocommerce (9.5.0). Run `lps plugin push` to apply.')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins.woocommerce).toBe('9.5.0')
  })

  it('is a no-op when the plugin is already pinned to the same value', async () => {
    const {cmd, logs} = make(['woocommerce'], {plugins: {woocommerce: 'latest'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('woocommerce is already pinned to latest in loopress.json, nothing to do.')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('does not write the file on a dry run', async () => {
    const {cmd, logs} = make(['woocommerce'], {}, true)

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would add woocommerce (latest) in loopress.json')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })
})
