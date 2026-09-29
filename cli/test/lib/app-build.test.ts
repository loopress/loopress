import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {buildApp, detectPackageManager} from '../../src/lib/app-build.js'

describe('app-build', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-app-build-test-'))
    // Stops the lockfile walk here, whatever lives above the temp dir.
    mkdirSync(join(dir, '.git'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('detectPackageManager', () => {
    it('prefers the packageManager field', () => {
      writeFileSync(join(dir, 'yarn.lock'), '')
      expect(detectPackageManager(dir, 'pnpm@9.0.0')).toBe('pnpm')
    })

    it('ignores a packageManager outside the allowlist', () => {
      expect(detectPackageManager(dir, 'rm -rf /@1')).toBe('npm')
    })

    it('finds the lockfile of an enclosing workspace', () => {
      writeFileSync(join(dir, 'pnpm-lock.yaml'), '')
      const appDir = join(dir, 'apps', 'search')
      mkdirSync(appDir, {recursive: true})

      expect(detectPackageManager(appDir)).toBe('pnpm')
    })

    it('falls back to npm at the repository root', () => {
      expect(detectPackageManager(dir)).toBe('npm')
    })
  })

  describe('buildApp', () => {
    const writePackage = (scripts: Record<string, string>) => {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({packageManager: 'npm@10.0.0', scripts}))
    }

    it('does nothing without a package.json', async () => {
      expect(await buildApp(dir)).toBeUndefined()
    })

    it('does nothing without a build script', async () => {
      writePackage({test: 'true'})
      expect(await buildApp(dir)).toBeUndefined()
    })

    it('runs the build script in the app directory', async () => {
      writePackage({build: 'node -e "require(\'fs\').writeFileSync(\'built\', \'\')"'})

      expect(await buildApp(dir)).toBe('npm run build')
      expect(existsSync(join(dir, 'built'))).toBe(true)
    })

    it('fails with the build output and an install hint', async () => {
      writePackage({build: 'node -e "console.error(\'boom\'); process.exit(3)"'})

      await expect(buildApp(dir)).rejects.toThrow(/`npm run build` failed[\s\S]*boom[\s\S]*run `npm install`/)
    })
  })
})
