import {describe, expect, it, vi} from 'vitest'

import List from '../../../src/commands/app/list.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type ListWithWpClient = {wpClient: {get: ReturnType<typeof vi.fn>}}

function makeCmd(argv: string[]) {
  const cmd = new List(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

const committedApp = {
  buildId: '9f2a1c7b4e10',
  committed: true,
  deployedAt: '2026-08-30T12:00:00+00:00',
  fileCount: 3,
  name: 'search',
  routing: 'hash',
  totalBytes: 2560,
}

describe('app list', () => {
  it('fetches loopress/v1/apps and prints a committed app with build, size and deploy time', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([committedApp])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/apps')
    expect(logs.log).toHaveBeenCalledWith('Apps (1):')
    expect(logs.log).toHaveBeenCalledWith('  search')
    expect(logs.log).toHaveBeenCalledWith('     Build:  9f2a1c7b4e10')
    expect(logs.log).toHaveBeenCalledWith('     Files:  3 files, 2.5 KB')
    expect(logs.log).toHaveBeenCalledWith('     Deployed: 2026-08-30T12:00:00+00:00')
  })

  it('flags an app that was uploaded but never committed', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([
      {buildId: null, committed: false, deployedAt: null, fileCount: 0, name: 'portal', routing: null, totalBytes: 0},
    ])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('  portal')
    expect(logs.log).toHaveBeenCalledWith('     (uploaded but never committed, run `lps app push` to finish)')
  })

  it('prints "(none)" when no apps are deployed', async () => {
    const {cmd, logs} = makeCmd([])
    const get = vi.fn().mockResolvedValueOnce([])
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Apps (0):')
    expect(logs.log).toHaveBeenCalledWith('  (none)')
  })

  it('returns the raw apps array so oclif prints it as JSON under --json', async () => {
    const {cmd} = makeCmd(['--json'])
    const apps = [committedApp]
    const get = vi.fn().mockResolvedValueOnce(apps)
    ;(cmd as unknown as ListWithWpClient).wpClient = {get}

    const result = await cmd.run()

    expect(result).toEqual(apps)
  })
})
