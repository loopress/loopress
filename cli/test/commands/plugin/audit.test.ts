import {beforeEach, describe, expect, it, vi} from 'vitest'

import Audit from '../../../src/commands/plugin/audit.js'
import {type LoopressLocalConfig} from '../../../src/utils/loopress-config.js'
import {fakeOclifConfig, silenceLogs} from '../../helpers/oclif.js'

const {gotFn} = vi.hoisted(() => {
  const gotFn = vi.fn()
  return {gotFn}
})

vi.mock('got', () => ({default: gotFn}))

// Routes a got(url, opts) call to a fixture keyed by whether it targets wpvulnerability.net or
// the wordpress.org info API (audit.ts's only two outbound calls), so a single mock can serve
// both sides of the Promise.all in auditOne() without caring about call order.
function mockGot(byUrl: {vuln?: (slug: string) => unknown; wporg?: unknown}) {
  gotFn.mockImplementation((url: string) => ({
    async json() {
      if (url.startsWith('https://www.wpvulnerability.net/plugin/')) {
        const slug = decodeURIComponent(url.split('/').at(-2)!)
        if (byUrl.vuln) return byUrl.vuln(slug)
        throw new Error('unexpected vuln request')
      }

      if (url === 'https://api.wordpress.org/plugins/info/1.2/') {
        if (byUrl.wporg !== undefined) return byUrl.wporg
        throw new Error('unexpected wporg request')
      }

      throw new Error(`unexpected request: ${url}`)
    },
  }))
}

function make(config: LoopressLocalConfig) {
  const cmd = new Audit([], fakeOclifConfig)
  ;(cmd as unknown as {localConfig: LoopressLocalConfig}).localConfig = config
  const logs = silenceLogs(cmd)
  return {cmd, logs}
}

describe('plugin audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports clean and makes no request when loopress.json has no plugins', async () => {
    const {cmd, logs} = make({})

    const result = await cmd.run()

    expect(result).toEqual({advisories: [], health: [], status: 'clean'})
    expect(logs.log).toHaveBeenCalledWith('No plugins in loopress.json to audit.')
    expect(gotFn).not.toHaveBeenCalled()
  })

  it('reports clean when a pinned plugin has no advisories and no health issues', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {name: 'Akismet', requires_php: null, version: '5.3.3'}})
    const {cmd, logs} = make({plugins: {akismet: '5.3.3'}})

    const result = await cmd.run()

    expect(result.status).toBe('clean')
    expect(logs.log).toHaveBeenCalledWith('No known vulnerabilities or health issues for 1 plugin(s).')
  })

  it('flags an advisory whose fixedIn is above the pinned version', async () => {
    mockGot({
      vuln: () => ({
        data: {
          vulnerability: [
            {
              cve: 'CVE-2024-1234',
              cvss: {score: 7.5, severity: 'high'},
              operator: {max_operator: 'lt', max_version: '5.3.3'},
              name: 'XSS bug',
            },
          ],
        },
      }),
      wporg: null,
    })
    const {cmd, logs} = make({plugins: {akismet: '5.3.2'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(
      expect.stringContaining('⚠ akismet: XSS bug (high, CVE-2024-1234, fixed in 5.3.3)'),
    )
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('1 vulnerability advisory, 0 health note(s)'))
  })

  it('excludes an advisory already fixed at or below the pinned version', async () => {
    mockGot({
      vuln: () => ({
        data: {
          vulnerability: [
            {operator: {max_operator: 'lt', max_version: '5.0.0'}, name: 'Old bug'},
          ],
        },
      }),
      wporg: null,
    })
    const {cmd} = make({plugins: {akismet: '5.3.3'}})

    const result = await cmd.run()

    expect(result.advisories).toEqual([])
    expect(result.status).toBe('clean')
  })

  it('always includes an advisory pinned to "latest", regardless of fixedIn', async () => {
    mockGot({
      vuln: () => ({
        data: {
          vulnerability: [
            {operator: {max_operator: 'lt', max_version: '99.0.0'}, name: 'Whatever'},
          ],
        },
      }),
      wporg: null,
    })
    const {cmd, logs} = make({plugins: {akismet: 'latest'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('⚠ akismet: Whatever'))
  })

  it('audits a "latest" pin as the newest WordPress.org release, not as every version ever', async () => {
    mockGot({
      vuln: () => ({
        data: {
          vulnerability: [
            {name: 'Fixed long ago', operator: {max_operator: 'lt', max_version: '5.0.0'}},
            {name: 'Still open', operator: {max_operator: 'le', max_version: '6.0.0'}},
          ],
        },
      }),
      wporg: {version: '6.0.0'},
    })
    const {cmd, logs} = make({plugins: {akismet: 'latest'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('⚠ akismet: Still open'))
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Fixed long ago'))
  })

  it('honours a lower bound: a version below the affected range is clean', async () => {
    mockGot({
      vuln: () => ({
        data: {
          vulnerability: [
            {name: 'Range bug', operator: {max_operator: 'le', max_version: '6.0.2', min_operator: 'ge', min_version: '3.1.1'}},
          ],
        },
      }),
      wporg: null,
    })
    const {cmd} = make({plugins: {akismet: '3.0.0'}})

    const result = await cmd.run()

    expect(result.advisories).toEqual([])
  })

  it('treats an "eq" bound as that single version', async () => {
    mockGot({vuln: () => ({data: {vulnerability: [{name: 'Only 1.7.8', operator: {max_operator: 'eq', max_version: '1.7.8'}}]}}), wporg: null})
    const {cmd} = make({plugins: {akismet: '2.0.2'}})

    const result = await cmd.run()

    expect(result.advisories).toEqual([])
  })

  it('decodes the HTML entities of advisory names', async () => {
    mockGot({
      vuln: () => ({data: {vulnerability: [{name: 'WPForms &#8211; Forms &amp; More', operator: {max_operator: 'lt', max_version: '9.0'}}]}}),
      wporg: null,
    })
    const {cmd, logs} = make({plugins: {akismet: '1.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('WPForms \u{2013} Forms & More'))
  })

  it('includes an advisory with no known fixedIn (cannot tell, report anyway)', async () => {
    mockGot({vuln: () => ({data: {vulnerability: [{name: 'Unknown-scope bug'}]}}), wporg: null})
    const {cmd, logs} = make({plugins: {akismet: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    // No severity/cve/fixedIn: advisoryMeta must render no trailing "(...)" at all.
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('⚠ akismet: Unknown-scope bug'))
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('Unknown-scope bug ('))
  })

  it('includes an advisory when the pinned version string is not comparable', async () => {
    mockGot({
      vuln: () => ({
        data: {
          vulnerability: [{operator: {max_operator: 'lt', max_version: '5.0.0'}, name: 'Bug'}],
        },
      }),
      wporg: null,
    })
    const {cmd, logs} = make({plugins: {akismet: 'not-a-version'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('⚠ akismet: Bug'))
  })

  it('reads the CVE from source[].id when raw.cve is absent', async () => {
    mockGot({
      vuln: () => ({data: {vulnerability: [{name: 'Bug', source: [{id: 'wpvdb-1'}, {id: 'CVE-2024-9999'}]}]}}),
      wporg: null,
    })
    const {cmd, logs} = make({plugins: {akismet: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('CVE-2024-9999'))
  })

  it('defaults the advisory title when the name field is missing', async () => {
    mockGot({vuln: () => ({data: {vulnerability: [{}]}}), wporg: null})
    const {cmd, logs} = make({plugins: {akismet: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('⚠ akismet: Unnamed advisory'))
  })

  it('flags a plugin removed from the WordPress.org directory', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {closed: true, name: 'Gone'}})
    const {cmd, logs} = make({plugins: {gone: '1.0.0'}})

    const result = await cmd.run()

    expect(result.health).toEqual([{message: 'removed from the WordPress.org directory', slug: 'gone'}])
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('· gone: removed from the WordPress.org directory'))
  })

  it('flags a plugin behind the latest release, but not one pinned to "latest"', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {name: 'X', version: '2.0.0'}})

    const behind = await make({plugins: {x: '1.0.0'}}).cmd.run()
    expect(behind.health).toEqual(expect.arrayContaining([{message: 'pinned to 1.0.0, latest is 2.0.0', slug: 'x'}]))

    const onLatest = await make({plugins: {x: 'latest'}}).cmd.run()
    expect(onLatest.health.some((h) => h.message.includes('pinned to'))).toBe(false)
  })

  it('does not flag a plugin that is already on or ahead of the latest version', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {name: 'X', version: '2.0.0'}})
    const {cmd} = make({plugins: {x: '2.0.0'}})

    const result = await cmd.run()

    expect(result.health.some((h) => h.message.includes('pinned to'))).toBe(false)
  })

  it('flags a required PHP version when present', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {name: 'X', requires_php: '8.1', version: '1.0.0'}})
    const {cmd} = make({plugins: {x: '1.0.0'}})

    const result = await cmd.run()

    expect(result.health).toEqual(expect.arrayContaining([{message: 'requires PHP 8.1', slug: 'x'}]))
  })

  it.each([
    ['2015-03-04 10:00am GMT', true],
    ['2015-03-04 12:30pm GMT', true],
    [`${new Date().getUTCFullYear()}-01-01 12:00am GMT`, false],
  ])('reads the WordPress.org date form %s', async (lastUpdated, abandoned) => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {last_updated: lastUpdated, name: 'X', version: '1.0.0'}})
    const result = await make({plugins: {x: '1.0.0'}}).cmd.run()

    expect(result.health.some((h) => h.message === `last updated ${lastUpdated.slice(0, 10)} (possibly abandoned)`)).toBe(abandoned)
  })

  it('flags a plugin possibly abandoned (last updated over 2 years ago), not one updated recently', async () => {
    const old = new Date(Date.now() - 3 * 365 * 24 * 3600 * 1000).toISOString()
    const recent = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {last_updated: old, name: 'X', version: '1.0.0'}})
    const abandoned = await make({plugins: {x: '1.0.0'}}).cmd.run()
    expect(abandoned.health.some((h) => h.message.includes('possibly abandoned'))).toBe(true)

    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {last_updated: recent, name: 'X', version: '1.0.0'}})
    const fresh = await make({plugins: {x: '1.0.0'}}).cmd.run()
    expect(fresh.health.some((h) => h.message.includes('possibly abandoned'))).toBe(false)
  })

  it('treats a wordpress.org error response the same as no health info at all', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {error: 'plugin_not_found'}})
    const {cmd} = make({plugins: {ghost: '1.0.0'}})

    const result = await cmd.run()

    expect(result.health).toEqual([])
    expect(result.status).toBe('clean')
  })

  it('treats a wordpress.org request failure as no health info, not a command failure', async () => {
    gotFn.mockImplementation((url: string) => ({
      async json() {
        if (url.startsWith('https://www.wpvulnerability.net/')) return {data: {vulnerability: []}}
        throw new Error('network down')
      },
    }))
    const {cmd} = make({plugins: {x: '1.0.0'}})

    const result = await cmd.run()

    expect(result.status).toBe('clean')
  })

  it('aborts the whole audit when the vulnerability database is unreachable, rather than reporting clean', async () => {
    gotFn.mockImplementation((url: string) => ({
      async json() {
        if (url.startsWith('https://www.wpvulnerability.net/')) throw new Error('ECONNREFUSED')
        return {name: 'X', version: '1.0.0'}
      },
    }))
    const {cmd} = make({plugins: {x: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow(/Could not reach the vulnerability database.*"x".*ECONNREFUSED/)
  })

  it('aggregates advisories and health notes across every plugin in the manifest', async () => {
    mockGot({
      vuln: (slug) => (slug === 'a' ? {data: {vulnerability: [{name: 'Bug A'}]}} : {data: {vulnerability: []}}),
      wporg: {closed: true, name: 'X'},
    })
    const {cmd, logs} = make({plugins: {a: '1.0.0', b: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('⚠ a: Bug A'))
    expect(logs.log).not.toHaveBeenCalledWith(expect.stringContaining('⚠ b:'))
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('· a: removed from the WordPress.org directory'))
    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('· b: removed from the WordPress.org directory'))
  })

  it('exits with code 1 when there are advisories', async () => {
    mockGot({vuln: () => ({data: {vulnerability: [{name: 'Bug'}]}}), wporg: null})
    const {cmd} = make({plugins: {x: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')
  })

  it('keeps the --json result when there are advisories, failing through the exit code instead', async () => {
    mockGot({vuln: () => ({data: {vulnerability: [{name: 'Bug', operator: {max_operator: 'lt', max_version: '9.0'}}]}}), wporg: null})
    const {cmd} = make({plugins: {akismet: '1.0'}})
    vi.spyOn(cmd, 'jsonEnabled').mockReturnValue(true)

    const result = await cmd.run()

    expect(result.status).toBe('issues')
    expect(process.exitCode).toBe(1)
    process.exitCode = undefined
  })

  it('does not exit with an error code when there are only health notes, no advisories', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {closed: true, name: 'X'}})
    const {cmd} = make({plugins: {x: '1.0.0'}})

    const result = await cmd.run()

    expect(result.status).toBe('issues')
  })

  it('pluralizes "advisory" only for exactly one', async () => {
    mockGot({vuln: () => ({data: {vulnerability: [{name: 'A'}, {name: 'B'}]}}), wporg: null})
    const {cmd, logs} = make({plugins: {x: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log).toHaveBeenCalledWith(expect.stringContaining('2 vulnerability advisories,'))
  })

  it.each([
    ['2.0.0', {min_operator: 'ge', min_version: '2.0.0'}, true],
    ['1.9.0', {min_operator: 'ge', min_version: '2.0.0'}, false],
    ['2.0.0', {min_operator: 'gt', min_version: '2.0.0'}, false],
    ['2.1.0', {min_operator: 'gt', min_version: '2.0.0'}, true],
    ['3.0.0', {max_operator: 'le', max_version: '3.0.0'}, true],
    ['3.1.0', {max_operator: 'le', max_version: '3.0.0'}, false],
    ['3.0.0', {max_operator: 'lt', max_version: '3.0.0'}, false],
    ['2.9.0', {max_operator: 'lt', max_version: '3.0.0'}, true],
    ['3.0.0', {max_operator: 'eq', max_version: '3.0.0'}, true],
    ['2.9.0', {max_operator: 'eq', max_version: '3.0.0'}, false],
    ['9.0.0', {max_operator: 'ne', max_version: '3.0.0'}, true],
    ['9.0.0', {max_operator: 'lt', max_version: ''}, true],
    ['9.0.0', {max_operator: 5, max_version: '3.0.0'}, true],
    ['2.5.0', {max_operator: 'lt', max_version: '3.0.0', min_operator: 'ge', min_version: '2.0.0'}, true],
    ['3.5.0', {max_operator: 'lt', max_version: '3.0.0', min_operator: 'ge', min_version: '2.0.0'}, false],
  ])('pinned to %s, an advisory with bounds %j affects it: %s', async (pinned, operator, affected) => {
    mockGot({vuln: () => ({data: {vulnerability: [{name: 'Bug', operator}]}}), wporg: null})
    const {cmd} = make({plugins: {x: pinned}})
    vi.spyOn(cmd, 'jsonEnabled').mockReturnValue(true)

    const result = await cmd.run()

    expect(result.advisories.length > 0).toBe(affected)
    process.exitCode = undefined
  })

  it('asks WordPress.org about the slug, and both services with a timeout', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {}})
    const {cmd} = make({plugins: {'my plugin': '1.0.0'}})

    await cmd.run()

    expect(gotFn).toHaveBeenCalledWith('https://api.wordpress.org/plugins/info/1.2/', {
      searchParams: {action: 'plugin_information', 'request[slug]': 'my plugin'},
      timeout: {request: 10_000},
    })
    expect(gotFn).toHaveBeenCalledWith('https://www.wpvulnerability.net/plugin/my%20plugin/', {timeout: {request: 10_000}})
  })

  it.each([null, {}, {data: {}}, {data: {vulnerability: 'none'}}])('aborts on a malformed vulnerability answer (%j)', async (answer) => {
    mockGot({vuln: () => answer, wporg: null})
    const {cmd} = make({plugins: {x: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('Unexpected answer from the vulnerability database (wpvulnerability.net) for "x"')
  })

  it('prints an advisory without details as its title alone, and every health note', async () => {
    mockGot({
      vuln: () => ({data: {vulnerability: [{name: 'Bug', source: [{}, {id: 'GHSA-1'}]}]}}),
      wporg: {closed: true, last_updated: '2015-03-04T10:00:00.000Z', requires_php: '', version: '2.0.0'},
    })
    const {cmd, logs} = make({plugins: {x: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow('EEXIT: 1')

    expect(logs.log.mock.calls.map(([line]) => line)).toEqual([
      '  ⚠ x: Bug',
      '  · x: removed from the WordPress.org directory',
      '  · x: pinned to 1.0.0, latest is 2.0.0',
      '  · x: last updated 2015-03-04 (possibly abandoned)',
      '\n1 vulnerability advisory, 3 health note(s). Vulnerability data: wpvulnerability.net.',
    ])
  })

  it('ignores health fields of the wrong type', async () => {
    mockGot({vuln: () => ({data: {vulnerability: []}}), wporg: {last_updated: 5, requires_php: 8, version: 2}})
    const {cmd} = make({plugins: {x: '1.0.0'}})

    expect(await cmd.run()).toEqual({advisories: [], health: [], status: 'clean'})
  })

  it('explains an unreachable vulnerability database', async () => {
    gotFn.mockImplementation((url: string) => ({
      async json() {
        if (url.includes('wpvulnerability')) throw new Error('ETIMEDOUT')
        return {}
      },
    }))
    const {cmd} = make({plugins: {x: '1.0.0'}})

    await expect(cmd.run()).rejects.toThrow(
      'Could not reach the vulnerability database (wpvulnerability.net) for "x": ETIMEDOUT. Audit aborted so a service outage is not reported as a clean result.',
    )
  })
})
