import {mkdir, mkdtemp, readFile, rename, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {createSnapshot, removeSnapshot, writeBack} from '../../src/lib/snapshot.js'

let source = ''

beforeEach(async () => {
  source = await mkdtemp(join(tmpdir(), 'loopress-snap-src-'))
  await mkdir(join(source, 'snippets'), {recursive: true})
  await writeFile(join(source, 'loopress.json'), '{"snippets":"snippets"}')
  await writeFile(join(source, 'snippets', 'demo.php'), '<?php echo "safe";')
  await mkdir(join(source, 'node_modules', 'junk'), {recursive: true})
  await writeFile(join(source, 'node_modules', 'junk', 'big.js'), 'x'.repeat(1024))
})

afterEach(async () => {
  await rm(source, {force: true, recursive: true})
})

describe('createSnapshot', () => {
  it('copies the project files but skips node_modules', async () => {
    const snap = await createSnapshot(source)

    expect(await readFile(join(snap, 'snippets', 'demo.php'), 'utf8')).toBe('<?php echo "safe";')
    expect(await readFile(join(snap, 'loopress.json'), 'utf8')).toBe('{"snippets":"snippets"}')
    await expect(stat(join(snap, 'node_modules'))).rejects.toThrow()

    removeSnapshot(snap)
  })

  it('is decoupled from the source: editing the source afterwards does not change the snapshot', async () => {
    const snap = await createSnapshot(source)
    await writeFile(join(source, 'snippets', 'demo.php'), '<?php system($_GET["x"]);')

    expect(await readFile(join(snap, 'snippets', 'demo.php'), 'utf8')).toBe('<?php echo "safe";')

    removeSnapshot(snap)
  })
})

describe('writeBack', () => {
  it('copies back sidecars, renames and .loopress files the command wrote', async () => {
    const snap = await createSnapshot(source)
    await writeFile(join(snap, 'snippets', '5-mcp-snip.json'), '{"id":5}')
    await mkdir(join(snap, '.loopress', 'rollback'), {recursive: true})
    await writeFile(join(snap, '.loopress', 'rollback', 'snap.json'), '{}')
    await writeFile(join(snap, 'snippets', 'demo.php'), '<?php echo "renamed";')

    const result = await writeBack(snap)

    expect(result.conflicts).toEqual([])
    expect(await readFile(join(source, 'snippets', '5-mcp-snip.json'), 'utf8')).toBe('{"id":5}')
    expect(await readFile(join(source, '.loopress', 'rollback', 'snap.json'), 'utf8')).toBe('{}')
    expect(await readFile(join(source, 'snippets', 'demo.php'), 'utf8')).toBe('<?php echo "renamed";')
    removeSnapshot(snap)
  })

  it('removes the old path of a rename, unless the user edited it since the preview', async () => {
    const snap = await createSnapshot(source)
    await rename(join(snap, 'snippets', 'demo.php'), join(snap, 'snippets', '5-demo.php'))

    const result = await writeBack(snap)

    expect(result.conflicts).toEqual([])
    expect(await readFile(join(source, 'snippets', '5-demo.php'), 'utf8')).toBe('<?php echo "safe";')
    await expect(readFile(join(source, 'snippets', 'demo.php'), 'utf8')).rejects.toThrow()
    removeSnapshot(snap)

    const edited = await createSnapshot(source)
    await rename(join(edited, 'snippets', '5-demo.php'), join(edited, 'snippets', '6-demo.php'))
    await writeFile(join(source, 'snippets', '5-demo.php'), '<?php echo "user edit";')

    const conflict = await writeBack(edited)

    expect(conflict.conflicts).toEqual([join('snippets', '5-demo.php')])
    expect(await readFile(join(source, 'snippets', '5-demo.php'), 'utf8')).toBe('<?php echo "user edit";')
    removeSnapshot(edited)
  })

  it('never overwrites a file the user edited since the preview', async () => {
    const snap = await createSnapshot(source)
    await writeFile(join(snap, 'snippets', 'demo.php'), '<?php echo "from command";')
    await writeFile(join(source, 'snippets', 'demo.php'), '<?php echo "user edit";')

    const result = await writeBack(snap)

    expect(result.conflicts).toEqual([join('snippets', 'demo.php')])
    expect(await readFile(join(source, 'snippets', 'demo.php'), 'utf8')).toBe('<?php echo "user edit";')
    removeSnapshot(snap)
  })

  it('leaves unchanged files alone and keeps .git reachable from the snapshot', async () => {
    await mkdir(join(source, '.git'))
    await writeFile(join(source, '.git', 'HEAD'), 'ref: refs/heads/main')
    const snap = await createSnapshot(source)

    expect(await readFile(join(snap, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main')
    expect(await writeBack(snap)).toEqual({conflicts: [], copied: []})
    removeSnapshot(snap)
  })
})
