import {mkdtempSync, rmSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Add from '../../../src/commands/plugin/add.js'
import {LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

interface AddInternals {
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

  it('adds a new plugin and writes loopress.json', async () => {
    const {cmd, logs} = make(['woocommerce'])

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Added woocommerce')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({woocommerce: 'latest'})
  })

  it('preserves existing plugins when adding a new one', async () => {
    const {cmd} = make(['woocommerce'], {plugins: {acf: 'latest'}})

    await cmd.run()

    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins).toEqual({acf: 'latest', woocommerce: 'latest'})
  })

  it('updates a plugin pinned to a specific version back to "latest"', async () => {
    const {cmd, logs} = make(['woocommerce'], {plugins: {woocommerce: '8.9.1'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Updated woocommerce')
    const written = JSON.parse(await readFile(join(tmpDir, 'loopress.json'), 'utf8'))
    expect(written.plugins.woocommerce).toBe('latest')
  })

  it('is a no-op when the plugin is already pinned to "latest"', async () => {
    const {cmd, logs} = make(['woocommerce'], {plugins: {woocommerce: 'latest'}})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('woocommerce is already in loopress.json, nothing to do.')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('does not write the file on a dry run when adding a new plugin', async () => {
    const {cmd, logs} = make(['woocommerce'], {}, true)

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would add woocommerce in loopress.json')
    await expect(readFile(join(tmpDir, 'loopress.json'), 'utf8')).rejects.toThrow()
  })

  it('reports "update" (not "add") on a dry run for a plugin already present with a pinned version', async () => {
    const {cmd, logs} = make(['woocommerce'], {plugins: {woocommerce: '8.9.1'}}, true)

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would update woocommerce in loopress.json')
  })
})
