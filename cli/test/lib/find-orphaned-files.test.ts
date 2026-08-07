import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {basenameKey, findOrphanedFiles} from '../../src/lib/find-orphaned-files.js'

describe('findOrphanedFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-find-orphaned-files-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('returns an empty array when the directory does not exist yet, recursive or not', async () => {
    const missing = join(dir, 'does-not-exist')

    await expect(findOrphanedFiles(missing, new Set(), {extensions: ['.php'], key: basenameKey})).resolves.toEqual(
      [],
    )
    await expect(
      findOrphanedFiles(missing, new Set(), {extensions: ['.php'], key: basenameKey, recursive: true}),
    ).resolves.toEqual([])
  })

  describe('non-recursive (default)', () => {
    it('ignores files in subdirectories', async () => {
      writeFileSync(join(dir, 'gone.php'), '<?php')
      mkdirSync(join(dir, 'nested'))
      writeFileSync(join(dir, 'nested', 'also-gone.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set(), {extensions: ['.php'], key: basenameKey})

      expect(orphans).toEqual(['gone.php'])
    })
  })

  describe('recursive: true', () => {
    it('finds an orphaned file nested in a subdirectory', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')
      writeFileSync(join(dir, 'kept.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set(['kept']), {
        extensions: ['.php'],
        key: basenameKey,
        recursive: true,
      })

      expect(orphans).toEqual([join('invoice-pdf', '[order_id].php')])
    })

    it('does not report a nested file whose identity is in the keep set', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set([join('invoice-pdf', '[order_id]')]), {
        extensions: ['.php'],
        key: basenameKey,
        recursive: true,
      })

      expect(orphans).toEqual([])
    })
  })
})
