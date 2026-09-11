import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {createSnapshot, removeSnapshot} from '../../src/lib/snapshot.js'

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
