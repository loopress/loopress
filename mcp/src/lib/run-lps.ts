import {execFile} from 'node:child_process'
import {statSync} from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import {x} from 'tinyexec'

// Spawn the CLI's JS entry point with the Node already running this server, not the `lps`
// shim: on Windows, npm installs `lps` as `lps.cmd`, which plain execFile can't find (ENOENT, no
// PATHEXT lookup) nor run (EINVAL since CVE-2024-27980). Only the fallback goes through the
// shim, and tinyexec (below) handles the cmd.exe escaping for it.
// LPS_BIN overrides it (tests, the workspace's dev build at cli/bin/dev.js): a .js file runs
// under Node, anything else is spawned as is. Undefined when no CLI can be found at all.
export function resolveLps(override = process.env.LPS_BIN): undefined | {file: string; pre: string[]} {
  if (override) return /\.[cm]?js$/.test(override) ? {file: process.execPath, pre: [override]} : {file: override, pre: []}
  try {
    // A global install puts @loopress/cli next to @loopress/mcp in the same node_modules.
    const pkg = createRequire(import.meta.url).resolve('@loopress/cli/package.json')
    return {file: process.execPath, pre: [path.join(path.dirname(pkg), 'bin', 'run.js')]}
  } catch {
    // CLI not resolvable from here (pnpm, Volta, a separate npm prefix): `lps` on PATH.
    const file = findOnPath('lps')
    return file === undefined ? undefined : {file, pre: []}
  }
}

// Absolute path of `name` in the absolute PATH entries only. Passing a bare `lps` to tinyexec
// would search the working directory first on Windows (like cmd.exe), so a repository the agent
// works in could ship its own `lps.cmd` and have it run. On Windows only PATHEXT extensions are
// tried: npm also writes an extensionless sh script next to `lps.cmd`.
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env, platform = process.platform): string | undefined {
  const extensions = platform === 'win32' ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';') : ['']
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter((dir) => path.isAbsolute(dir))
  for (const dir of dirs) {
    for (const extension of extensions) {
      const file = path.join(dir, name + extension)
      if (statSync(file, {throwIfNoEntry: false})?.isFile()) return file
    }
  }

  return undefined
}

const LPS = resolveLps()

// On Windows the fallback runs as cmd.exe -> node (the `.cmd` shim). Killing cmd.exe alone
// leaves the CLI running and holding the output pipes open, so the whole tree goes, while its
// root still exists for taskkill to walk. taskkill is called by absolute path for the same
// working-directory reason as findOnPath.
export function killTree(child: {kill(): boolean; pid?: number}, platform = process.platform): void {
  if (platform !== 'win32' || child.pid === undefined) {
    child.kill()
    return
  }

  const taskkill = path.join(process.env.SystemRoot ?? String.raw`C:\Windows`, 'System32', 'taskkill.exe')
  execFile(taskkill, ['/pid', String(child.pid), '/T', '/F'], () => {})
}

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
// exit code, and only rejects when the child could not start.
export async function runLps<T>(args: string[], options: RunLpsOptions = {}): Promise<LpsResult<T>> {
  if (!LPS) {
    return {
      error: {message: 'Loopress CLI not found. Install it with `npm install -g @loopress/cli`, or set LPS_BIN.', name: 'ExecError'},
      ok: false,
    }
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutError = {
    error: {message: `lps ${args.join(' ')} timed out after ${timeoutMs / 1000}s.`, name: 'TIMEOUT'},
    ok: false,
  } as const

  const child = x(LPS.file, [...LPS.pre, ...args, '--json'], {nodeOptions: {cwd: options.cwd ?? process.cwd()}, nodePath: false})
  let isTimedOut = false
  const timer = setTimeout(() => {
    isTimedOut = true
    killTree(child)
  }, timeoutMs)

  let output: {exitCode: number | undefined; stderr: string; stdout: string}
  try {
    output = await child
  } catch (error) {
    return isTimedOut ? timeoutError : {error: {message: (error as Error).message, name: 'ExecError'}, ok: false}
  } finally {
    clearTimeout(timer)
  }

  if (isTimedOut) return timeoutError

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
