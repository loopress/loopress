import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Rm from '../../../src/commands/api/rm.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const {confirm} = vi.hoisted(() => ({confirm: vi.fn()}))
vi.mock('@inquirer/prompts', () => ({confirm}))

const interactive = vi.hoisted(() => ({value: true}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

type RmInternals = {
  dryRun: boolean
  localConfig: LoopressLocalConfig
  siteConfig: EnvironmentConfig
  wpClient: {delete: ReturnType<typeof vi.fn>}
  yes: boolean
}

function make(argv: string[], {dryRun = false, yes = false} = {}) {
  const cmd = new Rm(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as RmInternals
  internals.dryRun = dryRun
  internals.yes = yes
  internals.localConfig = {}
  internals.siteConfig = makeEnv('production', 'https://acme.com')
  const del = vi.fn().mockResolvedValue({deleted: true, filename: 'hello'})
  internals.wpClient = {delete: del}
  return {cmd, del, logs}
}

describe('api rm', () => {
  beforeEach(() => {
    confirm.mockReset()
    interactive.value = true
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes the file after an interactive confirmation', async () => {
    confirm.mockResolvedValue(true)
    const {cmd, del, logs} = make(['hello'])

    const result = await cmd.run()

    expect(del).toHaveBeenCalledWith('loopress/v1/api-files?filename=hello')
    expect(logs.log).toHaveBeenCalledWith('Removed hello from https://acme.com')
    expect(result).toEqual({filename: 'hello', removed: true, status: 'success'})
  })

  it('does nothing when the confirmation is declined', async () => {
    confirm.mockResolvedValue(false)
    const {cmd, del} = make(['hello'])

    const result = await cmd.run()

    expect(del).not.toHaveBeenCalled()
    expect(result).toEqual({filename: 'hello', removed: false, status: 'aborted'})
  })

  it('skips the prompt with --yes', async () => {
    const {cmd, del} = make(['hello'], {yes: true})

    await cmd.run()

    expect(confirm).not.toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('loopress/v1/api-files?filename=hello')
  })

  it('refuses to run in a non-TTY without --yes', async () => {
    interactive.value = false
    const {cmd, del} = make(['hello'])

    await expect(cmd.run()).rejects.toThrow(/needs confirmation.*--yes/s)
    expect(del).not.toHaveBeenCalled()
  })

  it('does not call the API on --dry-run', async () => {
    const {cmd, del, logs} = make(['hello'], {dryRun: true})

    const result = await cmd.run()

    expect(del).not.toHaveBeenCalled()
    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would remove hello from https://acme.com')
    expect(result.status).toBe('dry-run')
  })

  it('rejects an invalid filename before any network call', async () => {
    const {cmd, del} = make(['../../wp-config'], {yes: true})

    await expect(cmd.run()).rejects.toThrow(/Invalid filename/)
    expect(del).not.toHaveBeenCalled()
  })

  it('reports a clear message when the file is not on the server', async () => {
    const {cmd, del} = make(['hello'], {yes: true})
    del.mockRejectedValue(
      new Error('rejected', {
        cause: {response: {body: JSON.stringify({error: 'File not found'}), statusCode: 404}},
      }),
    )

    await expect(cmd.run()).rejects.toThrow(/hello is not on https:\/\/acme\.com/)
  })

  it('encodes a nested slug in the query string', async () => {
    const {cmd, del} = make(['invoice-pdf/[order_id]'], {yes: true})

    await cmd.run()

    expect(del).toHaveBeenCalledWith('loopress/v1/api-files?filename=invoice-pdf%2F%5Border_id%5D')
  })
})
