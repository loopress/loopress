import {type Dirent} from 'node:fs'
import {readdir} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'

// A directory that was simply never pulled/pushed to yet (ENOENT) means "nothing there",
// not an error, unlike any other failure to read it (permissions, not-a-directory, ...).
export async function readdirTolerant(dir: string): Promise<string[]>
export async function readdirTolerant(dir: string, options: {recursive?: boolean; withFileTypes: true}): Promise<Dirent[]>
export async function readdirTolerant(
  dir: string,
  options?: {recursive?: boolean; withFileTypes?: boolean},
): Promise<Dirent[] | string[]> {
  try {
    return options?.withFileTypes
      ? await readdir(dir, {recursive: options.recursive, withFileTypes: true})
      : await readdir(dir, {recursive: options?.recursive})
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

    throw error
  }
}

// Every file under `dir`, at any depth, as a path relative to `dir`. Always '/'-joined,
// never the OS separator: callers match these identities against server-sent filenames
// (which are always '/'-joined) or embed them in an API payload, so a Windows run must
// produce the exact same strings as a POSIX one. ENOENT on `dir` itself yields no files,
// same tolerance as readdirTolerant.
export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdirTolerant(dir, {recursive: true, withFileTypes: true})
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
}
