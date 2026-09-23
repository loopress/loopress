import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import Pull from '../../../src/commands/menu/pull.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

type PullInternals = {
  dryRun: boolean
  wpClient: {get: ReturnType<typeof vi.fn>}
}

function makeCmd(): {cmd: PullInternals; logs: ReturnType<typeof silenceLogs>} {
  const cmd = new Pull([], fakeOclifConfig)
  const logs = silenceLogs(cmd)
  return {cmd: cmd as unknown as PullInternals, logs}
}

const menu = {items: [], name: 'Main Menu', revision: 'abc123', slug: 'main', warnings: []}

describe('menu pull', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-menu-pull-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  describe('run', () => {
    function makeRunCmd(argv: string[] = []) {
      const cmd = new Pull(argv, fakeOclifConfig)
      const internals = cmd as unknown as {localConfig: LoopressLocalConfig; siteConfig: EnvironmentConfig}
      internals.localConfig = {rootDir: dir}
      internals.siteConfig = makeEnv('production', 'https://acme.com')
      const logs = silenceLogs(cmd)
      const get = vi.fn().mockImplementation(async (path: string) => {
        if (path === 'loopress/v1/menus') return [menu]
        if (path === 'loopress/v1/menu-locations') return {primary: 'main'}
        return []
      })
      ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
      return {cmd, get, logs}
    }

    it('writes each menu to <slug>.json and locations to menu-locations.json', async () => {
      const {cmd} = makeRunCmd()

      await cmd.run()

      expect(JSON.parse(readFileSync(join(dir, 'menus', 'main.json'), 'utf8'))).toEqual({
        items: [],
        name: 'Main Menu',
        slug: 'main',
      })
      expect(JSON.parse(readFileSync(join(dir, 'menus', 'menu-locations.json'), 'utf8'))).toEqual({primary: 'main'})
    })

    it('never persists revision or warnings, server bookkeeping not tracked configuration', async () => {
      const {cmd} = makeRunCmd()

      await cmd.run()

      const written = JSON.parse(readFileSync(join(dir, 'menus', 'main.json'), 'utf8')) as Record<string, unknown>
      expect(written).not.toHaveProperty('revision')
      expect(written).not.toHaveProperty('warnings')
    })

    it('removes a local menu file whose slug is no longer present remotely', async () => {
      mkdirSync(join(dir, 'menus'), {recursive: true})
      writeFileSync(join(dir, 'menus', 'gone.json'), '{}')
      const {cmd} = makeRunCmd()

      await cmd.run()

      expect(existsSync(join(dir, 'menus', 'gone.json'))).toBe(false)
    })

    it('warns for every menu-level warning returned by the server', async () => {
      const {cmd, get, logs} = makeRunCmd()
      get.mockImplementation(async (path: string) => {
        if (path === 'loopress/v1/menus') return [{...menu, warnings: ['item 4 references a deleted page']}]
        if (path === 'loopress/v1/menu-locations') return {}
        return []
      })

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith('main: item 4 references a deleted page')
    })

    // The "menu-locations" basename is reserved for menu-locations.json (see LOCATIONS_FILE_BASENAME):
    // a menu that happens to have that slug would otherwise silently collide with it.
    it('skips and warns about a menu whose slug is literally "menu-locations"', async () => {
      const {cmd, get, logs} = makeRunCmd()
      get.mockImplementation(async (path: string) => {
        if (path === 'loopress/v1/menus') return [{...menu, slug: 'menu-locations'}]
        if (path === 'loopress/v1/menu-locations') return {}
        return []
      })

      await cmd.run()

      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('reserved'))
      expect(JSON.parse(readFileSync(join(dir, 'menus', 'menu-locations.json'), 'utf8'))).toEqual({})
    })

    it('does not write anything on a dry run', async () => {
      const {cmd, logs} = makeRunCmd()
      ;(cmd as unknown as {dryRun: boolean}).dryRun = true

      await cmd.run()

      expect(existsSync(join(dir, 'menus', 'main.json'))).toBe(false)
      expect(existsSync(join(dir, 'menus', 'menu-locations.json'))).toBe(false)
      expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'))
    })
  })
})
