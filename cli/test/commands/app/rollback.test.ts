import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/app/push.js'
import Rollback from '../../../src/commands/app/rollback.js'
import {type LoopressCommand} from '../../../src/lib/base.js'
import {type CommandClass} from '../../../src/lib/php-files-command.js'
import {type RollbackResult} from '../../../src/lib/rollback-command.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => false}))

type Manifest = {buildId: string; files: Array<{path: string; sha256: string; size: number}>; name: string}
type Site = {disk: Record<string, Record<string, string>>; records: Record<string, Manifest & {committed?: false; previous: string[]}>}

const notFound = new Error('not found', {cause: {response: {statusCode: 404}}})
const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex')

// A fake AppsController: a commit needs every file uploaded with its hash, keeps the files of
// the manifest and of the previous build, removes the rest.
function fakeSite(site: Site) {
  const route = (endpoint: string) => /^loopress\/v1\/apps\/([^/]+)\/(\w+)$/u.exec(endpoint) ?? []
  const get = vi.fn(async (endpoint: string) => {
    if (endpoint === 'loopress/v1/apps') return Object.values(site.records).map((record) => ({committed: record.committed !== false, name: record.name}))
    const asset = /^loopress\/v1\/apps\/([^/]+)\/asset\?path=(.+)$/u.exec(endpoint)
    if (asset) {
      const content = site.disk[asset[1] ?? '']?.[decodeURIComponent(asset[2] ?? '')]
      if (content === undefined) throw notFound
      return {content: Buffer.from(content).toString('base64')}
    }

    const record = site.records[route(endpoint)[1] ?? '']
    if (!record || record.committed === false) throw notFound
    const {buildId, files, name} = record
    return {buildId, crossOrigin: null, entry: {scripts: [], styles: []}, files: structuredClone(files), mountSelector: null, name, routing: 'hash'}
  })
  const put = vi.fn(async (endpoint: string, body: {content: string; path: string}) => {
    const name = route(endpoint)[1] ?? ''
    site.disk[name] = {...site.disk[name], [body.path]: Buffer.from(body.content, 'base64').toString()}
    return {}
  })
  const post = vi.fn(async (endpoint: string, manifest: Manifest) => {
    const name = route(endpoint)[1] ?? ''
    const disk = site.disk[name] ?? {}
    for (const file of manifest.files) {
      if (sha256(disk[file.path] ?? '') !== file.sha256) throw new Error(`Asset not uploaded: ${file.path}`)
    }

    const keep = new Set([...manifest.files.map((file) => file.path), ...(site.records[name]?.files.map((file) => file.path) ?? [])])
    site.disk[name] = Object.fromEntries(Object.entries(disk).filter(([path]) => keep.has(path)))
    site.records[name] = {buildId: manifest.buildId, files: manifest.files, name, previous: [...keep]}
    return {}
  })
  const del = vi.fn(async (endpoint: string) => {
    const name = /^loopress\/v1\/apps\/([^/]+)$/u.exec(endpoint)?.[1] ?? ''
    site.records = Object.fromEntries(Object.entries(site.records).filter(([key]) => key !== name))
    site.disk = Object.fromEntries(Object.entries(site.disk).filter(([key]) => key !== name))
    return {}
  })
  return {delete: del, get, post, put}
}

// A build committed on the site by someone else (CI, a teammate): no snapshot on this machine has it.
function pushedElsewhere(site: Site, name: string, buildId: string, files: Record<string, string>): void {
  site.disk[name] = {...files}
  site.records[name] = {
    buildId,
    files: Object.entries(files).map(([path, content]) => ({path, sha256: sha256(content), size: content.length})),
    name,
    previous: [],
  }
}

// What a visitor gets: the committed build's files, read off the disk.
function served(site: Site, name: string): Record<string, string> {
  const record = site.records[name]
  return Object.fromEntries((record?.files ?? []).map((file) => [file.path, site.disk[name]?.[file.path] ?? '(missing)']))
}

const ConcreteRollback = Rollback as unknown as CommandClass<Omit<LoopressCommand, 'run'> & {run(): Promise<RollbackResult>}>

describe('app rollback', () => {
  let dir: string

  function command<T>(Command: new (argv: string[], config: typeof fakeOclifConfig) => T, wp: ReturnType<typeof fakeSite>, warn = vi.fn()): T {
    const cmd = new Command([], fakeOclifConfig)
    silenceLogs(cmd as unknown as LoopressCommand)
    Object.assign(cmd as Record<string, unknown>, {
      dryRun: false,
      async guardProductionPush() {},
      localConfig: {rootDir: dir},
      async recordDeployment() {},
      async recordSuccess() {},
      siteConfig: makeEnv('staging'),
      warn,
      wpClient: wp,
      yes: false,
    })
    return cmd
  }

  async function push(wp: ReturnType<typeof fakeSite>, warn = vi.fn()): Promise<void> {
    const cmd = command(Push as unknown as new (argv: string[], config: typeof fakeOclifConfig) => {run(): Promise<unknown>}, wp, warn)
    Object.assign(cmd, {parse: async () => ({args: {}, flags: {build: false}})})
    await cmd.run()
  }

  // A built app: index.html loading main.js, plus the extra files given.
  function build(files: Record<string, string>, name = 'search'): void {
    const dist = join(dir, 'apps', name, 'dist')
    rmSync(dist, {force: true, recursive: true})
    mkdirSync(dist, {recursive: true})
    writeFileSync(join(dir, 'apps', name, 'loopress.app.json'), '{}\n')
    writeFileSync(join(dist, 'index.html'), '<script type="module" src="main.js"></script>')
    for (const [path, content] of Object.entries(files)) writeFileSync(join(dist, path), content)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-app-rollback-test-'))
    resetFakeOclifConfig()
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('puts back the build the last push replaced: a changed file, a file it removed and one it added', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    build({'chunk-old.js': 'old', 'main.js': 'v1'})
    await push(wp)
    const before = served(site, 'search')

    build({'chunk-new.js': 'new', 'main.js': 'v2'})
    await push(wp)
    expect(served(site, 'search')).not.toEqual(before)

    const warn = vi.fn()
    const result = await command(ConcreteRollback, wp, warn).run()

    expect(result.status).toBe('success')
    expect(served(site, 'search')).toEqual(before)
    expect(warn).not.toHaveBeenCalled()
  })

  it('reads the replaced build from the site when no snapshot of this machine has it, then restores it', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    pushedElsewhere(site, 'search', 'elsewhere', {'chunk.js': 'kept', 'index.html': '<script type="module" src="main.js"></script>', 'main.js': 'ci'})
    const before = served(site, 'search')
    build({'main.js': 'v2'})

    await push(wp)

    // Only what the push overwrites (main.js) or drops (chunk.js) is fetched, index.html is the same bytes as dist/.
    const fetched = wp.get.mock.calls.map(([endpoint]) => endpoint).filter((endpoint) => endpoint.includes('/asset?'))
    expect(fetched.toSorted((a, b) => a.localeCompare(b))).toEqual(['loopress/v1/apps/search/asset?path=chunk.js', 'loopress/v1/apps/search/asset?path=main.js'])
    expect(served(site, 'search')).not.toEqual(before)

    const result = await command(ConcreteRollback, wp).run()

    expect(result.status).toBe('success')
    expect(served(site, 'search')).toEqual(before)
  })

  it('still pushes when the site cannot give the replaced build back, and the rollback refuses with the reason, writing nothing', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    pushedElsewhere(site, 'search', 'elsewhere', {'index.html': 'x'})
    site.disk.search = {}
    build({'main.js': 'v2'})
    const warn = vi.fn()

    await push(wp, warn)

    expect(site.records.search?.buildId).not.toBe('elsewhere')
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^search: could not keep a copy of the build this push replaces/u))

    wp.put.mockClear()
    wp.post.mockClear()
    await expect(command(ConcreteRollback, wp).run()).rejects.toThrow(/for search \(could not read it from the site: not found\)\. Nothing was changed/u)
    expect(wp.put).not.toHaveBeenCalled()
    expect(wp.post).not.toHaveBeenCalled()
  })

  it('counts the build read from the site in the size cap: the push warns and succeeds, the rollback refuses before writing', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    pushedElsewhere(site, 'search', 'elsewhere', {'index.html': '<script type="module" src="main.js"></script>', 'main.js': 'a'.repeat(10 * 1024 * 1024)})
    build({'main.js': 'b'.repeat(10 * 1024 * 1024)})
    const warn = vi.fn()

    await push(wp, warn)

    expect(site.records.search?.buildId).not.toBe('elsewhere')
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^This push's bundles take 26\.7 MB, above the 25\.0 MB/u))

    wp.put.mockClear()
    wp.post.mockClear()
    await expect(command(ConcreteRollback, wp).run()).rejects.toThrow(/for search \(the bundles of that push took 26\.7 MB/u)
    expect(wp.put).not.toHaveBeenCalled()
    expect(wp.post).not.toHaveBeenCalled()
  })

  it('removes an app the push created, shown on the dry run, and never one that existed before', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    build({'main.js': 'v1'})
    await push(wp)
    const before = served(site, 'search')

    build({'main.js': 'v2'})
    build({'main.js': 'new'}, 'blog')
    await push(wp)
    expect(Object.keys(site.records).toSorted((a, b) => a.localeCompare(b))).toEqual(['blog', 'search'])

    const dryRun = command(ConcreteRollback, wp)
    Object.assign(dryRun, {dryRun: true})
    const preview = await dryRun.run()
    expect(preview.status).toBe('dry-run')
    expect(preview.restored?.removed).toEqual(['blog'])
    expect(vi.mocked(dryRun.log)).toHaveBeenCalledWith('Would remove what that push created: blog')
    expect(site.records.blog).toBeDefined()

    const warn = vi.fn()
    const result = await command(ConcreteRollback, wp, warn).run()

    expect(result.status).toBe('success')
    expect(wp.delete.mock.calls).toEqual([['loopress/v1/apps/blog']])
    expect(site.records.blog).toBeUndefined()
    expect(served(site, 'search')).toEqual(before)
    expect(warn).not.toHaveBeenCalled()
  })

  it('never removes an app that was on the site before the push, uploaded but not committed', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    build({'main.js': 'v1'})
    await push(wp)
    site.records.blog = {buildId: 'draft', committed: false, files: [], name: 'blog', previous: []}
    build({'main.js': 'v2'})
    build({'main.js': 'blog'}, 'blog')
    await push(wp)

    const rollback = command(ConcreteRollback, wp)
    Object.assign(rollback, {yes: true})
    await rollback.run()

    expect(wp.delete).not.toHaveBeenCalled()
    expect(site.records.blog).toBeDefined()
  })

  it('leaves an app the push did not create, even when the snapshot does not have it', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    build({'main.js': 'v1'})
    await push(wp)
    build({'main.js': 'v2'})
    await push(wp)
    pushedElsewhere(site, 'blog', 'later', {'index.html': 'x'})

    const warn = vi.fn()
    const rollback = command(ConcreteRollback, wp, warn)
    Object.assign(rollback, {yes: true})
    const result = await rollback.run()

    expect(result.status).toBe('success')
    expect(wp.delete).not.toHaveBeenCalled()
    expect(site.records.blog).toBeDefined()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/will NOT be removed \(blog\)/u))
  })
})
