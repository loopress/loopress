import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import ComposerPull from '../../../src/commands/composer/pull.js'
import {type EnvironmentConfig} from '../../../src/types/config.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'
import {makeEnv} from '../../helpers/project-fixtures.js'

class TestComposerPull extends ComposerPull {
  setup(options: {dryRun: boolean; localConfig: LoopressLocalConfig; siteConfig: EnvironmentConfig}) {
    this.dryRun = options.dryRun
    this.localConfig = options.localConfig
    this.siteConfig = options.siteConfig
  }
}

function make(dryRun: boolean, localConfig: LoopressLocalConfig = {}) {
  const cmd = new TestComposerPull([], fakeOclifConfig)
  cmd.setup({dryRun, localConfig, siteConfig: makeEnv('production', 'https://acme.com')})
  silenceLogs(cmd)
  const get = vi.fn(async (path: string) =>
    path === 'loopress/v1/composer/json'
      ? Promise.resolve({composerJson: '{"name": "demo/site"}'})
      : Promise.resolve({composerLock: '{"packages": []}'}),
  )
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
  return {cmd, get}
}

describe('composer pull', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-composer-pull-test-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('writes composer.json and composer.lock from the API response', async () => {
    const {cmd, get} = make(false)

    await cmd.run()

    expect(get).toHaveBeenCalledWith('loopress/v1/composer/json')
    expect(get).toHaveBeenCalledWith('loopress/v1/composer/lock')
    expect(readFileSync(join(dir, 'composer.json'), 'utf8')).toBe('{"name": "demo/site"}')
    expect(readFileSync(join(dir, 'composer.lock'), 'utf8')).toBe('{"packages": []}')
  })

  it('respects rootDir from loopress.json', async () => {
    const {cmd} = make(false, {rootDir: '.'})

    await cmd.run()

    expect(existsSync(join(dir, 'composer.json'))).toBe(true)
    expect(existsSync(join(dir, 'composer.lock'))).toBe(true)
  })

  it('writes nothing on dry-run', async () => {
    const {cmd, get} = make(true)

    await cmd.run()

    expect(get).toHaveBeenCalledTimes(2)
    expect(existsSync(join(dir, 'composer.json'))).toBe(false)
    expect(existsSync(join(dir, 'composer.lock'))).toBe(false)
  })

  it('writes composer.json alone when the site has no composer.lock yet, instead of failing', async () => {
    const cmd = new TestComposerPull([], fakeOclifConfig)
    cmd.setup({dryRun: false, localConfig: {}, siteConfig: makeEnv('production', 'https://acme.com')})
    const logs = silenceLogs(cmd)
    const missingLock = new Error('not found', {
      cause: {response: {body: JSON.stringify({error: 'composer.lock not found'}), statusCode: 404}},
    })
    const get = vi.fn(async (path: string) =>
      path === 'loopress/v1/composer/json' ? Promise.resolve({composerJson: '{"name": "demo/site"}'}) : Promise.reject(missingLock),
    )
    ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}

    await cmd.run()

    expect(readFileSync(join(dir, 'composer.json'), 'utf8')).toBe('{"name": "demo/site"}')
    expect(existsSync(join(dir, 'composer.lock'))).toBe(false)
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('no composer.lock on this site yet'))
  })

  // Regression coverage: the dry-run message only distinguished "would write both files" from
  // "would write composer.json alone" once composer.lock's presence was actually checked; a
  // false-positive here (still claiming "and composer.lock") would mislead a dry run into
  // promising a file that never gets written on the real run.
  it('reports only composer.json in the dry-run message when the site has no composer.lock yet', async () => {
    const cmd = new TestComposerPull([], fakeOclifConfig)
    cmd.setup({dryRun: true, localConfig: {}, siteConfig: makeEnv('production', 'https://acme.com')})
    const logs = silenceLogs(cmd)
    const missingLock = new Error('not found', {
      cause: {response: {body: JSON.stringify({error: 'composer.lock not found'}), statusCode: 404}},
    })
    const get = vi.fn(async (path: string) =>
      path === 'loopress/v1/composer/json' ? Promise.resolve({composerJson: '{"name": "demo/site"}'}) : Promise.reject(missingLock),
    )
    ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}

    await cmd.run()

    // Exact match, not a substring check: the fixed "Pulling composer.json and composer.lock
    // from..." banner logged unconditionally above also contains "and composer.lock", so only
    // an exact match on this specific line proves the dry-run message itself doesn't.
    expect(logs.log).toHaveBeenCalledWith('[dry-run] Would write composer.json')
    expect(existsSync(join(dir, 'composer.json'))).toBe(false)
  })

  // Regression coverage: a bare 404 also covers the route being absent (plugin not installed,
  // or an edition/version predating Composer support), which used to be silently read as "no
  // lock yet" too, hiding the real problem behind a false success.
  it('rethrows a 404 whose body is not the controller\'s missing-lock response (e.g. plugin not installed or outdated)', async () => {
    const {cmd} = make(false)
    const routeAbsent = new Error('Endpoint not found (404) on https://acme.com/wp-json/loopress/v1/composer/lock. Is the required plugin installed and up to date on the site?', {
      cause: {
        response: {
          body: JSON.stringify({code: 'rest_no_route', data: {status: 404}, message: 'No route was found matching the URL and request method.'}),
          statusCode: 404,
        },
      },
    })
    const get = vi.fn(async (path: string) =>
      path === 'loopress/v1/composer/json' ? Promise.resolve({composerJson: '{"name": "demo/site"}'}) : Promise.reject(routeAbsent),
    )
    ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}

    await expect(cmd.run()).rejects.toThrow('Is the required plugin installed')
  })

  it('rethrows a 404 with no response body instead of treating it as "no lock yet"', async () => {
    const {cmd} = make(false)
    const notFound = new Error('not found', {cause: {response: {statusCode: 404}}})
    const get = vi.fn(async (path: string) =>
      path === 'loopress/v1/composer/json' ? Promise.resolve({composerJson: '{"name": "demo/site"}'}) : Promise.reject(notFound),
    )
    ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}

    await expect(cmd.run()).rejects.toThrow('not found')
  })

  it('rethrows a non-404 failure from composer/lock instead of treating it as "no lock yet"', async () => {
    const {cmd} = make(false)
    const serverError = new Error('server error', {cause: {response: {statusCode: 500}}})
    const get = vi.fn(async (path: string) =>
      path === 'loopress/v1/composer/json' ? Promise.resolve({composerJson: '{"name": "demo/site"}'}) : Promise.reject(serverError),
    )
    ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}

    await expect(cmd.run()).rejects.toThrow('server error')
  })
})
