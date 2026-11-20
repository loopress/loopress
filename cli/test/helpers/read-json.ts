import {readFileSync} from 'node:fs'
import {join} from 'node:path'

// Reads back a JSON file a command wrote. Returns `any` on purpose: callers assert on
// the parsed shape, or cast it, in place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the whole point is an untyped parse result
export function readJson(...path: string[]): any {
  return JSON.parse(readFileSync(join(...path), 'utf8'))
}
