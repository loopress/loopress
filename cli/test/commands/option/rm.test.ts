import {confirm} from '@inquirer/prompts'
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Remove from '../../../src/commands/option/rm.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({confirm: vi.fn()}))

const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

type RemoveInternals = {
  dryRun: boolean
  siteConfig: EnvironmentConfig
  wpClient: {delete: ReturnType<typeof vi.fn>}
  yes: boolean
}

function makeCmd(argv: string[], opts: {dryRun?: boolean; env?: EnvironmentConfig; yes?: boolean} = {}) {
  const cmd = new Remove(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as RemoveInternals
  internals.dryRun = opts.dryRun ?? false
  internals.yes = opts.yes ?? false
  internals.siteConfig = opts.env ?? makeEnv('staging', 'https://staging.acme.com')
  const del = vi.fn().mockResolvedValue({})
  internals.wpClient = {delete: del}
  return {cmd, del, logs}
}

describe('option remove', () => {
  let dir: string

  beforeEach(() => {
    interactive.value = false
    vi.mocked(confirm).mockReset()
    dir = mkdtempSync(join(tmpdir(), 'lps-option-remove-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('does not touch anything on a dry run', async () => {
    writeFileSync(join(dir, 'blogname.json'), '{}')
    const {cmd, del} = makeCmd(['blogname', '--path', dir], {dryRun: true})

    const result = await cmd.run()

    expect(del).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'blogname.json'))).toBe(true)
    expect(result).toMatchObject({status: 'dry-run'})
  })

  it('--local-only untracks the file without touching WordPress', async () => {
    writeFileSync(join(dir, 'blogname.json'), '{}')
    const {cmd, del} = makeCmd(['blogname', '--path', dir, '--local-only'])

    const result = await cmd.run()

    expect(del).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'blogname.json'))).toBe(false)
    expect(result).toMatchObject({deletedRemote: false, status: 'success'})
  })

  it('deletes on WordPress and untracks locally without prompting outside a TTY on a non-production env', async () => {
    writeFileSync(join(dir, 'blogname.json'), '{}')
    const {cmd, del} = makeCmd(['blogname', '--path', dir])

    const result = await cmd.run()

    expect(del).toHaveBeenCalledWith('loopress/v1/options/blogname')
    expect(confirm).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'blogname.json'))).toBe(false)
    expect(result).toMatchObject({deletedRemote: true, status: 'success'})
  })

  it('refuses a non-interactive production delete without --yes', async () => {
    const {cmd, del} = makeCmd(['blogname', '--path', dir], {env: makeEnv('production', 'https://acme.com')})

    await expect(cmd.run()).rejects.toThrow('production')
    expect(del).not.toHaveBeenCalled()
  })

  it('aborts when the interactive confirmation is declined, keeping the local file', async () => {
    writeFileSync(join(dir, 'blogname.json'), '{}')
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(false)
    const {cmd, del} = makeCmd(['blogname', '--path', dir])

    const result = await cmd.run()

    expect(del).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'blogname.json'))).toBe(true)
    expect(result).toMatchObject({status: 'aborted'})
  })

  it('tolerates a 404 (already deleted remotely) and still untracks locally', async () => {
    writeFileSync(join(dir, 'blogname.json'), '{}')
    const {cmd, del, logs} = makeCmd(['blogname', '--path', dir])
    del.mockRejectedValueOnce(new Error('Not Found', {cause: {response: {statusCode: 404}}}))

    const result = await cmd.run()

    expect(existsSync(join(dir, 'blogname.json'))).toBe(false)
    expect(result).toMatchObject({deletedRemote: false, status: 'success'})
    expect(logs.log).toHaveBeenCalledWith('"blogname" was already absent on https://staging.acme.com; untracked it locally')
  })
  it('logs what a dry run would do, with and without the remote delete', async () => {
    const full = makeCmd(['blogname', '--path', dir], {dryRun: true})
    const localOnly = makeCmd(['blogname', '--path', dir, '--local-only'], {dryRun: true})

    expect(await full.cmd.run()).toEqual({deletedRemote: false, name: 'blogname', status: 'dry-run'})
    await localOnly.cmd.run()

    expect(full.logs.log).toHaveBeenCalledWith('[dry-run] Would untrack "blogname" locally and delete it from https://staging.acme.com')
    expect(localOnly.logs.log).toHaveBeenCalledWith('[dry-run] Would untrack "blogname" locally')
  })

  it('--local-only logs that the site was left untouched and tolerates a missing local file', async () => {
    const {cmd, logs} = makeCmd(['blogname', '--path', dir, '--local-only'])

    const result = await cmd.run()

    expect(result).toEqual({deletedRemote: false, name: 'blogname', status: 'success'})
    expect(logs.log).toHaveBeenCalledWith('Untracked "blogname" locally (left untouched on https://staging.acme.com)')
  })

  it('logs the removal and tolerates a missing local file after the remote delete', async () => {
    const {cmd, del, logs} = makeCmd(['blogname', '--path', dir])

    const result = await cmd.run()

    expect(del).toHaveBeenCalledTimes(1)
    expect(result).toEqual({deletedRemote: true, name: 'blogname', status: 'success'})
    expect(logs.log).toHaveBeenCalledWith('Removed "blogname" from https://staging.acme.com and untracked it locally')
  })

  it('deletes a production option once --yes is passed, without prompting', async () => {
    interactive.value = true
    const {cmd, del} = makeCmd(['blogname', '--path', dir], {env: makeEnv('production', 'https://acme.com'), yes: true})

    const result = await cmd.run()

    expect(confirm).not.toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('loopress/v1/options/blogname')
    expect(result).toMatchObject({deletedRemote: true, status: 'success'})
  })

  it('asks for a confirmation naming the option and the site, and logs the abort', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(false)
    const {cmd, logs} = makeCmd(['blogname', '--path', dir])

    await cmd.run()

    expect(confirm).toHaveBeenCalledWith({default: false, message: 'Delete option "blogname" from https://staging.acme.com? (local tracking also stops)'})
    expect(logs.log).toHaveBeenCalledWith('Aborted.')
  })

  it('deletes once the interactive confirmation is accepted', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(true)
    const {cmd, del} = makeCmd(['blogname', '--path', dir])

    const result = await cmd.run()

    expect(del).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({status: 'success'})
  })

  it('rethrows a delete failure other than a 404 and keeps the local file', async () => {
    writeFileSync(join(dir, 'blogname.json'), '{}')
    const {cmd, del} = makeCmd(['blogname', '--path', dir])
    del.mockRejectedValueOnce(new Error('Server Error', {cause: {response: {statusCode: 500}}}))

    await expect(cmd.run()).rejects.toThrow('Server Error')
    expect(existsSync(join(dir, 'blogname.json'))).toBe(true)
  })
})
