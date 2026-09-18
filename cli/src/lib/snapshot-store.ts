import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {type ResourceState} from './diff-state.js'

// How many snapshots `writeSnapshot` keeps per resource before pruning the oldest, so the
// cache directory doesn't grow without bound across a project's lifetime.
export const SNAPSHOT_RETENTION = 10

// One `lps <resource> push` recorded as a restore point. `beforeState` is the remote state
// read immediately before that push (the "left" side `lps diff` would have shown); `afterState`
// is the local state that was about to be pushed (the "right" side). Rolling back restores
// `beforeState`; comparing the environment's *current* state against `afterState` at rollback
// time is what detects whether anything else touched the environment since.
export type Snapshot = {
  afterState: Record<string, unknown>
  beforeState: Record<string, unknown>
  createdAt: string
  environment: string
  resource: string
}

export type SnapshotSummary = {createdAt: string; environment: string; id: string; resource: string}

// `ResourceState` (a Map, for O(1) lookups during comparison) has no direct JSON
// representation; snapshots round-trip through a plain object instead. Keys are sorted so two
// snapshots of the same state serialize identically (stable diffs, deterministic tests).
export function stateToRecord(state: ResourceState): Record<string, unknown> {
  return Object.fromEntries([...state].sort(([a], [b]) => a.localeCompare(b)))
}

export function recordToState(record: Record<string, unknown>): ResourceState {
  return new Map(Object.entries(record))
}

function snapshotsDir(rootDir: string, resource: string): string {
  return join(rootDir, '.loopress', 'snapshots', resource)
}

function snapshotPath(rootDir: string, resource: string, id: string): string {
  return join(snapshotsDir(rootDir, resource), `${id}.json`)
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

// Snapshot ids are the millisecond timestamp they were written at: sortable, unique enough for
// a single-machine CLI run, and directly usable as `--to <id>`.
function isSnapshotFilename(name: string): boolean {
  return /^\d+\.json$/.test(name)
}

// Writes a snapshot for `resource`, then prunes down to `retain` (oldest first), so a project
// that pushes often never accumulates an unbounded `.loopress/snapshots/` directory. Returns
// the new snapshot's id.
export async function writeSnapshot(options: {
  afterState: ResourceState
  beforeState: ResourceState
  environment: string
  resource: string
  retain?: number
  rootDir: string
}): Promise<string> {
  const {afterState, beforeState, environment, resource, retain = SNAPSHOT_RETENTION, rootDir} = options
  const dir = snapshotsDir(rootDir, resource)
  await mkdir(dir, {recursive: true})

  const id = String(Date.now())
  const snapshot: Snapshot = {
    afterState: stateToRecord(afterState),
    beforeState: stateToRecord(beforeState),
    createdAt: new Date().toISOString(),
    environment,
    resource,
  }

  await writeFile(join(dir, `${id}.json`), JSON.stringify(snapshot, null, 2) + '\n')
  await pruneSnapshots(rootDir, resource, retain)
  return id
}

// Newest first. A missing snapshots directory (never pushed, or pruned to nothing) reads as
// "no snapshots", not an error, the same ENOENT tolerance every resource-state provider gives
// a never-pulled local directory.
export async function listSnapshots(rootDir: string, resource: string): Promise<SnapshotSummary[]> {
  const dir = snapshotsDir(rootDir, resource)

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (error) {
    if (isEnoent(error)) return []
    throw error
  }

  const summaries: SnapshotSummary[] = []
  const snapshotFiles = entries.filter((entry) => isSnapshotFilename(entry))
  for (const entry of snapshotFiles) {
    const id = entry.slice(0, -'.json'.length)
    try {
      const parsed = JSON.parse(await readFile(join(dir, entry), 'utf8')) as Snapshot
      summaries.push({createdAt: parsed.createdAt, environment: parsed.environment, id, resource})
    } catch {
      // A corrupted or partially-written snapshot file (e.g. an interrupted write) is skipped
      // rather than failing the whole listing; it stays on disk for a human to inspect.
    }
  }

  return summaries.sort((a, b) => Number(b.id) - Number(a.id))
}

// `id` undefined reads the most recent snapshot (the common `lps <resource> rollback` case).
// Throws a message ready to show the user directly: no snapshots at all, or that specific id
// missing (renamed, deleted, or from a different resource's directory).
export async function readSnapshot(rootDir: string, resource: string, id?: string): Promise<Snapshot & {id: string}> {
  let targetId = id
  if (targetId === undefined) {
    const [latest] = await listSnapshots(rootDir, resource)
    if (!latest) {
      throw new Error(`No snapshots found for "${resource}". A snapshot is written automatically by \`lps ${resource} push\`.`)
    }

    targetId = latest.id
  }

  let raw: string
  try {
    raw = await readFile(snapshotPath(rootDir, resource, targetId), 'utf8')
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(`Snapshot "${targetId}" not found for "${resource}". Run \`lps ${resource} rollback --list\` to see what's available.`, {
        cause: error,
      })
    }

    throw error
  }

  return {...(JSON.parse(raw) as Snapshot), id: targetId}
}

export async function pruneSnapshots(rootDir: string, resource: string, retain: number): Promise<void> {
  const summaries = await listSnapshots(rootDir, resource)
  const stale = summaries.slice(retain)
  await Promise.all(stale.map(async (summary) => rm(snapshotPath(rootDir, resource, summary.id), {force: true})))
}
