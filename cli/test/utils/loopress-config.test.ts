import {expect} from 'chai'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

// readLocalConfig / writeLocalConfig resolve against process.cwd(), so we
// temporarily switch the working directory for each test.
const originalCwd = process.cwd()

import {readLocalConfig, writeLocalConfig} from '../../src/utils/loopress-config.js'

describe('loopress-config', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lps-config-test-'))
    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, {force: true, recursive: true})
  })

  describe('readLocalConfig', () => {
    it('returns an empty object when loopress.json does not exist', async () => {
      const config = await readLocalConfig()
      expect(config).to.deep.equal({})
    })
  })

  describe('writeLocalConfig / readLocalConfig roundtrip', () => {
    it('persists and reads back a full config', async () => {
      await writeLocalConfig({
        plugins: {woocommerce: '8.9.1', wpcode: '2.1.0'},
        rootDir: './src',
        snippets: './snippets',
      })

      const config = await readLocalConfig()
      expect(config.plugins).to.deep.equal({woocommerce: '8.9.1', wpcode: '2.1.0'})
      expect(config.rootDir).to.equal('./src')
      expect(config.snippets).to.equal('./snippets')
    })

    it('persists a config with no plugins key', async () => {
      await writeLocalConfig({rootDir: '.', snippets: './snips'})
      const config = await readLocalConfig()
      expect(config.plugins).to.be.undefined
      expect(config.rootDir).to.equal('.')
    })

    it('overwrites an existing config file', async () => {
      await writeLocalConfig({plugins: {woocommerce: '8.9.1'}})
      await writeLocalConfig({plugins: {woocommerce: '9.0.0', acf: '6.3.2'}})

      const config = await readLocalConfig()
      expect(config.plugins).to.deep.equal({woocommerce: '9.0.0', acf: '6.3.2'})
    })

    it('writes valid JSON', async () => {
      await writeLocalConfig({plugins: {hello: '1.0.0'}})

      const {readFile} = await import('node:fs/promises')
      const content = await readFile(join(tmpDir, 'loopress.json'), 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed.plugins).to.deep.equal({hello: '1.0.0'})
    })
  })
})
