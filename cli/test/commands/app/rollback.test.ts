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
import {listSnapshots} from '../../../src/lib/snapshot-store.js'
import {fakeOclifConfig, resetFakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

vi.mock('../../../src/lib/interactive.js', () => ({isInteractive: () => false}))

type Manifest = {buildId: string; files: Array<{path: string; sha256: string; size: number}>; name: string}
type Site = {disk: Record<string, Record<string, string>>; records: Record<string, Manifest & {previous: string[]}>}

const notFound = new Error('not found', {cause: {response: {statusCode: 404}}})
const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex')

// A fake AppsController: a commit needs every file uploaded with its hash, keeps the files of
// the manifest and of the previous build, removes the rest.
function fakeSite(site: Site) {
  const route = (endpoint: string) => /^loopress\/v1\/apps\/([^/]+)\/(\w+)$/.exec(endpoint) ?? []
  const get = vi.fn(async (endpoint: string) => {
    if (endpoint === 'loopress/v1/apps') return Object.keys(site.records).map((name) => ({committed: true, name}))
    const record = site.records[route(endpoint)[1] ?? '']
    if (!record) throw notFound
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
  return {get, post, put}
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
  function build(files: Record<string, string>): void {
    const dist = join(dir, 'apps', 'search', 'dist')
    rmSync(dist, {force: true, recursive: true})
    mkdirSync(dist, {recursive: true})
    writeFileSync(join(dir, 'apps', 'search', 'loopress.app.json'), '{}\n')
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

  it('refuses, and says how to undo it, when the build before the push was not pushed from this machine', async () => {
    const site: Site = {disk: {search: {'index.html': 'x'}}, records: {search: {buildId: 'elsewhere', files: [{path: 'index.html', sha256: sha256('x'), size: 1}], name: 'search', previous: []}}}
    const wp = fakeSite(site)
    build({'main.js': 'v1'})
    await push(wp)

    await expect(command(ConcreteRollback, wp).run()).rejects.toThrow(/No copy of the build the site had before that push for search/)
  })

  it('saves no snapshot, and says so, when the bundle is above the size cap, the push still succeeds', async () => {
    const site: Site = {disk: {}, records: {}}
    const wp = fakeSite(site)
    build({'main.js': 'x'.repeat(26 * 1024 * 1024)})
    const warn = vi.fn()

    await push(wp, warn)

    expect(site.records.search).toBeDefined()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^No rollback snapshot saved for this push: its bundles take/))
    expect(await listSnapshots(dir, 'app', 'staging')).toEqual([])
  })
})
