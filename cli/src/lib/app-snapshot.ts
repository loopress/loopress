import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'

import {pluralize} from '../utils/pluralize.js'
import {type AppManifest} from './app-manifest.js'
import {type ResourceState} from './diff-state.js'
import {isRecord} from './narrow.js'
import {type ResourceStateProvider} from './resource-state.js'
import {type RollbackRestore} from './rollback-command.js'
import {listSnapshots, readSnapshot} from './snapshot-store.js'
import {isNotFoundError, type WpClient} from './wp-client.js'

// The snapshot resource of `lps app push`.
export const APP_RESOURCE = 'app'

// The most bundle bytes (base64) one app snapshot keeps. A push whose bundles are larger
// saves no snapshot, and says so: the snapshot store is plain JSON files on the developer's machine.
export const APP_SNAPSHOT_MAX_BYTES = 25 * 1024 * 1024

const FILE = z.object({path: z.string(), sha256: z.string()})
const FILES = z.object({files: z.array(FILE)})
const BUNDLE = z.object({buildId: z.string(), files: z.record(z.string(), z.string())})
const APP_BUNDLES = z.record(z.string(), z.object({after: BUNDLE, before: BUNDLE.optional()}))

// One app's built files, base64 by path, with the build id they make.
export type AppBundle = z.infer<typeof BUNDLE>
export type AppBundles = z.infer<typeof APP_BUNDLES>

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
// manifest to restore, it is left out.
export async function appsState(wp: WpClient): Promise<ResourceState> {
  const state: ResourceState = new Map()
  const apps = await wp.get<RemoteApp[]>('loopress/v1/apps')
  for (const app of apps) {
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
  const files: Record<string, string> = {}
  for (const file of manifest.files) files[file.path] = (await readFile(join(distDir, file.path))).toString('base64')
  return {buildId: manifest.buildId, files}
}

// The bundle of `name` with this build id kept by a snapshot of this machine, newest first:
// the one a push sent, or the one before it (put back by a rollback since).
async function findBundle(rootDir: string, environment: string, name: string, buildId: string): Promise<AppBundle | undefined> {
  for (const summary of await listSnapshots(rootDir, APP_RESOURCE, environment)) {
    const snapshot = await readSnapshot(rootDir, APP_RESOURCE, environment, summary.id)
    const bundles = APP_BUNDLES.safeParse(snapshot.payload?.bundles)
    const entry = bundles.success ? bundles.data[name] : undefined
    for (const bundle of [entry?.after, entry?.before]) {
      if (bundle?.buildId === buildId) return bundle
    }
  }

  return undefined
}

function bundleBytes(bundle: AppBundle): number {
  return Object.values(bundle.files).reduce((total, content) => total + content.length, 0)
}

// The snapshot payload of one `lps app push`: each pushed app's bundle, and, when an earlier
// snapshot still has it, the bundle the site had before (same build id). `skipped` when the
// bundles are above APP_SNAPSHOT_MAX_BYTES: no snapshot is written then.
export async function appSnapshotPayload(options: {
  beforeState: ResourceState
  environment: string
  pushed: AppBundles
  rootDir: string
}): Promise<{bytes: number; payload?: {bundles: AppBundles}}> {
  const {beforeState, environment, pushed, rootDir} = options
  const bundles: AppBundles = {}
  let bytes = 0
  for (const [name, {after}] of Object.entries(pushed)) {
    const beforeId = buildIdOf(beforeState.get(name))
    const before = beforeId === undefined || beforeId === after.buildId ? undefined : await findBundle(rootDir, environment, name, beforeId)
    bundles[name] = {after, ...(before && {before})}
    bytes += bundleBytes(after) + (before ? bundleBytes(before) : 0)
  }

  return bytes > APP_SNAPSHOT_MAX_BYTES ? {bytes} : {bytes, payload: {bundles}}
}

function filesOf(value: unknown): Array<{path: string; sha256: string}> {
  const parsed = FILES.safeParse(value)
  return parsed.success ? parsed.data.files : []
}

// Puts back each app's previous build: uploads every file of it, then commits the previous manifest (the site then removes what that build does
// not have, keeping one generation of grace). An app the snapshot has no copy of is reported.
export const restoreApps: RollbackRestore = async ({ids, log, snapshot, wp}) => {
  const parsed = APP_BUNDLES.safeParse(snapshot.payload?.bundles)
  const bundles = parsed.success ? parsed.data : {}
  const missing: string[] = []

  for (const name of ids) {
    const manifest = snapshot.beforeState[name]
    const buildId = buildIdOf(manifest)
    const entry = bundles[name]
    const bundle = [entry?.before, entry?.after].find((candidate) => candidate !== undefined && candidate.buildId === buildId)
    if (!bundle || !isRecord(manifest)) {
      missing.push(name)
      continue
    }

    // Every file, not only those the committed manifest lists with another hash: a push that
    // failed before its commit can leave other bytes on disk under a committed path.
    const files = filesOf(manifest)
    for (const file of files) {
      const content = bundle.files[file.path]
      if (content === undefined) throw new Error(`${name}: the snapshot has no copy of ${file.path}.`)
      await wp.put(`loopress/v1/apps/${name}/assets`, {content, encoding: 'base64', path: file.path})
    }

    const {crossOrigin, ...rest} = manifest
    await wp.post(`loopress/v1/apps/${name}/commit`, {...rest, ...(typeof crossOrigin === 'string' && {crossOrigin}), name})
    log(`${name}: uploaded ${pluralize(files.length, 'file')}, committed build ${buildId}`)
  }

  if (missing.length > 0) {
    throw new Error(
      `No copy of the build the site had before that push for ${missing.join(', ')} (its first push from this machine, ` +
        'or a build pushed from somewhere else since): check out that build in Git and run `lps app push` instead.',
    )
  }
}
