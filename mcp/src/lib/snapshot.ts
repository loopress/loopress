import {copyFile, mkdir, mkdtemp, readdir, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

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
  } catch (error) {
    removeSnapshot(dest)
    throw error
  }

  return dest
}

/** Fire and forget: a leftover temp dir is harmless and the OS clears it eventually. */
export function removeSnapshot(dir: string): void {
  void rm(dir, {force: true, recursive: true}).catch(() => {})
}
