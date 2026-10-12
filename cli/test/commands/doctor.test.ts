import {beforeEach, describe, expect, it, vi} from 'vitest'

import Doctor from '../../src/commands/doctor.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {diagnoseWpSite} from '../../src/lib/wp-site-diagnostic.js'
import {type EnvironmentConfig} from '../../src/types/config.js'
import {fakeOclifConfig, silenceLogs} from '../helpers/oclif.js'
import {makeEnv, makeListedProject} from '../helpers/project-fixtures.js'

vi.mock('../../src/lib/wp-site-diagnostic.js', () => ({diagnoseWpSite: vi.fn()}))

class TestDoctor extends Doctor {
  setup(siteConfig: EnvironmentConfig) {
    this.siteConfig = siteConfig
    this.localConfig = {}
  }
}

function make(siteConfig: EnvironmentConfig = makeEnv('production', 'https://acme.com')) {
  const cmd = new TestDoctor([], fakeOclifConfig)
  cmd.setup(siteConfig)
  const logs = silenceLogs(cmd)
  const get = vi.fn<(path: string) => Promise<unknown>>()
  // The leftover temp admin listing (the only getAll caller) gets its own mock, so the generic
  // `get` stubs below don't have to return an array for it; tests about leftovers override it.
  const users = vi.fn().mockResolvedValue([])
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get, getAll: users}
  return {cmd, get, logs, users}
}

describe('doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.exitCode = undefined
    vi.spyOn(configManager, 'getCurrentProject').mockReturnValue(makeListedProject('id-acme', 'acme', {}, true))
    vi.mocked(diagnoseWpSite).mockResolvedValue({ok: true})
  })

  it('reports the targeted project, environment and URL', async () => {
    const {cmd, get, logs} = make()
    get.mockResolvedValue({'current_version': '2026.7.1'})

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('Project:      acme')
    expect(logs.log).toHaveBeenCalledWith('Environment:  production')
    expect(logs.log).toHaveBeenCalledWith('URL:          https://acme.com')
  })

  it('passes all checks and reports the plugin version', async () => {
    const {cmd, get, logs} = make()
    get.mockResolvedValue({'current_version': '2026.7.1'})

    const result = await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('✓ WordPress REST API reachable')
    expect(logs.log).toHaveBeenCalledWith('✓ Loopress plugin installed (loopress/v1 endpoints)')
    expect(logs.log).toHaveBeenCalledWith('✓ Credentials accepted (authenticated request)')
    expect(logs.log).toHaveBeenCalledWith('✓ Plugin version: 2026.7.1')
    expect(logs.log).toHaveBeenCalledWith('All checks passed.')
    expect(result).toMatchObject({ok: true, pluginVersion: '2026.7.1'})
    expect(process.exitCode).toBeUndefined()
  })

  it('fails fast with a non-zero exit when the site is unreachable', async () => {
    vi.mocked(diagnoseWpSite).mockResolvedValue({ok: false, reason: 'Could not reach the WordPress REST API.'})
    const {cmd, get, logs} = make()

    const result = await cmd.run()

    expect(result.ok).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(logs.log).toHaveBeenCalledWith('✗ WordPress REST API reachable')
    expect(logs.log).toHaveBeenCalledWith('  Could not reach the WordPress REST API.')
    expect(get).not.toHaveBeenCalled()
  })

  it('fails without credentials and skips the authenticated checks', async () => {
    const {cmd, get, logs} = make({...makeEnv('production', 'https://acme.com'), token: undefined})

    const result = await cmd.run()

    expect(result.ok).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(logs.log).toHaveBeenCalledWith('✗ Credentials configured')
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('lps project config'))
    expect(get).not.toHaveBeenCalled()
  })

  it('reports a missing plugin with the cause and keeps running the other checks', async () => {
    const {cmd, get, logs} = make()
    get.mockImplementation(async (path: string) => {
      if (path === 'loopress/v1') {
        throw new Error('Endpoint not found (404). Is the required plugin installed and up to date on the site?')
      }

      return {'current_version': '2026.7.1'}
    })

    const result = await cmd.run()

    expect(result.ok).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(logs.log).toHaveBeenCalledWith('✗ Loopress plugin installed (loopress/v1 endpoints)')
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Is the required plugin installed'))
    expect(logs.log).toHaveBeenCalledWith('✓ Credentials accepted (authenticated request)')
  })

  it('reports rejected credentials with the corrective action', async () => {
    const {cmd, get, logs, users} = make()
    get.mockImplementation(async (path: string) => {
      if (path === 'wp/v2/users/me') {
        throw new Error('Authentication failed (401). Check your credentials with `lps project config`.')
      }

      return {}
    })

    const result = await cmd.run()

    expect(result.ok).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(logs.log).toHaveBeenCalledWith('✗ Credentials accepted (authenticated request)')
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('lps project config'))
    expect(users).not.toHaveBeenCalled()
  })

  it('treats a 404 on the version endpoint as informational, not a failure', async () => {
    const {cmd, get, logs} = make()
    get.mockImplementation(async (path: string) => {
      if (path === 'loopress/v1/update') {
        throw new Error('Endpoint not found (404).', {cause: {response: {statusCode: 404}}})
      }

      return {}
    })

    const result = await cmd.run()

    expect(result.ok).toBe(true)
    expect(process.exitCode).toBeUndefined()
    expect(logs.log).toHaveBeenCalledWith('- Plugin version: not exposed by this plugin edition.')
    expect(logs.log).toHaveBeenCalledWith('All checks passed.')
  })

  it('passes the leftover check when no temp admin remains', async () => {
    const {cmd, get, logs, users} = make()
    get.mockResolvedValue({'current_version': '2026.7.1'})

    await cmd.run()

    expect(users).toHaveBeenCalledWith('wp/v2/users?context=edit&search=lps-temp-')
    expect(logs.log).toHaveBeenCalledWith('✓ No leftover temporary admin accounts')
  })

  it('fails, naming each account, when a temp admin was left behind, ignoring look-alikes', async () => {
    const {cmd, get, logs, users} = make()
    get.mockResolvedValue({'current_version': '2026.7.1'})
    users.mockResolvedValue([
      {email: 'lps-temp-abc@lps-temp.invalid', id: 7, username: 'lps-temp-abc'},
      // Same prefix but a real mailbox: a human account, not ours.
      {email: 'jane@acme.com', id: 8, username: 'lps-temp-jane'},
    ])

    const result = await cmd.run()

    expect(result.ok).toBe(false)
    expect(process.exitCode).toBe(1)
    expect(logs.log).toHaveBeenCalledWith('✗ No leftover temporary admin accounts')
    expect(logs.log).toHaveBeenCalledWith(expect.stringMatching(/^ {2}Found lps-temp-abc, left by/))
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('lps-temp-jane'))
  })

  it('reports the leftover check as not run, not failed, when the credentials cannot list users', async () => {
    const {cmd, get, logs, users} = make()
    get.mockResolvedValue({'current_version': '2026.7.1'})
    users.mockRejectedValue(new Error('Request refused (403).', {cause: {response: {statusCode: 403}}}))

    const result = await cmd.run()

    expect(result.ok).toBe(true)
    expect(logs.log).toHaveBeenCalledWith('- Leftover temporary admin accounts: not checked, these credentials cannot list users.')
  })

  it('fails the leftover check on any other lookup error', async () => {
    const {cmd, get, logs, users} = make()
    get.mockResolvedValue({'current_version': '2026.7.1'})
    users.mockRejectedValue(new Error('Request failed (500).', {cause: {response: {statusCode: 500}}}))

    const result = await cmd.run()

    expect(result.ok).toBe(false)
    expect(logs.log).toHaveBeenCalledWith('✗ No leftover temporary admin accounts')
    expect(logs.log).toHaveBeenCalledWith('  Request failed (500).')
  })

  describe('hook errors', () => {
    function withHookFiles(get: ReturnType<typeof vi.fn<(path: string) => Promise<unknown>>>, hookFiles: () => Promise<unknown>) {
      get.mockImplementation(async (path) => (path === 'loopress/v1/hook-files' ? hookFiles() : {'current_version': '2026.7.1'}))
    }

    it('passes when every hook loads and runs cleanly', async () => {
      const {cmd, get, logs} = make()
      withHookFiles(get, async () => [{filename: 'hello'}])

      await cmd.run()

      expect(logs.log).toHaveBeenCalledWith('✓ Hooks load and run without errors')
    })

    it('fails, naming the file, method and message, when a hook threw while running', async () => {
      const {cmd, get, logs} = make()
      withHookFiles(get, async () => [
        {filename: 'caps', runtimeError: {at: '2026-10-12T10:00:00+00:00', message: 'boom', method: 'grant', type: 'filter'}},
        {error: 'expected exactly one class declaration, found none', filename: 'broken'},
      ])

      const result = await cmd.run()

      expect(result.ok).toBe(false)
      expect(logs.log).toHaveBeenCalledWith('✗ Hooks load and run without errors')
      expect(logs.log).toHaveBeenCalledWith(
        '  hooks/caps.php: grant() threw while running as a filter, last at 2026-10-12T10:00:00+00:00: boom\n' +
          '  hooks/broken.php failed to load: expected exactly one class declaration, found none',
      )
    })

    it('skips the check on Loopress Light, which has no hooks', async () => {
      const {cmd, get, logs} = make()
      withHookFiles(get, async () => {
        throw new Error('Endpoint not found (404).', {cause: {response: {statusCode: 404}}})
      })

      const result = await cmd.run()

      expect(result.ok).toBe(true)
      expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Hooks load and run'))
    })
  })
})
