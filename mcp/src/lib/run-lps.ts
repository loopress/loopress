import {createRequire} from 'node:module'
import path from 'node:path'
import {x} from 'tinyexec'

// Spawn the CLI's JS entry point with the Node already running this server, not the `lps`
// shim: on Windows, npm installs `lps` as `lps.cmd`, which plain execFile can't find (ENOENT, no
// PATHEXT lookup) nor run (EINVAL since CVE-2024-27980). Only the fallback goes through the
// shim, and tinyexec (below) handles the PATHEXT lookup and cmd.exe escaping for it.
// LPS_BIN overrides it (tests, the workspace's dev build at cli/bin/dev.js): a .js file runs
// under Node, anything else is spawned as is.
export function resolveLps(override = process.env.LPS_BIN): {file: string; pre: string[]} {
  if (override) return /\.[cm]?js$/.test(override) ? {file: process.execPath, pre: [override]} : {file: override, pre: []}
  try {
    // A global install puts @loopress/cli next to @loopress/mcp in the same node_modules.
    const pkg = createRequire(import.meta.url).resolve('@loopress/cli/package.json')
    return {file: process.execPath, pre: [path.join(path.dirname(pkg), 'bin', 'run.js')]}
  } catch {
    // CLI not resolvable from here (pnpm, Volta, a separate npm prefix): `lps` on PATH.
    return {file: 'lps', pre: []}
  }
}

const LPS = resolveLps()

// Generous enough for a sequential Listr push/pull over many files on a slow site, while still
// bounding a genuinely hung request (e.g. an unreachable WordPress site). Callers whose command
// has its own longer server-side ceiling (composer push's install, see composer.ts) pass a
// larger explicit override.
const DEFAULT_TIMEOUT_MS = 120_000

export interface LpsError {
  message: string
  name: string
}

export type LpsResult<T> = {data: T; ok: true} | {error: LpsError; ok: false}

export interface RunLpsOptions {
  // Run `lps` from here instead of the server's own cwd. The mutating handshake points this at a
  // frozen snapshot of the working tree so an apply reads the previewed bytes, not live disk.
  cwd?: string
  timeoutMs?: number
}

// Every command reachable from here supports `--json` (see obsidian/Product/Loopress MCP.md):
// oclif prints the command's return value as JSON on success, and a caught error as
// `{error: {message, name}}` with a non-zero exit code. tinyexec resolves with stdout whatever the
// exit code, and only rejects when the child could not run or was aborted.
export async function runLps<T>(args: string[], options: RunLpsOptions = {}): Promise<LpsResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const signal = AbortSignal.timeout(timeoutMs)

  let output: {exitCode: number | undefined; stderr: string; stdout: string}
  try {
    output = await x(LPS.file, [...LPS.pre, ...args, '--json'], {nodeOptions: {cwd: options.cwd ?? process.cwd()}, signal})
  } catch (error) {
    if (signal.aborted) {
      return {
        error: {message: `lps ${args.join(' ')} timed out after ${timeoutMs / 1000}s.`, name: 'TIMEOUT'},
        ok: false,
      }
    }

    return {error: {message: (error as Error).message, name: 'ExecError'}, ok: false}
  }

  try {
    const parsed = JSON.parse(output.stdout) as {error?: LpsError}
    if (output.exitCode !== 0 && parsed.error) return {error: parsed.error, ok: false}
    // A non-zero exit with a normal payload is a result, not a failure: `lps <resource> diff`
    // exits 1 on drift (a CI gate) and still prints its full report.
    return {data: parsed as T, ok: true}
  } catch {
    // stdout wasn't JSON (e.g. the process crashed before oclif's own error handling ran).
    const message = output.stderr.trim() || `lps ${args.join(' ')} exited with code ${output.exitCode} without JSON output.`
    return {error: {message, name: 'ExecError'}, ok: false}
  }
}
