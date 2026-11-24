import {createHash} from 'node:crypto'
import {copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join, relative} from 'node:path'

// Large, machine-generated, or irrelevant to any push: copying them would make every preview
// slow for no gain.
const SKIP_TOP_LEVEL = new Set(['.git', 'node_modules', 'vendor', 'dist', '.next', 'coverage', '.turbo'])

// A loopress project (loopress.json plus api/, hooks/, snippets/, forms/, acf/ ...) is small by
// nature: PHP snippet files and JSON. If a filtered copy exceeds this, something unexpected is
// in the tree; fail loudly rather than freeze half of it.
const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024

async function copyTree(src: string, dest: string, filterTopLevel: boolean): Promise<number> {
  await mkdir(dest, {recursive: true})

  let bytes = 0
  for (const entry of await readdir(src, {withFileTypes: true})) {
    if (filterTopLevel && SKIP_TOP_LEVEL.has(entry.name)) continue

    const from = join(src, entry.name)
    const to = join(dest, entry.name)

    if (entry.isDirectory()) {
      bytes += await copyTree(from, to, false)
    } else if (entry.isFile()) {
      await copyFile(from, to)
      bytes += (await stat(from)).size
    }
    // Symlinks, sockets and fifos are skipped: a loopress project has none, and following a
    // symlink could pull in something huge or outside the tree.

    if (bytes > MAX_SNAPSHOT_BYTES) {
      throw new Error(
        'Working directory is too large to snapshot for a safe apply. Run the push directly with the lps CLI.',
      )
    }
  }

  return bytes
}

/**
 * Copy the working directory to a throwaway temp dir. The two-call mutating handshake applies
 * from this copy, not a fresh disk read, so a file swapped between preview and confirm cannot
 * change what gets pushed (F28).
 *
 * ponytail: freezes `sourceDir` only. An `lps --path` pointing outside it, or a `loopress.json`
 * that repoints a resource dir elsewhere, is still read live at apply time. Tighten by having
 * the CLI emit a content digest the handshake can compare. Uses a hand-rolled recursive copy
 * because `fs.cp` is still flagged experimental at the package's Node floor.
 */
export async function createSnapshot(sourceDir: string): Promise<string> {
  const dest = await mkdtemp(join(tmpdir(), 'loopress-mcp-'))

  try {
    await copyTree(sourceDir, dest, true)
    // The command may need the project's git history (the deployment record names the commit).
    // A symlink keeps .git reachable without copying it; the walkers below skip symlinks.
    await symlink(join(sourceDir, '.git'), join(dest, '.git')).catch(() => {})
    origins.set(dest, {baseline: await hashTree(dest), source: sourceDir})
  } catch (error) {
    removeSnapshot(dest)
    throw error
  }

  return dest
}

/** Fire and forget: a leftover temp dir is harmless and the OS clears it eventually. */
export function removeSnapshot(dir: string): void {
  origins.delete(dir)
  void rm(dir, {force: true, recursive: true}).catch(() => {})
}

interface Origin {
  baseline: Map<string, string>
  source: string
}

// Snapshot dir -> the project it was taken from and the content hash of every file at that time.
const origins = new Map<string, Origin>()

async function hashFile(path: string): Promise<string | undefined> {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex')
  } catch {
    return undefined
  }
}

async function hashTree(root: string, dir = root, out = new Map<string, string>()): Promise<Map<string, string>> {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await hashTree(root, full, out)
    else if (entry.isFile()) out.set(relative(root, full), (await hashFile(full)) ?? '')
  }

  return out
}

export interface WritebackResult {
  /** Files the command wrote that were not copied because the project's copy changed since the preview. */
  conflicts: string[]
  copied: string[]
}

/**
 * After a successful apply, copy back to the project what the command created or changed in the
 * snapshot (id sidecars, renames, `.loopress/` snapshots and baselines). A file the user edited in
 * the project since the preview is never overwritten: it is reported as a conflict.
 */
export async function writeBack(snapshotDir: string): Promise<WritebackResult> {
  const origin = origins.get(snapshotDir)
  const result: WritebackResult = {conflicts: [], copied: []}
  if (!origin) return result

  const now = await hashTree(snapshotDir)
  for (const [path, hash] of now) {
    if (origin.baseline.get(path) === hash) continue

    const target = join(origin.source, path)
    const current = await hashFile(target)
    const before = origin.baseline.get(path)
    // The project's copy must still be what the preview saw (or still absent, for a new file).
    if (current !== before && current !== hash) {
      result.conflicts.push(path)
      continue
    }

    if (current === hash) continue
    await mkdir(dirname(target), {recursive: true})
    await copyFile(join(snapshotDir, path), target)
    result.copied.push(path)
  }

  // A file the command removed or renamed away: remove it from the project too, but only if the
  // project's copy is still what the preview saw.
  for (const [path, before] of origin.baseline) {
    if (now.has(path)) continue
    const target = join(origin.source, path)
    const current = await hashFile(target)
    if (current === undefined) continue
    if (current !== before) {
      result.conflicts.push(path)
      continue
    }

    await rm(target, {force: true})
    result.copied.push(path)
  }

  return result
}
