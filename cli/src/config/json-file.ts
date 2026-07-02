import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'

export function readJsonFile<T>(filePath: string): null | T {
  if (!existsSync(filePath)) return null

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

// Writes to a temp file then renames, so a crash never leaves a half-written config.
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), {recursive: true})
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  renameSync(tmpPath, filePath)
}
