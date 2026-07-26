import {readdir} from 'node:fs/promises'
import {extname} from 'node:path'

// A local file whose identity is no longer in the current remote list belongs to something
// deleted on WordPress. Left on disk, it would silently come back to life on the next push.
// Only files matching the naming convention pull/push themselves produce are candidates: the
// matcher returns null for anything else, so a hand-created file with an unrelated name is
// never at risk of being picked up. ENOENT on the directory means "nothing pulled yet",
// therefore no orphans.
export interface OrphanMatcher {
  // Accepted extensions, with the leading dot (e.g. ['.json']).
  extensions: string[]
  // Extracts the file's identity from its basename without extension; null = not ours.
  key(base: string): null | string
}

export async function findOrphanedFiles(dir: string, keep: Set<string>, matcher: OrphanMatcher): Promise<string[]> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

    throw error
  }

  return files.filter((file) => {
    const ext = extname(file)
    if (!matcher.extensions.includes(ext)) return false

    const key = matcher.key(file.slice(0, -ext.length))
    return key !== null && !keep.has(key)
  })
}

// The `<id>-<slug>.*` filename convention: the numeric prefix is the identity.
export function numericPrefixKey(base: string): null | string {
  const match = /^(\d+)-/.exec(base)
  return match?.[1] ?? null
}

// The `<key>.<ext>` filename convention: the whole basename is the identity.
export function basenameKey(base: string): string {
  return base
}
