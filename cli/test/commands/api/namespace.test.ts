import {beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/api/pull.js'
import Push from '../../../src/commands/api/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

const {writeLocalConfig} = vi.hoisted(() => ({writeLocalConfig: vi.fn()}))
vi.mock('../../../src/utils/loopress-config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeLocalConfig,
}))

type PushCommand = InstanceType<typeof Push>
type PullCommand = InstanceType<typeof Pull>

type Wp = {get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
type Namespaced = {dryRun: boolean; localConfig: Record<string, unknown>; siteConfig: unknown; wpClient: Wp}

function setup(cmd: PullCommand | PushCommand, remote: string, localConfig: Record<string, unknown> = {}, dryRun = false) {
  const wp: Wp = {get: vi.fn(async () => ({namespace: remote})), put: vi.fn(async () => ({}))}
  Object.assign(cmd as unknown as Namespaced, {dryRun, localConfig, siteConfig: makeEnv('staging', 'https://staging.acme.com'), wpClient: wp})
  const {log} = silenceLogs(cmd)
  return {log, wp}
}

describe('api namespace', () => {
  beforeEach(() => writeLocalConfig.mockReset())

  describe('push', () => {
    const run = async (cmd: PushCommand) => (cmd as unknown as {pushNamespace(): Promise<void>}).pushNamespace()

    it('sends the configured namespace when the site differs', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const {wp} = setup(cmd, 'loopress-api/v1', {api: {namespace: 'my-api/v2'}})
      await run(cmd)
      expect(wp.put).toHaveBeenCalledWith('loopress/v1/api-namespace', {namespace: 'my-api/v2'})
    })

    it('sends nothing when the site already uses it', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const {wp} = setup(cmd, 'my-api/v2', {api: {namespace: 'my-api/v2'}})
      await run(cmd)
      expect(wp.put).not.toHaveBeenCalled()
    })

    it('uses the default namespace when none is configured', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const {wp} = setup(cmd, 'old-api/v1')
      await run(cmd)
      expect(wp.put).toHaveBeenCalledWith('loopress/v1/api-namespace', {namespace: 'loopress-api/v1'})
    })

    it('only reports the change on a dry run', async () => {
      const cmd = new Push([], fakeOclifConfig)
      const {log, wp} = setup(cmd, 'loopress-api/v1', {api: {namespace: 'my-api/v2'}}, true)
      await run(cmd)
      expect(wp.put).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Would change the API namespace'))
    })

    it('refuses an invalid namespace before any request', async () => {
      for (const namespace of ['loopress/v1', 'Bad Name']) {
        const cmd = new Push([], fakeOclifConfig)
        const {wp} = setup(cmd, 'loopress-api/v1', {api: {namespace}})
        await expect(cmd.run()).rejects.toThrow(/api\.namespace/)
        expect(wp.get).not.toHaveBeenCalled()
        expect(wp.put).not.toHaveBeenCalled()
      }
    })
  })

  describe('pull', () => {
    const run = async (cmd: PullCommand) => (cmd as unknown as {pullNamespace(): Promise<void>}).pullNamespace()

    it("writes the site's namespace into loopress.json", async () => {
      const cmd = new Pull([], fakeOclifConfig)
      setup(cmd, 'my-api/v2', {rootDir: 'wp'})
      await run(cmd)
      expect(writeLocalConfig).toHaveBeenCalledWith({api: {namespace: 'my-api/v2'}, rootDir: 'wp'})
    })

    it('leaves loopress.json alone when it already matches', async () => {
      const cmd = new Pull([], fakeOclifConfig)
      setup(cmd, 'loopress-api/v1')
      await run(cmd)
      expect(writeLocalConfig).not.toHaveBeenCalled()
    })

    it('does not write on a dry run', async () => {
      const cmd = new Pull([], fakeOclifConfig)
      setup(cmd, 'my-api/v2', {}, true)
      await run(cmd)
      expect(writeLocalConfig).not.toHaveBeenCalled()
    })
  })
})
