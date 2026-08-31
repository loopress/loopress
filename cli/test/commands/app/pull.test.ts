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
  })
})
