import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

// Overridable for tests and for running against the workspace's dev build (cli/bin/dev.js)
// instead of a globally installed `lps`. Real usage relies on `lps` being on PATH, same as a
// human running it by hand.
const LPS_BIN = process.env.LPS_BIN ?? 'lps'

export interface LpsError {
  message: string
  name: string
}

export type LpsResult<T> = {data: T; ok: true} | {error: LpsError; ok: false}

// Every command reachable from here supports `--json` (see obsidian/Product/Loopress MCP.md):
// oclif prints the command's return value as JSON on success, and a caught error as
// `{error: {message, name}}` with a non-zero exit code. Node's promisified execFile attaches
// `stdout`/`stderr` to the rejection when the child exits non-zero, which is where that error
// envelope is read from below.
export async function runLps<T>(args: string[]): Promise<LpsResult<T>> {
  try {
    const {stdout} = await execFileAsync(LPS_BIN, [...args, '--json'], {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
    })
    return {data: JSON.parse(stdout) as T, ok: true}
  } catch (error) {
    const stdout = (error as {stdout?: string}).stdout
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout) as {error?: LpsError}
        if (parsed.error) return {error: parsed.error, ok: false}
      } catch {
        // stdout wasn't JSON (e.g. the process crashed before oclif's own error handling ran);
        // fall through to the generic error below.
      }
    }

    return {error: {message: (error as Error).message, name: 'ExecError'}, ok: false}
  }
}
