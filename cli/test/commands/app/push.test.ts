import {Buffer} from 'node:buffer'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Push from '../../../src/commands/app/push.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

type AppFile = {path: string; sha256: string; size: number}
type PushInternals = {
  appDirNames(path: string, only?: string): Promise<string[]>
  dryRun: boolean
  pushApp(appDir: string, dirName: string, task?: {output: string}): Promise<unknown>
  remoteFiles(name: string): Promise<AppFile[]>
  uploadAsset(name: string, distDir: string, file: AppFile): Promise<void>
  wpClient: {get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>}
}

// A minimal built SPA: index.html declaring one module script and one stylesheet, plus the
// two asset files. Enough for loadAppManifest() to build a real manifest.
function scaffoldApp(root: string, name: string, js = 'export const v = 1'): string {
  const appDir = join(root, name)
  mkdirSync(join(appDir, 'dist', 'assets'), {recursive: true})
  writeFileSync(join(appDir, 'loopress.app.json'), '{}\n')
  writeFileSync(join(appDir, 'dist', 'assets', 'app.js'), js)
  writeFileSync(join(appDir, 'dist', 'assets', 'app.css'), 'body{margin:0}')
  writeFileSync(
    join(appDir, 'dist', 'index.html'),
    '<!doctype html><html><head>' +
      '<link rel="stylesheet" href="/assets/app.css">' +
      '<script type="module" src="/assets/app.js"></script>' +
      '</head><body></body></html>\n',
  )
  return appDir
}

function makeCmd() {
  const cmd = new Push([], fakeOclifConfig)
  silenceLogs(cmd)
  const internals = cmd as unknown as PushInternals
  internals.wpClient = {get: vi.fn(), post: vi.fn().mockResolvedValue({}), put: vi.fn().mockResolvedValue({})}
  return {cmd, internals}
}

const notFound = {cause: {response: {statusCode: 404}}}

describe('app push', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-app-push-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('appDirNames', () => {
    it('returns every subdirectory that holds a loopress.app.json, sorted', async () => {
      scaffoldApp(dir, 'search')
      scaffoldApp(dir, 'portal')
      mkdirSync(join(dir, 'not-an-app'))

      const {internals} = makeCmd()

      expect(await internals.appDirNames(dir)).toEqual(['portal', 'search'])
    })

    it('narrows to a single app when a name is given', async () => {
      scaffoldApp(dir, 'search')
      scaffoldApp(dir, 'portal')

      const {internals} = makeCmd()

      expect(await internals.appDirNames(dir, 'search')).toEqual(['search'])
    })

    it('errors when the named app has no directory', async () => {
      scaffoldApp(dir, 'search')
      const {internals} = makeCmd()

      await expect(internals.appDirNames(dir, 'ghost')).rejects.toThrow('No app "ghost"')
    })

    it('errors when the apps directory does not exist', async () => {
      const {internals} = makeCmd()

      await expect(internals.appDirNames(join(dir, 'missing'))).rejects.toThrow('Apps directory not found')
    })

    it('errors when the directory has no apps at all', async () => {
      const {internals} = makeCmd()

      await expect(internals.appDirNames(dir)).rejects.toThrow('No apps found')
    })
  })

  describe('remoteFiles', () => {
    it('returns the files array from the manifest endpoint', async () => {
      const {internals} = makeCmd()
      const files = [{path: 'assets/app.js', sha256: 'a'.repeat(64), size: 3}]
      internals.wpClient.get.mockResolvedValueOnce({files})

      expect(await internals.remoteFiles('search')).toEqual(files)
      expect(internals.wpClient.get).toHaveBeenCalledWith('loopress/v1/apps/search/manifest')
    })

    it('treats a 404 (app never pushed) as an empty remote', async () => {
      const {internals} = makeCmd()
      internals.wpClient.get.mockRejectedValueOnce(notFound)

      expect(await internals.remoteFiles('search')).toEqual([])
    })

    it('rethrows any non-404 error', async () => {
      const {internals} = makeCmd()
      internals.wpClient.get.mockRejectedValueOnce(new Error('boom'))

      await expect(internals.remoteFiles('search')).rejects.toThrow('boom')
    })
  })

  describe('uploadAsset', () => {
    it('PUTs the file base64-encoded to the assets endpoint', async () => {
      scaffoldApp(dir, 'search', 'export const v = 42')
      const {internals} = makeCmd()

      await internals.uploadAsset('search', join(dir, 'search', 'dist'), {
        path: 'assets/app.js',
        sha256: 'x',
        size: 0,
      })

      expect(internals.wpClient.put).toHaveBeenCalledWith('loopress/v1/apps/search/assets', {
        content: Buffer.from('export const v = 42').toString('base64'),
        encoding: 'base64',
        path: 'assets/app.js',
      })
    })
  })

  describe('pushApp', () => {
    it('uploads every file then commits the manifest for a brand-new app', async () => {
      const appDir = scaffoldApp(dir, 'search')
      const {internals} = makeCmd()
      internals.wpClient.get.mockRejectedValue(notFound) // no remote manifest yet
      const task = {output: ''}

      const result = await internals.pushApp(appDir, 'search', task)

      expect(internals.wpClient.put).toHaveBeenCalledTimes(3) // index.html + app.js + app.css
      const [commitPath, manifest] = internals.wpClient.post.mock.calls[0]
      expect(commitPath).toBe('loopress/v1/apps/search/commit')
      expect(manifest).toMatchObject({name: 'search', routing: 'hash', entry: {scripts: ['assets/app.js']}})
      expect(result).toMatchObject({name: 'search', uploaded: 3})
      expect(task.output).toContain('committed build')
    })

    it('uploads nothing and makes no request on a dry run', async () => {
      const appDir = scaffoldApp(dir, 'search')
      const {internals} = makeCmd()
      internals.dryRun = true
      internals.wpClient.get.mockRejectedValue(notFound)
      const task = {output: ''}

      const result = await internals.pushApp(appDir, 'search', task)

      expect(internals.wpClient.put).not.toHaveBeenCalled()
      expect(internals.wpClient.post).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
      expect(task.output).toContain('[dry-run]')
    })

    it('skips the upload but still commits when every file is already on the remote', async () => {
      const appDir = scaffoldApp(dir, 'search')
      const {internals} = makeCmd()
      internals.wpClient.get.mockRejectedValueOnce(notFound)

      await internals.pushApp(appDir, 'search')
      const committed = internals.wpClient.post.mock.calls[0][1] as {files: AppFile[]}
      internals.wpClient.put.mockClear()
      internals.wpClient.post.mockClear()
      internals.wpClient.get.mockResolvedValue({files: committed.files})

      const task = {output: ''}
      const result = await internals.pushApp(appDir, 'search', task)

      expect(internals.wpClient.put).not.toHaveBeenCalled()
      expect(internals.wpClient.post).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({name: 'search', uploaded: 0})
      expect(task.output).toContain('already up to date')
    })
  })
})
