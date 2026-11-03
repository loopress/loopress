import {existsSync} from 'node:fs'
import {join, sep} from 'node:path'

import {type LoopressLocalConfig} from '../utils/loopress-config.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'
import {selectResources} from './resource-selection.js'

export type ResourceType = 'api' | 'block' | 'css' | 'hook' | 'page' | 'part' | 'plugin' | 'snippet' | 'template'

export const RESOURCE_TYPES: ResourceType[] = ['snippet', 'template', 'part', 'css', 'block', 'page', 'api', 'hook', 'plugin']

export type WatchTarget = {
  commandId: string
  path: string
  type: ResourceType
}

export function resolveResourceTypes(only?: ResourceType[], skip: ResourceType[] = []): ResourceType[] {
  return selectResources(RESOURCE_TYPES, only, skip)
}

// One target per requested type that actually has something to watch: a missing directory (no
// `api/` folder yet) or an empty plugin manifest is left out silently, matching `push`'s own
// directories which are all optional. `plugins` watches the whole `loopress.json` lockfile since
// the plugin manifest is a field in it, not its own directory.
export function buildWatchTargets(types: ResourceType[], localConfig: LoopressLocalConfig, cwd: string): WatchTarget[] {
  const candidates: Record<ResourceType, WatchTarget> = {
    api: {commandId: 'api:push', path: join(cwd, resolveResourceDir('api', localConfig)), type: 'api'},
    // The theme CSS is bundled into the child theme with the templates, by the same push.
    block: {commandId: 'theme:template:push', path: join(cwd, resolveResourceDir('blockCss', localConfig)), type: 'block'},
    css: {commandId: 'theme:template:push', path: join(cwd, resolveResourceDir('css', localConfig)), type: 'css'},
    hook: {commandId: 'hook:push', path: join(cwd, resolveResourceDir('hooks', localConfig)), type: 'hook'},
    page: {commandId: 'page:push', path: join(cwd, resolveResourceDir('page', localConfig)), type: 'page'},
    plugin: {commandId: 'plugin:push', path: join(cwd, 'loopress.json'), type: 'plugin'},
    part: {commandId: 'theme:template:push', path: join(cwd, resolveResourceDir('part', localConfig)), type: 'part'},
    template: {commandId: 'theme:template:push', path: join(cwd, resolveResourceDir('template', localConfig)), type: 'template'},
    snippet: {commandId: 'snippet:push', path: join(cwd, resolveResourceDir('snippets', localConfig)), type: 'snippet'},
  }

  return types
    .map((type) => candidates[type])
    .filter((target) => {
      if (target.type === 'plugin') return Object.keys(localConfig.plugins ?? {}).length > 0
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
