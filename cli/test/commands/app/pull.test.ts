import {confirm} from '@inquirer/prompts'
import {Buffer} from 'node:buffer'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/app/pull.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('@inquirer/prompts', () => ({confirm: vi.fn()}))

const interactive = vi.hoisted(() => ({value: false}))
vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => interactive.value}))

type PullInternals = {
  dryRun: boolean
  findOrphanApps(path: string, keep: Set<string>): Promise<string[]>
  localConfig: LoopressLocalConfig
  siteConfig: EnvironmentConfig
  wpClient: {get: ReturnType<typeof vi.fn>}
  yes: boolean
}

function b64(s: string): string {
  return Buffer.from(s).toString('base64')
}

// Routes the two GET shapes `pullApp` issues: the manifest, then one asset per file.
function remote(apps: Array<{committed: boolean; name: string}>, files: Record<string, Record<string, string>>) {
  return vi.fn(async (path: string) => {
    if (path === 'loopress/v1/apps') return apps
    const manifestMatch = /^loopress\/v1\/apps\/([^/]+)\/manifest$/.exec(path)
    if (manifestMatch) {
      const name = manifestMatch[1]
      return {
        buildId: 'abc123',
        entry: {scripts: ['assets/app.js'], styles: []},
        files: Object.keys(files[name]).map((p) => ({path: p, sha256: 'x', size: 1})),
        mountSelector: `#loopress-app-${name}`,
        name,
        routing: 'hash',
      }
    }

    const assetMatch = /^loopress\/v1\/apps\/([^/]+)\/asset\?path=(.+)$/.exec(path)
    if (assetMatch) {
      const [, name, encoded] = assetMatch
      return {content: b64(files[name][decodeURIComponent(encoded)])}
    }

    throw new Error(`unexpected GET ${path}`)
  })
}

function makeCmd(argv: string[], dryRun = false) {
  const cmd = new Pull(argv, fakeOclifConfig)
  const logs = silenceLogs(cmd)
  const internals = cmd as unknown as PullInternals
  internals.dryRun = dryRun
  internals.yes = false
  internals.localConfig = {}
  internals.siteConfig = makeEnv('staging', 'https://staging.acme.com')
  return {cmd, internals, logs}
}

describe('app pull', () => {
  let dir: string

  beforeEach(() => {
    interactive.value = false
    dir = mkdtempSync(join(tmpdir(), 'lps-app-pull-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('findOrphanApps', () => {
    it('returns local app dirs that are not in the keep set', async () => {
      mkdirSync(join(dir, 'gone'), {recursive: true})
      writeFileSync(join(dir, 'gone', 'loopress.app.json'), '{}')
      mkdirSync(join(dir, 'kept'), {recursive: true})
      writeFileSync(join(dir, 'kept', 'loopress.app.json'), '{}')

      const {internals} = makeCmd([dir])
      const orphans = await internals.findOrphanApps(dir, new Set(['kept']))

      expect(orphans).toEqual(['gone'])
    })

    it('ignores a directory without a loopress.app.json', async () => {
      mkdirSync(join(dir, 'stray'), {recursive: true})

      const {internals} = makeCmd([dir])

      expect(await internals.findOrphanApps(dir, new Set())).toEqual([])
    })

    it('returns an empty list when the apps directory does not exist', async () => {
      const {internals} = makeCmd([dir])

      expect(await internals.findOrphanApps(join(dir, 'missing'), new Set())).toEqual([])
    })
  })

  describe('run', () => {
    it('writes each committed app to <name>/dist plus a loopress.app.json, and skips uncommitted ones', async () => {
      const {cmd, internals} = makeCmd([dir])
      internals.wpClient = {
        get: remote(
          [
            {committed: true, name: 'search'},
            {committed: false, name: 'half-pushed'},
          ],
          {search: {'assets/app.js': 'export const v = 1', 'index.html': '<!doctype html>'}},
        ),
      }

      const result = await cmd.run()

      expect(readFileSync(join(dir, 'search', 'dist', 'assets', 'app.js'), 'utf8')).toBe('export const v = 1')
      expect(JSON.parse(readFileSync(join(dir, 'search', 'loopress.app.json'), 'utf8'))).toEqual({
        assetsDir: 'dist',
        mountSelector: '#loopress-app-search',
        name: 'search',
        routing: 'hash',
      })
      expect(existsSync(join(dir, 'half-pushed'))).toBe(false)
      expect(result).toMatchObject({pulled: [{files: 2, name: 'search'}], status: 'success'})
    })

    it('writes nothing on a dry run and reports what it would pull', async () => {
      const {cmd, internals, logs} = makeCmd([dir], true)
      internals.wpClient = {
        get: remote([{committed: true, name: 'search'}], {search: {'index.html': '<!doctype html>'}}),
      }

      const result = await cmd.run()

      expect(existsSync(join(dir, 'search'))).toBe(false)
      expect(logs.log).toHaveBeenCalledWith(`[dry-run] Would pull 1 app to ${dir}`)
      expect(result.status).toBe('dry-run')
    })

    it('removes a local app that no longer exists on the remote', async () => {
      mkdirSync(join(dir, 'obsolete'), {recursive: true})
      writeFileSync(join(dir, 'obsolete', 'loopress.app.json'), '{}')
      const {cmd, internals} = makeCmd([dir])
      internals.yes = true
      internals.wpClient = {
        get: remote([{committed: true, name: 'search'}], {search: {'index.html': '<!doctype html>'}}),
      }

      const result = await cmd.run()

      expect(existsSync(join(dir, 'obsolete'))).toBe(false)
      expect(result.orphans).toEqual(['obsolete'])
    })

    it('reports the would-remove orphans line on a dry run, pluralized', async () => {
      mkdirSync(join(dir, 'obsolete-a'), {recursive: true})
      writeFileSync(join(dir, 'obsolete-a', 'loopress.app.json'), '{}')
      mkdirSync(join(dir, 'obsolete-b'), {recursive: true})
      writeFileSync(join(dir, 'obsolete-b', 'loopress.app.json'), '{}')
      const {cmd, internals, logs} = makeCmd([dir], true)
      internals.wpClient = {get: remote([], {})}

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith(`[dry-run] Would remove 2 local apps: obsolete-a, obsolete-b`)
    })

    it('does not log a would-remove line on a dry run when there are no orphans', async () => {
      const {cmd, internals, logs} = makeCmd([dir], true)
      internals.wpClient = {get: remote([], {})}

      await cmd.run()

      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Would remove'))
    })

    it('keeps the app when the interactive removal confirmation is declined', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(false)
      mkdirSync(join(dir, 'obsolete'), {recursive: true})
      writeFileSync(join(dir, 'obsolete', 'loopress.app.json'), '{}')
      const {cmd, internals, logs} = makeCmd([dir])
      internals.wpClient = {get: remote([], {})}

      const result = await cmd.run()

      expect(existsSync(join(dir, 'obsolete'))).toBe(true)
      expect(result.orphans).toEqual(['obsolete'])
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Kept 1 local app'))
    })

    it('removes the app and logs (not warns) when the interactive confirmation is accepted', async () => {
      interactive.value = true
      vi.mocked(confirm).mockResolvedValueOnce(true)
      mkdirSync(join(dir, 'obsolete'), {recursive: true})
      writeFileSync(join(dir, 'obsolete', 'loopress.app.json'), '{}')
      const {cmd, internals, logs} = makeCmd([dir])
      internals.wpClient = {get: remote([], {})}

      await cmd.run()

      expect(existsSync(join(dir, 'obsolete'))).toBe(false)
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Removed 1 local app'))
      expect(logs.warn).not.toHaveBeenCalled()
    })

    it('warns (not logs) when removing without a prompt outside a TTY', async () => {
      mkdirSync(join(dir, 'obsolete'), {recursive: true})
      writeFileSync(join(dir, 'obsolete', 'loopress.app.json'), '{}')
      const {cmd, internals, logs} = makeCmd([dir])
      internals.wpClient = {get: remote([], {})}

      await cmd.run()

      expect(existsSync(join(dir, 'obsolete'))).toBe(false)
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('Removed 1 local app'))
    })
  })
})
