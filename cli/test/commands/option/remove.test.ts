import {confirm} from '@inquirer/prompts'
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Remove from '../../../src/commands/option/remove.js'
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
    const {cmd, del} = makeCmd(['blogname', '--path', dir])
    del.mockRejectedValueOnce(new Error('Not Found', {cause: {response: {statusCode: 404}}}))

    const result = await cmd.run()

    expect(existsSync(join(dir, 'blogname.json'))).toBe(false)
    expect(result).toMatchObject({deletedRemote: true, status: 'success'})
  })
})
