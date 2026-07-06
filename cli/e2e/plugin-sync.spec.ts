import {expect, test} from './helpers/environment.js'

// Regression coverage: `plugin pull` used to include the Loopress plugin's own slug, which
// would make a later `plugin push` try to reinstall it from WordPress.org (where it doesn't
// exist) and, on a dev install where the plugin directory is a symlink to the source repo,
// risk clobbering it.
//
// The precondition (Loopress really is installed) is checked through WordPress core's own
// `wp/v2/plugins` endpoint, not Loopress's `loopress/v1/plugins` (which is exactly the list
// this fix filters loopress out of, and not the flaky-under-load wp-admin Plugins page).
test('plugin pull never lists the Loopress plugin itself', async ({request, runCli, wp}) => {
  const installedResponse = await request.get(`${wp.url}/wp-json/wp/v2/plugins`, {
    headers: {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`},
  })
  expect(installedResponse.ok()).toBe(true)
  const installed = (await installedResponse.json()) as Array<{plugin: string}>
  expect(installed.map((plugin) => plugin.plugin)).toContain('loopress/loopress')

  const result = await runCli(['plugin', 'pull', '--dry-run'])

  expect(result.exitCode).toBe(0)

  // The site URL and "loopress.json" both legitimately contain the substring "loopress", so
  // check the parsed slug list from the "+ slug, slug, ..." line rather than the raw output.
  const addedLine = result.stdout.split('\n').find((line) => line.trim().startsWith('+'))
  expect(addedLine).toBeDefined()
  const slugs = addedLine!
    .replace('+', '')
    .split(',')
    .map((slug) => slug.trim())
  expect(slugs).not.toContain('loopress')
})
