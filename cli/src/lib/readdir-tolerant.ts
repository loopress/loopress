import {type Dirent} from 'node:fs'
import {readdir} from 'node:fs/promises'

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
