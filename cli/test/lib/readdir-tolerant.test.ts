import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {readdirTolerant, walkFiles} from '../../src/lib/readdir-tolerant.js'

describe('readdir-tolerant', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-readdir-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('readdirTolerant', () => {
    it('lists entry names, top level only by default', async () => {
      writeFileSync(join(dir, 'a.txt'), '')
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'sub', 'b.txt'), '')

      expect((await readdirTolerant(dir)).sort((a, b) => a.localeCompare(b))).toEqual(['a.txt', 'sub'])
    })

    it('returns Dirents with withFileTypes, recursing on demand', async () => {
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'sub', 'b.txt'), '')

      const entries = await readdirTolerant(dir, {recursive: true, withFileTypes: true})

      expect(entries.map((entry) => entry.name).sort((a, b) => a.localeCompare(b))).toEqual(['b.txt', 'sub'])
      expect(entries.find((entry) => entry.name === 'b.txt')?.isFile()).toBe(true)
    })

    it('returns Dirents for the top level only without recursive', async () => {
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'sub', 'b.txt'), '')

      const entries = await readdirTolerant(dir, {withFileTypes: true})

      expect(entries.map((entry) => entry.name)).toEqual(['sub'])
    })

    it('treats a missing directory as empty, with or without file types', async () => {
      await expect(readdirTolerant(join(dir, 'nope'))).resolves.toEqual([])
      await expect(readdirTolerant(join(dir, 'nope'), {withFileTypes: true})).resolves.toEqual([])
    })

    it('rethrows any other failure, e.g. reading a file as a directory', async () => {
      writeFileSync(join(dir, 'file'), '')

      await expect(readdirTolerant(join(dir, 'file'))).rejects.toThrow(/ENOTDIR/)
    })
  })

  describe('walkFiles', () => {
    it('lists every file at any depth, "/"-joined, skipping directories', async () => {
      writeFileSync(join(dir, 'a.php'), '')
      mkdirSync(join(dir, 'v1', 'users'), {recursive: true})
      writeFileSync(join(dir, 'v1', 'users', 'get.php'), '')

      expect((await walkFiles(dir)).sort((a, b) => a.localeCompare(b))).toEqual(['a.php', 'v1/users/get.php'])
    })

    it('follows a symlink to a file, and skips a broken one or one to a directory', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'lps-readdir-outside-'))
      try {
        writeFileSync(join(outside, 'shared.php'), '')
        mkdirSync(join(outside, 'somedir'))
        symlinkSync(join(outside, 'shared.php'), join(dir, 'linked.php'))
        symlinkSync(join(outside, 'gone.php'), join(dir, 'broken.php'))
        symlinkSync(join(outside, 'somedir'), join(dir, 'dirlink'))

        expect(await walkFiles(dir)).toEqual(['linked.php'])
      } finally {
        rmSync(outside, {force: true, recursive: true})
      }
    })

    it('yields no files for a missing directory', async () => {
      await expect(walkFiles(join(dir, 'nope'))).resolves.toEqual([])
    })
  })
})
