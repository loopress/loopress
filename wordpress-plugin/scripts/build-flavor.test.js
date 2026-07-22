import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveFullOnlyFeatures } from './build-flavor.cjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('deriveFullOnlyFeatures', () => {
  it('matches the src/*/Feature.php directories present on disk', () => {
    const featureDirsOnDisk = fs
      .readdirSync(path.join(root, 'src'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(root, 'src', entry.name, 'Feature.php')))
      .map((entry) => entry.name)
      .sort()

    expect(deriveFullOnlyFeatures(root).sort()).toEqual(featureDirsOnDisk)
  })
})
