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
    it('finds an orphaned file nested in a subdirectory, identity always slash-joined', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')
      writeFileSync(join(dir, 'kept.php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set(['kept']), {
        extensions: ['.php'],
        key: basenameKey,
        recursive: true,
      })

      // Hardcoded '/', not join(): the server always sends filenames with '/', regardless of
      // the OS findOrphanedFiles() itself runs on. A test built with join() would tautologically
      // pass on every platform even if the implementation used the OS separator internally,
      // since both sides would drift together, this is the whole point of the fix, verify it.
      expect(orphans).toEqual(['invoice-pdf/[order_id].php'])
    })

    it('does not report a nested file whose identity is in the keep set', async () => {
      mkdirSync(join(dir, 'invoice-pdf'), {recursive: true})
      writeFileSync(join(dir, 'invoice-pdf', '[order_id].php'), '<?php')

      // The keep set as the server would actually send it: always '/', never the OS separator.
      const orphans = await findOrphanedFiles(dir, new Set(['invoice-pdf/[order_id]']), {
        extensions: ['.php'],
        key: basenameKey,
        recursive: true,
      })

      expect(orphans).toEqual([])
    })

    it('finds a file nested more than one level deep, identity slash-joined at every level', async () => {
      mkdirSync(join(dir, 'orders', '[order_id]', 'items'), {recursive: true})
      writeFileSync(join(dir, 'orders', '[order_id]', 'items', '[item_id].php'), '<?php')

      const orphans = await findOrphanedFiles(dir, new Set(), {
        extensions: ['.php'],
        key: basenameKey,
        recursive: true,
      })

      expect(orphans).toEqual(['orders/[order_id]/items/[item_id].php'])
    })
  })
})
