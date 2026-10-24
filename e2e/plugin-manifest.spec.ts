import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'

// `lps plugin add/status/audit` and push's guards against the plugins really installed on the
// e2e site (setup-ci installs ACF, WPCode, Code Snippets, RankMath and Yoast with `wp plugin
// install`, so outside Loopress). plugin-sync.spec.ts covers pull. No test here runs a real
// Composer install: it would rewrite the shared site's Composer state composer-sync.spec.ts relies on.

function readPlugins(projectDir: string): Record<string, unknown> | undefined {
  return (JSON.parse(readFileSync(join(projectDir, 'loopress.json'), 'utf8')) as {plugins?: Record<string, unknown>}).plugins
}

function setPlugins(projectDir: string, plugins: Record<string, unknown>): void {
  const file = join(projectDir, 'loopress.json')
  const config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  writeFileSync(file, JSON.stringify({...config, plugins}, null, 2))
}


test.describe('lps plugin add', () => {
  test('pins a plugin to latest, then to an exact version, and reports a no-op re-add', async ({projectDir, runCli}) => {
    const add = await runCli(['plugin', 'add', 'hello-dolly'])
    expect(add.exitCode, output(add)).toBe(0)
    expect(add.stdout).toContain('Added hello-dolly (latest). Run `lps plugin push` to apply.')
    expect(readPlugins(projectDir)).toEqual({'hello-dolly': 'latest'})

    const pin = await runCli(['plugin', 'add', 'hello-dolly', '--version', '1.7.2', '--json'])
    expect(JSON.parse(pin.stdout)).toEqual({slug: 'hello-dolly', status: 'updated', version: '1.7.2'})
    expect(readPlugins(projectDir)).toEqual({'hello-dolly': '1.7.2'})

    const again = await runCli(['plugin', 'add', 'hello-dolly', '--version', '1.7.2'])
    expect(again.exitCode).toBe(0)
    expect(again.stdout).toContain('already pinned to 1.7.2')
  })

  test('refuses a Composer constraint instead of an exact version', async ({projectDir, runCli}) => {
    const add = await runCli(['plugin', 'add', 'hello-dolly', '--version', '^1.7'])

    expect(add.exitCode).not.toBe(0)
    expect(output(add)).toContain('--version must be an exact version like 9.4.2, not a Composer constraint')
    expect(readPlugins(projectDir)).toBeUndefined()
  })

  test('--dry-run leaves loopress.json untouched', async ({projectDir, runCli}) => {
    const add = await runCli(['plugin', 'add', 'hello-dolly', '--dry-run'])

    expect(add.exitCode).toBe(0)
    expect(add.stdout).toContain('[dry-run] Would add hello-dolly (latest) in loopress.json')
    expect(readPlugins(projectDir)).toBeUndefined()
  })
})

test.describe('lps plugin status', () => {
  test('with nothing pinned, active plugins are reported as untracked, which is not drift', async ({runCli}) => {
    const status = await runCli(['plugin', 'status', '--json'])

    expect(status.exitCode, output(status)).toBe(0)
    const result = JSON.parse(status.stdout) as {drift: boolean; untrackedActive: string[]}
    expect(result.drift).toBe(false)
    expect(result.untrackedActive).toContain('advanced-custom-fields')
    // The Loopress plugin itself is never something to track.
    expect(result.untrackedActive).not.toContain('loopress-full')
  })

  // ACF was installed by `wp plugin install`, not by Loopress: pinning it is a collision (push needs
  // --force to take it over), reported as drift like a plugin missing from the site.
  test('a pinned plugin missing from the site, or installed outside Loopress, is drift and exits 1', async ({projectDir, runCli}) => {
    setPlugins(projectDir, {'advanced-custom-fields': 'latest', 'e2e-not-a-real-plugin': 'latest'})

    const status = await runCli(['plugin', 'status'])

    expect(status.exitCode).toBe(1)
    expect(status.stdout).toContain('Not installed: e2e-not-a-real-plugin')
    expect(status.stdout).toContain('Installed outside Loopress (run `plugin push --force`): advanced-custom-fields')
  })

  test('a composer.json makes plugin status step aside in favour of lps composer', async ({projectDir, runCli}) => {
    writeFileSync(join(projectDir, 'composer.json'), JSON.stringify({require: {}}))

    const status = await runCli(['plugin', 'status', '--json'])

    expect(status.exitCode).toBe(0)
    expect(JSON.parse(status.stdout)).toMatchObject({drift: false, status: 'composer-managed'})
  })
})

test.describe('lps plugin push guards', () => {
  test('refuses to run with nothing pinned in loopress.json', async ({runCli}) => {
    const push = await runCli(['plugin', 'push', '--yes'])

    expect(push.exitCode).not.toBe(0)
    expect(output(push)).toContain('No plugins found in loopress.json')
  })

  test('refuses to take over a plugin installed outside Loopress without --force', async ({projectDir, request, runCli, wp}) => {
    setPlugins(projectDir, {'advanced-custom-fields': 'latest'})

    const push = await runCli(['plugin', 'push', '--yes'])

    expect(push.exitCode).not.toBe(0)
    expect(output(push)).toContain('installed outside Loopress: advanced-custom-fields')
    expect(output(push)).toContain('Re-run with --force')
    // ACF must still be there and active: the refusal happens before any file swap.
    const plugins = await request.get(`${wp.url}/wp-json/wp/v2/plugins`, {
      headers: {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`},
    })
    const acf = ((await plugins.json()) as Array<{plugin: string; status: string}>).find((plugin) =>
      plugin.plugin.startsWith('advanced-custom-fields/'),
    )
    expect(acf?.status).toBe('active')
  })

  test('--dry-run plans the install of a new plugin without installing it', async ({projectDir, runCli}) => {
    // Not hello-dolly: the wordpress image ships it, installed outside Loopress like ACF.
    setPlugins(projectDir, {'classic-editor': '1.6.7'})

    const push = await runCli(['plugin', 'push', '--dry-run', '--json'])

    expect(push.exitCode, output(push)).toBe(0)
    expect(JSON.parse(push.stdout)).toMatchObject({installed: ['classic-editor'], status: 'dry-run'})

    const status = await runCli(['plugin', 'status'])
    expect(status.stdout).toContain('Not installed: classic-editor')
  })

  test('--activate is refused for a loopress.json project, which records active state itself', async ({projectDir, runCli}) => {
    setPlugins(projectDir, {'hello-dolly': 'latest'})

    const push = await runCli(['plugin', 'push', '--activate', '--yes'])

    expect(push.exitCode).not.toBe(0)
    expect(output(push)).toContain('--activate only applies to projects with a composer.json')
  })
})

test.describe('lps plugin audit', () => {
  test('with nothing pinned there is nothing to audit', async ({runCli}) => {
    const audit = await runCli(['plugin', 'audit'])

    expect(audit.exitCode).toBe(0)
    expect(audit.stdout).toContain('No plugins in loopress.json to audit.')
  })

  // Real network calls to wpvulnerability.net and api.wordpress.org: an old ACF release has
  // published advisories, which must fail the audit (a CI gate), with the fix version shown.
  test('flags known vulnerabilities of an old pinned version and exits 1', async ({projectDir, runCli}) => {
    setPlugins(projectDir, {'advanced-custom-fields': '5.0.0'})

    // No --json: exiting 1 happens before oclif would print the JSON result.
    const audit = await runCli(['plugin', 'audit'])

    expect(audit.exitCode, output(audit)).toBe(1)
    expect(audit.stdout).toContain('⚠ advanced-custom-fields:')
    expect(audit.stdout).toMatch(/pinned to 5\.0\.0, latest is/)
    expect(audit.stdout).toMatch(/[1-9]\d* vulnerability advisor(y|ies)/)
  })

  // #335: api.wordpress.org returns `last_updated` as "2015-03-04 10:00am GMT", a form
  // Date.parse() can't read. Hello Dolly hasn't been updated in years, so the audit must say so.
  test('flags a plugin not updated in years as possibly abandoned', async ({projectDir, request, runCli}) => {
    const info = await request.get('https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=hello-dolly')
    const {last_updated: lastUpdated} = (await info.json()) as {last_updated: string}
    // The form parseWordPressDate() in audit.ts expects; checked even when the age check below skips.
    expect(lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}(am|pm) GMT$/)
    const ageInYears = (Date.now() - Date.parse(lastUpdated.slice(0, 10))) / (365 * 24 * 3600 * 1000)
    test.skip(ageInYears <= 2.1, `hello-dolly was updated on ${lastUpdated}, too recently for this check`)

    setPlugins(projectDir, {'hello-dolly': '1.7.2'})
    const audit = await runCli(['plugin', 'audit'])

    expect(audit.stdout, output(audit)).toContain(`· hello-dolly: last updated ${lastUpdated.slice(0, 10)} (possibly abandoned)`)
  })
})
