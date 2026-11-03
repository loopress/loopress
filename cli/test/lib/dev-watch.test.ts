import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {buildWatchTargets, createDebouncedBatcher, resolveResourceTypes, resourceTypeForPath} from '../../src/lib/dev-watch.js'

describe('resolveResourceTypes', () => {
  it('defaults to every resource type when neither --only nor --skip is given', () => {
    expect(resolveResourceTypes()).toEqual(['snippet', 'template', 'part', 'css', 'block', 'page', 'api', 'hook', 'plugin'])
  })

  it('narrows to --only', () => {
    expect(resolveResourceTypes(['snippet', 'api'])).toEqual(['snippet', 'api'])
  })

  it('removes --skip from the default set', () => {
    expect(resolveResourceTypes(undefined, ['plugin'])).toEqual(['snippet', 'template', 'part', 'css', 'block', 'page', 'api', 'hook'])
  })

  it('applies --skip on top of --only', () => {
    expect(resolveResourceTypes(['snippet', 'api'], ['api'])).toEqual(['snippet'])
  })
})

describe('buildWatchTargets', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-dev-watch-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('only includes directory-backed types that exist on disk', () => {
    mkdirSync(join(dir, 'snippets'))
    // no api/ dir created

    const targets = buildWatchTargets(['snippet', 'api'], {}, dir)

    expect(targets.map((t) => t.type)).toEqual(['snippet'])
  })

  it('resolves directories relative to rootDir and honors custom dir names', () => {
    mkdirSync(join(dir, 'wp', 'code'), {recursive: true})

    const targets = buildWatchTargets(['snippet'], {rootDir: 'wp', snippetsDir: 'code'}, dir)

    expect(targets).toEqual([{commandId: 'snippet:push', path: join(dir, 'wp', 'code'), type: 'snippet'}])
  })

  it('watches the hooks directory with hook:push, honoring hookDir', () => {
    mkdirSync(join(dir, 'wp-hooks'))

    const targets = buildWatchTargets(['hook'], {hookDir: 'wp-hooks'}, dir)

    expect(targets).toEqual([{commandId: 'hook:push', path: join(dir, 'wp-hooks'), type: 'hook'}])
  })

  it('excludes plugins when the manifest is empty, regardless of loopress.json existing', () => {
    const targets = buildWatchTargets(['plugin'], {plugins: {}}, dir)

    expect(targets).toEqual([])
  })

  it('includes plugins (watching loopress.json at cwd) when the manifest has entries', () => {
    const targets = buildWatchTargets(['plugin'], {plugins: {'code-snippets': 'latest'}}, dir)

    expect(targets).toEqual([{commandId: 'plugin:push', path: join(dir, 'loopress.json'), type: 'plugin'}])
  })
})

// Built with join: real watcher paths use the OS separator, which resourceTypeForPath matches on.
describe('resourceTypeForPath', () => {
  const targets = [
    {commandId: 'snippet:push', path: join('/proj', 'snippets'), type: 'snippet' as const},
    {commandId: 'plugin:push', path: join('/proj', 'loopress.json'), type: 'plugin' as const},
  ]

  it('matches a file inside a directory target', () => {
    expect(resourceTypeForPath(join('/proj', 'snippets', 'hello.php'), targets)).toBe('snippet')
  })

  it('does not match a sibling directory that merely shares a prefix', () => {
    expect(resourceTypeForPath(join('/proj', 'snippets-extra', 'hello.php'), targets)).toBeUndefined()
  })

  it('matches the file target by exact equality', () => {
    expect(resourceTypeForPath(join('/proj', 'loopress.json'), targets)).toBe('plugin')
  })

  it('returns undefined for a path outside every target', () => {
    expect(resourceTypeForPath(join('/proj', 'api', 'ping.php'), targets)).toBeUndefined()
  })
})

describe('createDebouncedBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches paths queued within the debounce window into a single flush call', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const batcher = createDebouncedBatcher(flush, 400)

    batcher.queue('/a')
    batcher.queue('/b')
    batcher.queue('/a') // duplicate, should collapse
    await vi.advanceTimersByTimeAsync(400)

    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(['/a', '/b'])
  })

  it('resets the window on every new change, so it only fires after quiet time', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const batcher = createDebouncedBatcher(flush, 400)

    batcher.queue('/a')
    await vi.advanceTimersByTimeAsync(300)
    batcher.queue('/b')
    await vi.advanceTimersByTimeAsync(300)
    expect(flush).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(['/a', '/b'])
  })

  it('never overlaps a flush still in flight, and drains what queued up once it finishes', async () => {
    const {promise: firstFlush, resolve: resolveFirstFlush} = Promise.withResolvers<void>()
    const flush = vi.fn().mockReturnValueOnce(firstFlush).mockResolvedValue(undefined)
    const batcher = createDebouncedBatcher(flush, 400)

    batcher.queue('/a')
    await vi.advanceTimersByTimeAsync(400)
    expect(flush).toHaveBeenCalledTimes(1)

    // A change arrives while the first flush is still running.
    batcher.queue('/b')
    await vi.advanceTimersByTimeAsync(400)
    expect(flush).toHaveBeenCalledTimes(1) // still just the first, no overlap

    resolveFirstFlush()
    await vi.advanceTimersByTimeAsync(400)
    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush).toHaveBeenNthCalledWith(2, ['/b'])
  })

  it('cancel() stops a pending flush from firing', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const batcher = createDebouncedBatcher(flush, 400)

    batcher.queue('/a')
    batcher.cancel()
    await vi.advanceTimersByTimeAsync(1000)

    expect(flush).not.toHaveBeenCalled()
  })
})
