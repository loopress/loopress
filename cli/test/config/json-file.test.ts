import {mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {readJsonFile, writeJsonFileAtomic} from '../../src/config/json-file.js'

describe('json-file', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-json-file-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('writeJsonFileAtomic', () => {
    it('writes the file with owner-only permissions (0600)', () => {
      const filePath = join(dir, 'auth.json')
      writeJsonFileAtomic(filePath, {token: 'secret'})

      // eslint-disable-next-line no-bitwise -- masking to the permission bits is the standard way to read a file mode
      const mode = statSync(filePath).mode & 0o777
      expect(mode).toBe(0o600)
      expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({token: 'secret'})
    })
  })

  describe('readJsonFile', () => {
    it('returns null when the file does not exist', () => {
      expect(readJsonFile(join(dir, 'missing.json'))).toBeNull()
    })

    it('returns null when the file contains invalid JSON', () => {
      const filePath = join(dir, 'broken.json')
      writeFileSync(filePath, '{not json')

      expect(readJsonFile(filePath)).toBeNull()
    })

    it('propagates unexpected read errors instead of swallowing them (e.g. EISDIR)', () => {
      const dirPath = join(dir, 'a-directory')
      mkdirSync(dirPath)

      expect(() => readJsonFile(dirPath)).toThrow()
    })
  })
})
