import {existsSync, mkdirSync, readFileSync} from 'node:fs'
import {dirname} from 'node:path'
import writeFileAtomic from 'write-file-atomic'

// Missing file or invalid JSON are treated as "no data" (returns null). Any other
// read failure (permissions, EISDIR, ...) propagates instead of being swallowed.
export function readJsonFile<T>(filePath: string): null | T {
  if (!existsSync(filePath)) return null

  const content = readFileSync(filePath, 'utf8')

  try {
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

// Mode 0o600 (owner read/write only) since these files hold auth tokens.
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), {recursive: true})
  writeFileAtomic.sync(filePath, JSON.stringify(data, null, 2), {mode: 0o600})
}
