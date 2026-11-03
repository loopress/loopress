import {AsyncLocalStorage} from 'node:async_hooks'
import {isAbsolute, relative, resolve, sep} from 'node:path'

import {type LoopressLocalConfig} from '../utils/loopress-config.js'

// `environments.<name>.exclude` in loopress.json: files (globs relative to rootDir) an environment
// never receives. Excluded means "leave alone", not "absent": the listing layer hides them from a
// push or a diff, and the commands that remove what the site has and the project doesn't (prune,
// the child theme mirror) keep them. Only a command that targets one environment activates them
// (push, diff, promote through push); pull and dev never do.

type Exclusions = {matchers: RegExp[]; root: string}

let active: Exclusions | undefined
// `lps dev` runs the per-resource pushes itself: it disables exclusions for its whole process.
let disabled = false
// Paths (relative to rootDir) the listing layer hid since the active set was installed, for a
// dry run to list them.
const heldBack = new Set<string>()
// Inside `withoutExclusions`: every file is listed, to tell which items a filter held back.
const suspended = new AsyncLocalStorage<boolean>()

export function environmentExcludes(config: LoopressLocalConfig, envName: string): string[] {
  const excludes = config.environments?.[envName]?.exclude
  return Array.isArray(excludes) ? excludes.filter((pattern) => typeof pattern === 'string' && pattern.trim() !== '') : []
}

// Called by every LoopressCommand's init: installs the environment's exclusions when the command
// honors them, clears whatever a previous command of the same process installed otherwise.
export function activateExclusions(options: {config: LoopressLocalConfig; cwd: string; envName: string; honors: boolean}): void {
  heldBack.clear()
  const patterns = !disabled && options.honors ? environmentExcludes(options.config, options.envName) : []
  active =
    patterns.length === 0
      ? undefined
      : {matchers: patterns.map((pattern) => globToRegExp(pattern)), root: resolve(options.cwd, options.config.rootDir ?? '.')}
}

export function disableExclusions(): void {
  disabled = true
  active = undefined
}

export function hasExclusions(): boolean {
  return active !== undefined
}

// `path` is a file or a directory, absolute or relative to the cwd. A glob matching one of its
// parent directories covers it too (`hooks/feature` excludes everything under it).
export function isExcluded(path: string): boolean {
  if (!active || suspended.getStore()) return false
  const rel = relative(active.root, resolve(path))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false
  return matchesAny(active.matchers, rel.split(sep))
}

// Drops the excluded entries of a listing of `dir` (entries relative to it) and records them.
export function withoutExcluded<T>(dir: string, entries: T[], name: (entry: T) => string): T[] {
  if (!active || suspended.getStore()) return entries
  const {root} = active
  return entries.filter((entry) => {
    const path = resolve(dir, name(entry))
    if (!isExcluded(path)) return true
    heldBack.add(relative(root, path).split(sep).join('/'))
    return false
  })
}

export function heldBackPaths(): string[] {
  return [...heldBack].toSorted((a, b) => a.localeCompare(b))
}

// Runs `fn` with every file listed, excluded ones included.
export async function withoutExclusions<T>(fn: () => Promise<T>): Promise<T> {
  return suspended.run(true, fn)
}

// Every pattern matched against a '/'-split relative path, or any of its parent directories.
export function matchesAny(matchers: RegExp[], segments: string[]): boolean {
  for (let {length} = segments; length > 0; length--) {
    const candidate = segments.slice(0, length).join('/')
    if (matchers.some((matcher) => matcher.test(candidate))) return true
  }

  return false
}

// `**` any number of directories, `*` anything but '/', `?` one character but '/'. A leading
// `./` is ignored, the rest is literal.
export function globToRegExp(glob: string): RegExp {
  let source = glob.trim().replace(/^\.\//, '')
  while (source.endsWith('/')) source = source.slice(0, -1)
  let pattern = ''
  for (let i = 0; i < source.length; i++) {
    const char = source.charAt(i)
    if (char === '*' && source.charAt(i + 1) === '*') {
      i += 1
      if (source.charAt(i + 1) === '/') {
        i += 1
        pattern += '(?:.*/)?'
      } else {
        pattern += '.*'
      }
    } else if (char === '*') {
      pattern += '[^/]*'
    } else if (char === '?') {
      pattern += '[^/]'
    } else {
      pattern += char.replaceAll(/[$()+.[\\\]^{|}]/g, String.raw`\$&`)
    }
  }

  return new RegExp(`^${pattern}$`)
}
