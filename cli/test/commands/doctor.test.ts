import {beforeEach, describe, expect, it, vi} from 'vitest'

import Doctor from '../../src/commands/doctor.js'
import {configManager} from '../../src/config/project-config.manager.js'
import {diagnoseWpSite} from '../../src/lib/wp-site-diagnostic.js'
import {EnvironmentConfig} from '../../src/types/config.js'
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
  const get = vi.fn()
  ;(cmd as unknown as {wpClient: unknown}).wpClient = {get}
  return {cmd, get, logs}
}

describe('doctor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('✓ WordPress REST API reachable')
    expect(logs.log).toHaveBeenCalledWith('✓ Loopress plugin installed (loopress/v1 endpoints)')
    expect(logs.log).toHaveBeenCalledWith('✓ Credentials accepted (authenticated request)')
    expect(logs.log).toHaveBeenCalledWith('✓ Plugin version: 2026.7.1')
    expect(logs.log).toHaveBeenCalledWith('All checks passed.')
  })

  it('fails fast with a non-zero exit when the site is unreachable', async () => {
    vi.mocked(diagnoseWpSite).mockResolvedValue({ok: false, reason: 'Could not reach the WordPress REST API.'})
    const {cmd, get, logs} = make()

    await expect(cmd.run()).rejects.toThrow('1 check failed.')

    expect(logs.log).toHaveBeenCalledWith('✗ WordPress REST API reachable')
    expect(logs.log).toHaveBeenCalledWith('  Could not reach the WordPress REST API.')
    expect(get).not.toHaveBeenCalled()
  })

  it('fails without credentials and skips the authenticated checks', async () => {
    const {cmd, get, logs} = make({...makeEnv('production', 'https://acme.com'), token: undefined})

    await expect(cmd.run()).rejects.toThrow('1 check failed.')

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

    await expect(cmd.run()).rejects.toThrow('1 check failed.')

    expect(logs.log).toHaveBeenCalledWith('✗ Loopress plugin installed (loopress/v1 endpoints)')
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('Is the required plugin installed'))
    expect(logs.log).toHaveBeenCalledWith('✓ Credentials accepted (authenticated request)')
  })

  it('reports rejected credentials with the corrective action', async () => {
    const {cmd, get, logs} = make()
    get.mockImplementation(async (path: string) => {
      if (path === 'wp/v2/users/me') {
        throw new Error('Authentication failed (401). Check your credentials with `lps project config`.')
      }

      return {}
    })

    await expect(cmd.run()).rejects.toThrow('1 check failed.')

    expect(logs.log).toHaveBeenCalledWith('✗ Credentials accepted (authenticated request)')
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('lps project config'))
  })

  it('treats a 404 on the version endpoint as informational, not a failure', async () => {
    const {cmd, get, logs} = make()
    get.mockImplementation(async (path: string) => {
      if (path === 'loopress/v1/update') {
        throw new Error('Endpoint not found (404).', {cause: {response: {statusCode: 404}}})
      }

      return {}
    })

    await cmd.run()

    expect(logs.log).toHaveBeenCalledWith('- Plugin version: not exposed by this plugin edition.')
    expect(logs.log).toHaveBeenCalledWith('All checks passed.')
  })
})
