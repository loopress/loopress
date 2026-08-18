import {type Dirent} from 'node:fs'
import {readdir} from 'node:fs/promises'

// A directory that was simply never pulled/pushed to yet (ENOENT) means "nothing there",
// not an error, unlike any other failure to read it (permissions, not-a-directory, ...).
export async function readdirTolerant(dir: string): Promise<string[]>
export async function readdirTolerant(dir: string, options: {withFileTypes: true}): Promise<Dirent[]>
export async function readdirTolerant(dir: string, options?: {withFileTypes?: boolean}): Promise<Dirent[] | string[]> {
  try {
    return options?.withFileTypes ? await readdir(dir, {withFileTypes: true}) : await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []

    throw error
  }
}
