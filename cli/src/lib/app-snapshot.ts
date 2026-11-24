import {Buffer} from 'node:buffer'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'

import {pluralize} from '../utils/pluralize.js'
import {type AppManifest} from './app-manifest.js'
import {type ResourceState} from './diff-state.js'
import {isRecord} from './narrow.js'
import {type ResourceStateProvider} from './resource-state.js'
import {type RollbackRestore} from './rollback-command.js'
import {listSnapshots, readSnapshot, type Snapshot} from './snapshot-store.js'
import {isNotFoundError, type WpClient} from './wp-client.js'

// The snapshot resource of `lps app push`.
export const APP_RESOURCE = 'app'

// The most bundle bytes (base64, both builds) one app snapshot keeps. A push whose bundles are
// larger keeps none, and says so: the snapshot store is plain JSON files on the developer's machine.
export const APP_SNAPSHOT_MAX_BYTES = 25 * 1024 * 1024

const FILE = z.object({path: z.string(), sha256: z.string()})
const FILES = z.object({files: z.array(FILE)})
const BUNDLE = z.object({buildId: z.string(), files: z.record(z.string(), z.string())})
const APP_BUNDLES = z.record(z.string(), z.object({after: BUNDLE, before: BUNDLE.optional()}))
const APP_PAYLOAD = z.object({bundles: APP_BUNDLES, created: z.array(z.string()).optional(), missing: z.record(z.string(), z.string()).optional()})

// One app's built files, base64 by path, with the build id they make.
export type AppBundle = z.infer<typeof BUNDLE>
export type AppBundles = z.infer<typeof APP_BUNDLES>
export type AppPayload = z.infer<typeof APP_PAYLOAD>

type RemoteApp = {committed: boolean; name: string}
type RemoteManifest = Partial<AppManifest> & {crossOrigin?: null | string}

// The manifest the site serves (AppsController::get_manifest), as compared and committed back.
function manifestState(manifest: RemoteManifest): Record<string, unknown> {
  return {
    buildId: manifest.buildId ?? null,
    crossOrigin: manifest.crossOrigin ?? null,
    entry: manifest.entry ?? {scripts: [], styles: []},
    files: manifest.files ?? [],
    mountSelector: manifest.mountSelector ?? null,
    routing: manifest.routing ?? 'hash',
  }
}

// Every committed app on the site, keyed by name. An app uploaded but never committed has no
// manifest to restore, it is left out, but still added to `names` (every app on the site) when given.
export async function appsState(wp: WpClient, names?: Set<string>): Promise<ResourceState> {
  const state: ResourceState = new Map()
  const apps = await wp.get<RemoteApp[]>('loopress/v1/apps')
  for (const app of apps) {
    names?.add(app.name)
    if (!app.committed) continue
    try {
      state.set(app.name, manifestState(await wp.get<RemoteManifest>(`loopress/v1/apps/${app.name}/manifest`)))
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
  }

  return state
}

export const appProvider: ResourceStateProvider = {
  dirKind: 'apps',
  async local() {
    throw new Error('Apps are only compared on the site.')
  },
  remote: async (wp) => appsState(wp),
  resource: APP_RESOURCE,
  title: 'Apps',
}

function buildIdOf(value: unknown): string | undefined {
  return isRecord(value) && typeof value.buildId === 'string' ? value.buildId : undefined
}

export async function readBundle(distDir: string, manifest: AppManifest): Promise<AppBundle> {
  const files: Record<string, string> = Object.fromEntries(
    await Promise.all(manifest.files.map(async (file) => [file.path, (await readFile(join(distDir, file.path))).toString('base64')] as const)),
  )
  return {buildId: manifest.buildId, files}
}

// The bundle of `name` with this build id kept by a snapshot of this machine, newest first:
// the one a push sent, or the one before it (put back by a rollback since).
async function findBundle(rootDir: string, environment: string, name: string, buildId: string): Promise<AppBundle | undefined> {
  for (const summary of await listSnapshots(rootDir, APP_RESOURCE, environment)) {
    const snapshot = await readSnapshot(rootDir, APP_RESOURCE, environment, summary.id)
    const bundles = APP_BUNDLES.safeParse(snapshot.payload?.bundles)
    const entry = bundles.success ? own(bundles.data, name) : undefined
    for (const bundle of [entry?.after, entry?.before]) {
      if (bundle?.buildId === buildId) return bundle
    }
  }

  return undefined
}

// The build `lps app push` is about to replace (`before`, the site's committed manifest), read
// before the upload overwrites it: from an earlier snapshot of this machine when one has it,
// otherwise from the site. Only the files the new build overwrites or drops are fetched, the
// others are the same bytes as in dist/. Undefined when the push replaces nothing (a new app,
// the same build). Throws when the site cannot give a file back as its manifest lists it.
export async function replacedBundle(options: {
  after: AppManifest
  before: unknown
  distDir: string
  environment: string
  rootDir: string
  wp: WpClient
}): Promise<AppBundle | undefined> {
  const {after, before, distDir, environment, rootDir, wp} = options
  const buildId = buildIdOf(before)
  if (buildId === undefined || buildId === after.buildId) return undefined

  const kept = await findBundle(rootDir, environment, after.name, buildId)
  if (kept) return kept

  const unchanged = new Map(after.files.map((file) => [file.path, file.sha256]))
  const files: Record<string, string> = {}
  for (const file of filesOf(before)) {
    if (unchanged.get(file.path) === file.sha256) {
      files[file.path] = (await readFile(join(distDir, file.path))).toString('base64')
      continue
    }

    const {content} = await wp.get<{content: string}>(`loopress/v1/apps/${after.name}/asset?path=${encodeURIComponent(file.path)}`)
    if (createHash('sha256').update(Buffer.from(content, 'base64')).digest('hex') !== file.sha256) {
      throw new Error(`${file.path} on the site does not match the build it has committed`)
    }

    files[file.path] = content
  }

  return {buildId, files}
}

export function megabytes(size: number): string {
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

// An own entry of a record keyed by app name: `constructor` is a valid app name.
function own<T>(record: Record<string, T> | undefined, name: string): T | undefined {
  return record && Object.hasOwn(record, name) ? record[name] : undefined
}

function bundleBytes(bundle: AppBundle): number {
  return Object.values(bundle.files).reduce((total, content) => total + content.length, 0)
}

// The snapshot payload of one `lps app push`: each pushed app's bundle and the bundle it
// replaced (see replacedBundle), the apps it created (a rollback removes them) and, by app,
// why the replaced build has no copy (`missing`). Above APP_SNAPSHOT_MAX_BYTES (`overCap`) no
// bundle is kept: a rollback still removes the created apps, and refuses the others.
export function appSnapshotPayload(options: {
  created: string[]
  missing: Record<string, string>
  pushed: AppBundles
  replaced: Record<string, AppBundle>
}): {bytes: number; overCap: boolean; payload: AppPayload} {
  const {created, missing, pushed, replaced} = options
  const bundles: AppBundles = {}
  let bytes = 0
  for (const [name, {after}] of Object.entries(pushed)) {
    const before = own(replaced, name)
    bundles[name] = {after, ...(before && {before})}
    bytes += bundleBytes(after) + (before ? bundleBytes(before) : 0)
  }

  if (bytes <= APP_SNAPSHOT_MAX_BYTES) return {bytes, overCap: false, payload: {bundles, created, missing}}

  const reason = `the bundles of that push took ${megabytes(bytes)}, above the ${megabytes(APP_SNAPSHOT_MAX_BYTES)} a snapshot keeps`
  return {
    bytes,
    overCap: true,
    payload: {bundles: {}, created, missing: {...missing, ...Object.fromEntries(Object.keys(pushed).map((name) => [name, reason]))}},
  }
}

function filesOf(value: unknown): Array<{path: string; sha256: string}> {
  const parsed = FILES.safeParse(value)
  return parsed.success ? parsed.data.files : []
}

// The apps the push of this snapshot created, the ones its rollback removes.
export function createdApps(snapshot: Snapshot): string[] {
  return APP_PAYLOAD.safeParse(snapshot.payload).data?.created ?? []
}

// Puts back each app's previous build: uploads every file of it, then commits the previous
// manifest (the site then removes what that build does not have, keeping one generation of
// grace), and removes the apps that push created (`remove`). Refuses before writing anything
// when the snapshot has no full copy of a build to put back.
export const restoreApps: RollbackRestore = async ({ids, log, remove = [], snapshot, wp}) => {
  const payload = APP_PAYLOAD.safeParse(snapshot.payload).data
  const bundles = payload?.bundles ?? {}
  const plan: Array<{bundle: AppBundle; files: Array<{path: string}>; manifest: Record<string, unknown>; name: string}> = []
  const missing: string[] = []

  for (const name of ids) {
    const manifest = snapshot.beforeState[name]
    const buildId = buildIdOf(manifest)
    const entry = own(bundles, name)
    const bundle = [entry?.before, entry?.after].find((candidate) => candidate !== undefined && candidate.buildId === buildId)
    // Every file, not only those the committed manifest lists with another hash: a push that
    // failed before its commit can leave other bytes on disk under a committed path.
    const files = filesOf(manifest)
    const absent = bundle ? files.find((file) => bundle.files[file.path] === undefined) : undefined
    if (absent !== undefined || !bundle || !isRecord(manifest)) {
      const reason = own(payload?.missing, name) ?? (absent ? `the snapshot has no copy of ${absent.path}` : 'the snapshot has no copy of it')
      missing.push(`${name} (${reason})`)
      continue
    }

    plan.push({bundle, files, manifest, name})
  }

  if (missing.length > 0) {
    throw new Error(
      `No copy of the build the site had before that push for ${missing.join(', ')}. Nothing was changed: ` +
        'check out that build in Git and run `lps app push` instead.',
    )
  }

  for (const {bundle, files, manifest, name} of plan) {
    for (const file of files) {
      await wp.put(`loopress/v1/apps/${name}/assets`, {content: bundle.files[file.path], encoding: 'base64', path: file.path})
    }

    const {crossOrigin, ...rest} = manifest
    await wp.post(`loopress/v1/apps/${name}/commit`, {...rest, ...(typeof crossOrigin === 'string' && {crossOrigin}), name})
    log(`${name}: uploaded ${pluralize(files.length, 'file')}, committed build ${buildIdOf(manifest)}`)
  }

  for (const name of remove) {
    await wp.delete(`loopress/v1/apps/${name}`)
    log(`${name}: removed, that push created it`)
  }
}
