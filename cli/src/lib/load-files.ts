import {readdir, readFile} from 'node:fs/promises'
import {extname, join} from 'node:path'

// Loads every `<extension>` file of a flat directory through `parse`. One file is read in
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
    // Parse and validate one file's raw content; throw to skip it.
    parse(raw: string, filePath: string): T
  },
): Promise<T[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

    throw error
  }

  const items: T[] = []
  for (const entry of entries) {
    if (extname(entry) !== options.extension) continue

    const filePath = join(dir, entry)
    try {
      items.push(options.parse(await readFile(filePath, 'utf8'), filePath))
    } catch (error) {
      options.onSkip(`Skipping "${filePath}": ${(error as Error).message}`)
    }
  }

  return items
}
