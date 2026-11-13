import {Buffer} from 'node:buffer'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import AppPush from '../../src/commands/app/push.js'
import AppRollback from '../../src/commands/app/rollback.js'
import {APP_SNAPSHOT_MAX_BYTES, sha256} from '../../src/lib/app-snapshot.js'
import {type RollbackResult} from '../../src/lib/rollback-command.js'
import {listSnapshots, readSnapshot} from '../../src/lib/snapshot-store.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv} from '../helpers/project-fixtures.js'

vi.mock('../../src/lib/interactive.js', () => ({isInteractive: () => false}))

type Manifest = {buildId: string; files: Array<{path: string; sha256: string; size: number}>; name: string}

const notFound = new Error('not found', {cause: {response: {statusCode: 404}}})

// The app name a route like `loopress/v1/apps/<name>/<suffix>` targets.
function appName(path: string, suffix: string): string {
  const match = new RegExp(`^loopress/v1/apps/([^/?]+)${suffix}`).exec(path)
  if (!match?.[1]) throw new Error(`unexpected route ${path}`)
  return match[1]
}

// An in-memory AppsController: files on disk per app, the committed manifest, and the commit's
// N-1 grace (the previous build's files survive one commit).
function fakeSite() {
  const disk = new Map<string, Map<string, Uint8Array>>()
  const records = new Map<string, {manifest: Manifest; previous: string[]}>()
  const files = (name: string) => {
    const existing = disk.get(name)
    if (existing) return existing
    const created = new Map<string, Uint8Array>()
    disk.set(name, created)
    return created
  }

  const content = (name: string, path: string) => Buffer.from(files(name).get(path) ?? new Uint8Array())

  const get = vi.fn(async (path: string) => {
    if (path === 'loopress/v1/apps') return [...disk.keys()].map((name) => ({committed: records.has(name), name}))
    if (path.endsWith('/manifest')) {
      const record = records.get(appName(path, '/manifest$'))
      if (!record) throw notFound
      return {crossOrigin: null, ...record.manifest}
    }

    const asset = new URL(path, 'https://site.test/').searchParams.get('path') ?? ''
    return {content: content(appName(path, String.raw`/asset\?`), asset).toString('base64')}
  })
  const put = vi.fn(async (path: string, body: {content: string; path: string}) => {
    files(appName(path, '/assets$')).set(body.path, Buffer.from(body.content, 'base64'))
    return {}
  })
  const post = vi.fn(async (path: string, body: Manifest & {crossOrigin?: unknown}) => {
    if (path === 'loopress/v1/pushes') return {}
    if (body.crossOrigin === null) throw new Error('crossOrigin must be absent or a policy')
    const name = appName(path, '/commit$')
    const onDisk = files(name)
    for (const file of body.files) {
      if (sha256(content(name, file.path)) !== file.sha256) throw new Error(`Asset not uploaded: ${file.path}`)
    }

    const keep = new Set([...body.files.map((file) => file.path), ...(records.get(name)?.previous ?? [])])
    for (const existing of onDisk.keys()) if (!keep.has(existing)) onDisk.delete(existing)
    records.set(name, {manifest: body, previous: body.files.map((file) => file.path)})
    return {}
  })
  const del = vi.fn(async (path: string) => {
    const name = appName(path, '$')
    disk.delete(name)
    records.delete(name)
    return {}
  })

  const served = (name: string) =>
    Object.fromEntries((records.get(name)?.manifest.files ?? []).map((file) => [file.path, content(name, file.path).toString()]))

  return {served, wp: {delete: del, get, post, put}}
}

function writeApp(root: string, name: string, files: Record<string, string>): void {
  const appDir = join(root, 'apps', name)
  rmSync(join(appDir, 'dist'), {force: true, recursive: true})
  mkdirSync(join(appDir, 'dist', 'assets'), {recursive: true})
  writeFileSync(join(appDir, 'loopress.app.json'), '{}\n')
  for (const [path, content] of Object.entries(files)) writeFileSync(join(appDir, 'dist', path), content)
}

function build(chunk: string): Record<string, string> {
  return {
    [`assets/${chunk}.js`]: `export const v = '${chunk}'`,
    'index.html': `<!doctype html><html><head><script type="module" src="/assets/${chunk}.js"></script></head><body></body></html>\n`,
  }
}

describe('app snapshot and rollback', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'lps-app-rollback-test-'))
    resetFakeOclifConfig()
  })

  afterEach(() => {
    rmSync(rootDir, {force: true, recursive: true})
  })

  function make<T>(Command: unknown, wp: unknown, argv: string[] = []) {
    const cmd = new (Command as new (argv: string[], config: typeof fakeOclifConfig) => {run(): Promise<T>})(argv, fakeOclifConfig)
    silenceLogs(cmd as never)
    const warn = vi.fn()
    Object.assign(cmd, {
      dryRun: false,
      localConfig: {rootDir},
      async recordDeployment() {},
      siteConfig: makeEnv('staging'),
      warn,
      wpClient: wp,
      yes: false,
    })
    return {cmd, warn}
  }

  async function push(wp: unknown, argv: string[] = ['--no-build']) {
    const run = make(AppPush, wp, argv)
    await run.cmd.run()
    return run
  }

  it('restores the build the push replaced, its removed chunk included, and removes the app it created', async () => {
    const site = fakeSite()
    writeApp(rootDir, 'search', build('v1'))
    await push(site.wp)
    // Second push: a new chunk replaces v1 (removed from the manifest), index.html is overwritten,
    // and a second app appears.
    writeApp(rootDir, 'search', build('v2'))
    writeApp(rootDir, 'portal', build('p1'))
    await push(site.wp)
    // A third build on the site would drop v1.js from disk: rollback must not depend on it.
    expect(site.served('search')).toEqual(build('v2'))

    const {cmd} = make<RollbackResult>(AppRollback, site.wp)
    const result = await cmd.run()

    expect(result.status).toBe('success')
    expect(result.restored).toEqual({added: [], changed: ['search'], removed: ['portal']})
    expect(site.served('search')).toEqual(build('v1'))
    expect(site.served('portal')).toEqual({})
    expect(site.wp.delete).toHaveBeenCalledWith('loopress/v1/apps/portal')
  })

  it('reads the replaced build from the site when no earlier snapshot holds it', async () => {
    const site = fakeSite()
    writeApp(rootDir, 'search', build('v1'))
    await push(site.wp)
    rmSync(join(rootDir, '.loopress'), {force: true, recursive: true})
    writeApp(rootDir, 'search', build('v2'))
    await push(site.wp)

    expect(site.wp.get).toHaveBeenCalledWith('loopress/v1/apps/search/asset?path=index.html')
    const {cmd} = make<RollbackResult>(AppRollback, site.wp)
    expect((await cmd.run()).status).toBe('success')
    expect(site.served('search')).toEqual(build('v1'))
  })

  it('keeps no copy of a bundle above the size cap, says so, and the push still succeeds', async () => {
    const site = fakeSite()
    writeApp(rootDir, 'search', {...build('v1'), 'assets/big.js': 'x'.repeat(APP_SNAPSHOT_MAX_BYTES)})

    const {warn} = await push(site.wp)

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/search: the rollback snapshot keeps no copy of this bundle, .* above the 20\.0 MB cap/))
    expect(site.served('search')['index.html']).toBe(build('v1')['index.html'])
    const summaries = await listSnapshots(rootDir, 'app', 'staging')
    expect(summaries).toHaveLength(1)
    const snapshot = await readSnapshot(rootDir, 'app', 'staging')
    expect(snapshot.payload).toEqual({blobs: {}})
    expect(Object.keys(snapshot.afterState)).toEqual(['search'])
  })

  it('refuses a restore whose files the snapshot does not hold, before writing anything', async () => {
    const site = fakeSite()
    writeApp(rootDir, 'search', build('v1'))
    await push(site.wp)
    writeApp(rootDir, 'search', {...build('v2'), 'assets/big.js': 'x'.repeat(APP_SNAPSHOT_MAX_BYTES)})
    await push(site.wp)
    site.wp.put.mockClear()
    site.wp.post.mockClear()

    const {cmd} = make<RollbackResult>(AppRollback, site.wp, ['--yes'])

    await expect(cmd.run()).rejects.toThrow(/holds no copy of these files, nothing was restored: search \(assets\/v1\.js, index\.html\)/)
    expect(site.wp.put).not.toHaveBeenCalled()
    expect(site.wp.post).not.toHaveBeenCalled()
  })
})
