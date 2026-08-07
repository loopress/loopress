import {type Dirent} from 'node:fs'
import {readdir, readFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

// Recursion for the api resource type only (path-param route files can live in
// subdirectories, e.g. api/invoice-pdf/[order_id].php); every other resource type stays
// flat. withFileTypes avoids a second stat() per entry to tell files from directories.
async function walk(dir: string, extension: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, {withFileTypes: true})
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

    throw error
  }

  const filePaths: string[] = []
  for (const entry of entries) {
    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      filePaths.push(...(await walk(entryPath, extension)))
    } else if (extname(entry.name) === extension) {
      filePaths.push(entryPath)
    }
  }

  return filePaths
}

// Loads every `<extension>` file of a directory through `parse`. One file is read in
// isolation: a corrupted or hand-broken file (unreadable, bad JSON, failed validation) must
// only skip that file, never abort loading the rest of the directory, so `parse` throwing is
// reported through `onSkip` and the loop moves on. ENOENT on the directory itself means
// "nothing to load", not an error.
export async function loadFiles<T>(
  dir: string,
  options: {
    // With the leading dot (e.g. '.json').
    extension: string
    onSkip(message: string): void
    // Parse and validate one file's raw content; throw to skip it. filePath is the full path
    // (dir + any subdirectories when recursive: true), callers derive an identity from it.
    parse(raw: string, filePath: string): T
    // Defaults to false: a flat directory listing, the existing behavior every resource type
    // other than api relies on.
    recursive?: boolean
  },
): Promise<T[]> {
  let filePaths: string[]
  if (options.recursive) {
    filePaths = await walk(dir, options.extension)
  } else {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

      throw error
    }

    filePaths = entries.filter((entry) => extname(entry) === options.extension).map((entry) => join(dir, entry))
  }

  const items: T[] = []
  for (const filePath of filePaths) {
    try {
      items.push(options.parse(await readFile(filePath, 'utf8'), filePath))
    } catch (error) {
      options.onSkip(`Skipping "${filePath}": ${(error as Error).message}`)
    }
  }

  return items
}
