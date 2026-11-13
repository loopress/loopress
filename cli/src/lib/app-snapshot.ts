import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {z} from 'zod'

import {type AppFile} from './app-manifest.js'
import {type ResourceState} from './diff-state.js'
import {type ResourceStateProvider} from './resource-state.js'
import {type RollbackRestore} from './rollback-command.js'
import {type Snapshot} from './snapshot-store.js'
import {type WpClient} from './wp-client.js'

// The snapshot resource of `lps app push`. One snapshot per push: the state is every committed
// app on the site (id: the app name, value: its manifest), the payload the content of the files
// that state names, since the site cannot give a bundle back once a commit overwrote it.
export const APP_RESOURCE = 'app'

// Above this many bytes (the bundle pushed plus the files of the build it replaces), an app's
// files are left out of the snapshot: kept for every push, they would fill `.loopress/` fast.
export const APP_SNAPSHOT_MAX_BYTES = 20 * 1024 * 1024

const APP_FILE = z.object({path: z.string(), sha256: z.string(), size: z.number()})
const MANIFEST = z.looseObject({files: z.array(APP_FILE), name: z.string()})
// File content (base64) by sha256: a file shared by the two builds is stored once.
const BLOBS = z.record(z.string(), z.string())

type RemoteApp = {committed: boolean; name: string}

export function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export async function appState(wp: WpClient): Promise<ResourceState> {
  const apps = await wp.get<RemoteApp[]>('loopress/v1/apps')
  const state: ResourceState = new Map()
  for (const app of apps.filter((entry) => entry.committed).toSorted((a, b) => a.name.localeCompare(b.name))) {
    state.set(app.name, await wp.get<Record<string, unknown>>(`loopress/v1/apps/${app.name}/manifest`))
  }

  return state
}

// Not in RESOURCE_STATE_PROVIDERS: `lps diff` compares no local directory for apps. `dirKind`
// only satisfies the type, the rollback reads no local file.
export const appProvider: ResourceStateProvider = {
  dirKind: 'apps',
  async local() {
    throw new Error('Apps are only compared on the site.')
  },
  remote: async (wp) => appState(wp),
  resource: APP_RESOURCE,
  title: 'Apps',
}

export function manifestFiles(value: unknown): AppFile[] {
  const parsed = MANIFEST.safeParse(value)
  return parsed.success ? parsed.data.files : []
}

export function snapshotBlobs(snapshot: Snapshot | undefined): Record<string, string> {
  const parsed = BLOBS.safeParse(snapshot?.payload?.blobs)
  return parsed.success ? parsed.data : {}
}

// The files a restore to `target` uploads: every one the current build has not at that path with
// that content. A file only the build before the current one had may still be on the site (the
// commit keeps one previous generation), but the site does not say: it is uploaded again.
function filesToUpload(target: AppFile[], current: unknown): AppFile[] {
  const onSite = new Map(manifestFiles(current).map((file) => [file.path, file.sha256]))
  return target.filter((file) => onSite.get(file.path) !== file.sha256)
}

type RestorePlan = {files: AppFile[]; manifest: Record<string, unknown>; name: string}

// What restoring `ids` writes, and the apps whose files the snapshot does not hold.
function restorePlan(ids: string[], current: ResourceState, snapshot: Snapshot, blobs: Record<string, string>): {missing: string[]; plans: RestorePlan[]} {
  const plans: RestorePlan[] = []
  const missing: string[] = []
  for (const name of ids) {
    const target = snapshot.beforeState[name]
    if (isDeepStrictEqual(target, current.get(name))) continue
    const parsed = MANIFEST.safeParse(target)
    if (!parsed.success) throw new Error(`The snapshot's manifest of app "${name}" is unreadable.`)
    const files = filesToUpload(parsed.data.files, current.get(name))
    const absent = files.filter((file) => blobs[file.sha256] === undefined)
    if (absent.length > 0) missing.push(`${name} (${absent.map((file) => file.path).join(', ')})`)
    // The manifest endpoint answers null for an unset field, commit takes the field absent.
    const manifest = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== null))
    plans.push({files, manifest, name})
  }

  return {missing, plans}
}

// Restores each app whose manifest differs from the snapshot: uploads its missing files from the
// snapshot, then commits the snapshot's manifest. An app the snapshot does not have (the push
// created it) is removed. Checked before any write: an app whose files the snapshot does not hold
// (a bundle above the size cap) fails the whole rollback rather than half of it.
export const restoreApps: RollbackRestore = async ({current, ids, log, snapshot, wp}) => {
  const blobs = snapshotBlobs(snapshot)
  const {missing, plans} = restorePlan(ids, current, snapshot, blobs)
  if (missing.length > 0) {
    throw new Error(
      `This snapshot holds no copy of these files, nothing was restored: ${missing.join('; ')}. ` +
        `Their bundle was above the ${APP_SNAPSHOT_MAX_BYTES / 1024 / 1024} MB snapshot cap or could not be read from the site at push time: check out the previous build in Git and run \`lps app push\`.`,
    )
  }

  for (const {files, manifest, name} of plans) {
    for (const file of files) {
      await wp.put(`loopress/v1/apps/${name}/assets`, {content: blobs[file.sha256], encoding: 'base64', path: file.path})
    }

    await wp.post(`loopress/v1/apps/${name}/commit`, manifest)
    log(`${name}: restored build ${String(manifest.buildId)} (${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded)`)
  }

  const kept = new Set(ids)
  for (const name of current.keys()) {
    if (kept.has(name)) continue
    await wp.delete(`loopress/v1/apps/${name}`)
    log(`${name}: removed (not in the snapshot)`)
  }
}
