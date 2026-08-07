import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, relative} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {loadFiles} from '../../src/lib/load-files.js'

interface ParsedFile {
  content: string
  filename: string
}

describe('loadFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-load-files-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('returns an empty array when the directory does not exist yet, recursive or not', async () => {
    const missing = join(dir, 'does-not-exist')

    await expect(loadFiles(missing, {extension: '.php', onSkip: vi.fn(), parse: (raw) => raw})).resolves.toEqual([])
    await expect(
      loadFiles(missing, {extension: '.php', onSkip: vi.fn(), parse: (raw) => raw, recursive: true}),
    ).resolves.toEqual([])
  })

  describe('non-recursive (default)', () => {
    it('reads top-level files only, ignoring subdirectories', async () => {
      writeFileSync(join(dir, 'hello.php'), '<?php')
      mkdirSync(join(dir, 'nested'))
      writeFileSync(join(dir, 'nested', 'ignored.php'), '<?php')

      const files = await loadFiles<ParsedFile>(dir, {
        extension: '.php',
        onSkip: vi.fn(),
        parse: (raw, filePath) => ({content: raw, filename: relative(dir, filePath)}),
      })

      expect(files).toEqual([{content: '<?php', filename: 'hello.php'}])
    })
  })

  describe('recursive: true', () => {
    it('finds files nested in subdirectories, filename reflecting the relative path', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')
      writeFileSync(join(dir, 'hello.php'), '<?php')

      const files = await loadFiles<ParsedFile>(dir, {
        extension: '.php',
        onSkip: vi.fn(),
        parse: (raw, filePath) => ({content: raw, filename: relative(dir, filePath)}),
        recursive: true,
      })

      expect(files.map((file) => file.filename).sort()).toEqual(['hello.php', join('invoice-pdf', '[order_id].php')])
    })

    it('finds files nested more than one level deep', async () => {
      mkdirSync(join(dir, 'orders', '[order_id]', 'items'), {recursive: true})
      writeFileSync(join(dir, 'orders', '[order_id]', 'items', '[item_id].php'), '<?php')

      const files = await loadFiles<ParsedFile>(dir, {
        extension: '.php',
        onSkip: vi.fn(),
        parse: (raw, filePath) => ({content: raw, filename: relative(dir, filePath)}),
        recursive: true,
      })

      expect(files).toEqual([
        {content: '<?php', filename: join('orders', '[order_id]', 'items', '[item_id].php')},
      ])
    })

    it('still skips a file that fails to parse, without aborting the rest', async () => {
      writeFileSync(join(dir, 'good.php'), '<?php')
      writeFileSync(join(dir, 'bad.php'), '<?php')
      const onSkip = vi.fn()

      const files = await loadFiles<ParsedFile>(dir, {
        extension: '.php',
        onSkip,
        parse(raw, filePath) {
          if (filePath.endsWith('bad.php')) throw new Error('boom')

          return {content: raw, filename: relative(dir, filePath)}
        },
        recursive: true,
      })

      expect(files).toEqual([{content: '<?php', filename: 'good.php'}])
      expect(onSkip).toHaveBeenCalledWith(expect.stringContaining('bad.php'))
    })
  })
})
