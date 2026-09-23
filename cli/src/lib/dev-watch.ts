import {existsSync} from 'node:fs'
import {join, sep} from 'node:path'

import {type LoopressLocalConfig} from '../utils/loopress-config.js'

export type ResourceType = 'api' | 'pages' | 'plugins' | 'snippets'

export const RESOURCE_TYPES: ResourceType[] = ['snippets', 'pages', 'api', 'plugins']

export type WatchTarget = {
  commandId: string
  path: string
  type: ResourceType
}

// `only` narrows the default set, `skip` then removes from whatever that set is, same
// precedence a combined `--only=a,b --skip=b` reads as: watch a, b, then drop b.
export function resolveResourceTypes(only?: ResourceType[], skip: ResourceType[] = []): ResourceType[] {
  const base = only && only.length > 0 ? only : RESOURCE_TYPES
  return base.filter((type) => !skip.includes(type))
}

// One target per requested type that actually has something to watch: a missing directory (no
// `api/` folder yet) or an empty plugin manifest is left out silently, matching `push`'s own
// directories which are all optional. `plugins` watches the whole `loopress.json` lockfile since
// the plugin manifest is a field in it, not its own directory.
export function buildWatchTargets(types: ResourceType[], localConfig: LoopressLocalConfig, cwd: string): WatchTarget[] {
  const rootDir = join(cwd, localConfig.rootDir ?? '.')
  const candidates: Record<ResourceType, WatchTarget> = {
    api: {commandId: 'api:push', path: join(rootDir, localConfig.apiDir ?? 'api'), type: 'api'},
    pages: {commandId: 'page:push', path: join(rootDir, localConfig.pageDir ?? 'pages'), type: 'pages'},
    plugins: {commandId: 'plugin:push', path: join(cwd, 'loopress.json'), type: 'plugins'},
    snippets: {commandId: 'snippet:push', path: join(rootDir, localConfig.snippetsDir ?? 'snippets'), type: 'snippets'},
  }

  return types
    .map((type) => candidates[type])
    .filter((target) => {
      if (target.type === 'plugins') return Object.keys(localConfig.plugins ?? {}).length > 0
      return existsSync(target.path)
    })
}

// A changed file belongs to whichever target's path is a prefix of it (directory targets) or
// equals it (the `loopress.json` file target for `plugins`).
export function resourceTypeForPath(filePath: string, targets: WatchTarget[]): ResourceType | undefined {
  return targets.find((target) => filePath === target.path || filePath.startsWith(target.path + sep))?.type
}

export type DebouncedBatcher = {
  // Stops a pending debounce timer from firing; does not cancel a flush already in flight.
  cancel: () => void
  queue: (path: string) => void
}

// Groups file events that land within `debounceMs` of each other into one `flush` call. If a
// flush is still running when the timer fires again (a slow push outlasting the next debounce
// window), the new paths just accumulate in `pending` instead of starting a second, overlapping
// flush; once the in-flight one finishes it immediately flushes whatever queued up meanwhile.
export function createDebouncedBatcher(flush: (paths: string[]) => Promise<void>, debounceMs: number): DebouncedBatcher {
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | undefined
  let isBusy = false

  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      runFlush().catch(() => {})
    }, debounceMs)
  }

  const runFlush = async (): Promise<void> => {
    if (isBusy || pending.size === 0) return

    isBusy = true
    const paths = [...pending]
    pending.clear()

    try {
      await flush(paths)
    } finally {
      isBusy = false
      if (pending.size > 0) schedule()
    }
  }

  return {
    cancel() { clearTimeout(timer); },
    queue(path: string) {
      pending.add(path)
      schedule()
    },
  }
}
