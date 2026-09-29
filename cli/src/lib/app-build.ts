import {spawn} from 'node:child_process'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

// The package managers `lps app push` may spawn. An allowlist, not the raw `packageManager`
// field: the name ends up as a process to run.
const PACKAGE_MANAGERS = ['bun', 'npm', 'pnpm', 'yarn'] as const
type PackageManager = (typeof PACKAGE_MANAGERS)[number]

const LOCKFILES: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

// How many trailing lines of build output a failure message carries.
const OUTPUT_TAIL_LINES = 20

// `packageManager` field first (corepack's own source of truth), then the nearest lockfile
// walking up to the repository root (an app inside a workspace shares the root lockfile),
// then npm.
export function detectPackageManager(appDir: string, packageManagerField?: string): PackageManager {
  const fromField = packageManagerField?.split('@', 1)[0]
  if (PACKAGE_MANAGERS.includes(fromField as PackageManager)) return fromField as PackageManager

  for (let dir = appDir; ; dir = dirname(dir)) {
    const lockfile = LOCKFILES.find(([file]) => existsSync(join(dir, file)))
    if (lockfile) return lockfile[1]
    if (existsSync(join(dir, '.git')) || dirname(dir) === dir) return 'npm'
  }
}

// Runs the app's own `build` script, if its package.json declares one. Returns the command it
// ran, or undefined when there is nothing to build (no package.json, or no build script: the
// dist/ folder is then taken as is). Throws with the tail of the output when the build fails,
// so a broken build never ships the stale dist/ left over from the previous one.
export async function buildApp(appDir: string, onStart?: (command: string) => void): Promise<string | undefined> {
  const packageJsonPath = join(appDir, 'package.json')
  if (!existsSync(packageJsonPath)) return undefined

  const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    packageManager?: string
    scripts?: Record<string, string>
  }
  if (!pkg.scripts?.build) return undefined

  const pm = detectPackageManager(appDir, pkg.packageManager)
  const command = `${pm} run build`
  onStart?.(command)

  const {code, output} = await new Promise<{code: null | number; output: string}>((resolve, reject) => {
    // Windows resolves `npm` to `npm.cmd`, which only a shell finds. `pm` comes from the
    // allowlist above, so the shell never sees user input.
    const child = spawn(pm, ['run', 'build'], {cwd: appDir, shell: process.platform === 'win32'})
    let out = ''
    const collect = (chunk: string) => {
      out += chunk
    }

    child.stdout.setEncoding('utf8').on('data', collect)
    child.stderr.setEncoding('utf8').on('data', collect)
    child.on('error', reject)
    child.on('close', (exitCode) => {
      resolve({code: exitCode, output: out})
    })
  })

  if (code !== 0) {
    const tail = output.trimEnd().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n')
    const hint = existsSync(join(appDir, 'node_modules'))
      ? ''
      : `\nnode_modules is missing: run \`${pm} install\` in ${appDir} first.`
    throw new Error(`\`${command}\` failed (exit code ${code}):\n${tail}${hint}`)
  }

  return command
}
