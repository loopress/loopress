import {type Dirent} from 'node:fs'
import {readdir} from 'node:fs/promises'
import {extname, join} from 'node:path'

// A local file whose identity is no longer in the current remote list belongs to something
// deleted on WordPress. Left on disk, it would silently come back to life on the next push.
// Only files matching the naming convention pull/push themselves produce are candidates: the
// matcher returns null for anything else, so a hand-created file with an unrelated name is
// never at risk of being picked up. ENOENT on the directory means "nothing pulled yet",
// therefore no orphans.
export type OrphanMatcher = {
  // Accepted extensions, with the leading dot (e.g. ['.json']).
  extensions: string[]
  // Extracts the file's identity from its basename without extension; null = not ours.
  key(base: string): null | string
  // Defaults to false: a flat directory listing. Only the api resource type needs true, path-
  // param route files can live in subdirectories, e.g. api/invoice-pdf/[order_id].php.
  recursive?: boolean
}

// Same shape as load-files.ts's own walker, kept separate rather than shared: this one
// filters against a list of extensions (page/snippet pull need more than one), that one
// against a single extension, and reconciling the two would cost more than the ~15 duplicated
// lines it would save.
async function walk(dir: string, extensions: string[]): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, {withFileTypes: true})
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

    throw error
  }

  const relativePaths: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // join() builds the real OS path to actually walk, but the returned identity is always
      // '/'-joined regardless of platform: it's matched against `keep`, filenames the server
      // sends with '/', never the OS separator. join() here (backslash on Windows) would make
      // every nested file's identity never match, findOrphanedFiles() would then report a
      // live, kept file as orphaned and pull.ts would delete it.
      const nested = await walk(join(dir, entry.name), extensions)
      relativePaths.push(...nested.map((relativePath) => `${entry.name}/${relativePath}`))
    } else if (extensions.includes(extname(entry.name))) {
      relativePaths.push(entry.name)
    }
  }

  return relativePaths
}

export async function findOrphanedFiles(dir: string, keep: Set<string>, matcher: OrphanMatcher): Promise<string[]> {
  let files: string[]
  if (matcher.recursive) {
    files = await walk(dir, matcher.extensions)
  } else {
    try {
      files = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }
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
