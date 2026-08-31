import {confirm} from '@inquirer/prompts'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import Remove from '../../../src/commands/app/remove.js'
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

function makeCmd(opts: {dryRun?: boolean; env?: EnvironmentConfig; yes?: boolean} = {}) {
  const cmd = new Remove(['search'], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as RemoveInternals
  internals.dryRun = opts.dryRun ?? false
  internals.yes = opts.yes ?? false
  internals.siteConfig = opts.env ?? makeEnv('staging', 'https://staging.acme.com')
  const del = vi.fn().mockResolvedValue({})
  internals.wpClient = {delete: del}
  return {cmd, del, logs}
}

describe('app remove', () => {
  beforeEach(() => {
    interactive.value = false
    vi.mocked(confirm).mockReset()
  })

  it('does not touch the site on a dry run', async () => {
    const {cmd, del} = makeCmd({dryRun: true})

    const result = await cmd.run()

    expect(del).not.toHaveBeenCalled()
    expect(result).toMatchObject({deleted: false, status: 'dry-run'})
  })

  it('deletes the app without prompting outside a TTY on a non-production env', async () => {
    const {cmd, del} = makeCmd()

    const result = await cmd.run()

    expect(del).toHaveBeenCalledWith('loopress/v1/apps/search')
    expect(confirm).not.toHaveBeenCalled()
    expect(result).toMatchObject({deleted: true, name: 'search', status: 'success'})
  })

  it('refuses a non-interactive production delete without --yes', async () => {
    const {cmd, del} = makeCmd({env: makeEnv('production', 'https://acme.com')})

    await expect(cmd.run()).rejects.toThrow('production')
    expect(del).not.toHaveBeenCalled()
  })

  it('allows a production delete when --yes is passed', async () => {
    const {cmd, del} = makeCmd({env: makeEnv('production', 'https://acme.com'), yes: true})

    const result = await cmd.run()

    expect(del).toHaveBeenCalledWith('loopress/v1/apps/search')
    expect(result).toMatchObject({deleted: true, status: 'success'})
  })

  it('aborts when the interactive confirmation is declined', async () => {
    interactive.value = true
    vi.mocked(confirm).mockResolvedValueOnce(false)
    const {cmd, del} = makeCmd()

    const result = await cmd.run()

    expect(del).not.toHaveBeenCalled()
    expect(result).toMatchObject({deleted: false, status: 'aborted'})
  })
})
