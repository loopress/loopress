import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/cpt/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type PushInternals = {
  dryRun: boolean
  failedCount: number
  pushItem(postType: {args: Record<string, unknown>; slug: string}, task?: {output: string}): Promise<void>
  wpClient: {get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>}
}

function makeCmd(): PushInternals {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  return cmd as unknown as PushInternals
}

function notFoundError(): Error {
  return new Error('not found', {cause: {response: {statusCode: 404}}})
}

describe('cpt push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-cpt-push-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('posts the slug and args with the current revision as a precondition (#234)', async () => {
    const cmd = makeCmd()
    const get = vi.fn().mockResolvedValueOnce({args: {}, revision: 'rev-1', slug: 'book'})
    const post = vi.fn().mockResolvedValueOnce({args: {public: true}, revision: 'rev-2', slug: 'book'})
    cmd.wpClient = {get, post}
    const task = {output: ''}

    await cmd.pushItem({args: {public: true}, slug: 'book'}, task)

    expect(get).toHaveBeenCalledWith('loopress/v1/post-types/book')
    expect(post).toHaveBeenCalledWith('loopress/v1/post-types', {args: {public: true}, expectedRevision: 'rev-1', slug: 'book'})
    expect(task.output).toBe('Pushed: book')
  })

  it('omits expectedRevision on a first push', async () => {
    const cmd = makeCmd()
    const post = vi.fn().mockResolvedValueOnce({})
    cmd.wpClient = {get: vi.fn().mockRejectedValueOnce(notFoundError()), post}

    await cmd.pushItem({args: {}, slug: 'book'})

    expect(post).toHaveBeenCalledWith('loopress/v1/post-types', {args: {}, slug: 'book'})
  })

  it('counts a refused post type as a failure, for runPushTasks to report', async () => {
    const cmd = makeCmd()
    cmd.wpClient = {get: vi.fn().mockRejectedValueOnce(notFoundError()), post: vi.fn().mockRejectedValueOnce(new Error('reserved'))}

    await expect(cmd.pushItem({args: {}, slug: 'page'}, {output: ''})).rejects.toThrow('reserved')
    expect(cmd.failedCount).toBe(1)
  })

  it('touches nothing on a dry run', async () => {
    const cmd = makeCmd()
    cmd.dryRun = true
    cmd.wpClient = {get: vi.fn(), post: vi.fn()}

    await cmd.pushItem({args: {}, slug: 'book'})

    expect(cmd.wpClient.post).not.toHaveBeenCalled()
  })
})
