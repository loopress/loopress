import {expect, test} from './helpers/environment.js'

// Regression coverage: `plugin pull` used to include the Loopress plugin's own slug, which
// would make a later `plugin push` try to reinstall it from WordPress.org (where it doesn't
// exist) and, on a dev install where the plugin directory is a symlink to the source repo,
// risk clobbering it.
//
// The precondition (Loopress really is installed) is checked through WordPress core's own
// `wp/v2/plugins` endpoint, unfiltered, since that's the same endpoint `plugin pull` itself
// reads and filters client-side (not the flaky-under-load wp-admin Plugins page).
test('plugin pull never lists the Loopress plugin itself', async ({request, runCli, wp}) => {
  const installedResponse = await request.get(`${wp.url}/wp-json/wp/v2/plugins`, {
    headers: {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`},
  })
  expect(installedResponse.ok()).toBe(true)
  const installed = (await installedResponse.json()) as Array<{plugin: string}>
  expect(installed.map((plugin) => plugin.plugin)).toContain('loopress-full/loopress')

  // Without a terminal, plugins not tracked yet are reported as `untracked` instead of added:
  // Loopress must appear in neither list.
  const result = await runCli(['plugin', 'pull', '--dry-run', '--json'])

  expect(result.exitCode).toBe(0)
  const {added, untracked} = JSON.parse(result.stdout) as {added: string[]; untracked: string[]}
  expect([...added, ...untracked]).not.toContain('loopress-full')
  expect([...added, ...untracked]).not.toContain('loopress')
})
