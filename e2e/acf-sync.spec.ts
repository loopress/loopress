/* eslint-disable camelcase -- these object literals mirror ACF/WordPress's own REST payload
   shape (post_type, show_in_rest, menu_slug, singular_name, ...), which is snake_case. */
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test, unwrap} from './helpers/environment.js'
import {findAcfFieldGroupRow, loginToWpAdmin, setPluginActive, trashAcfFieldGroup} from './helpers/wp-admin.js'

function writeFieldGroup(dir: string, key: string, title: string): void {
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `${key}.json`),
    JSON.stringify({
      active: true,
      fields: [],
      key,
      location: [[{operator: '==', param: 'post_type', value: 'post'}]],
      title,
    }),
  )
}

test('pushes a new field group and it appears correctly in the ACF admin list', async ({page, projectDir, runCli, wp}) => {
  const title = `E2E field group ${Date.now()}`
  writeFieldGroup(join(projectDir, 'acf', 'field-groups'), `group_e2e_${Date.now()}`, title)

  const result = await runCli(['acf', 'push'])

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain('All ACF objects pushed')

  const row = await findAcfFieldGroupRow(page, wp, title)
  await expect(row).toBeVisible()
})

// Regression coverage, mirrors the same guarantee snippet push has (loadSnippets()): one bad
// file in a directory of otherwise-valid objects must not block the rest of the batch. Covers
// both a syntactically broken sidecar and one that parses but is missing the required "key" a
// single test, matching how these two failure modes were actually found together during manual
// QA of this feature.
test('skips field groups with a malformed or missing-key sidecar instead of blocking the others', async ({
  page,
  projectDir,
  runCli,
  wp,
}) => {
  const dir = join(projectDir, 'acf', 'field-groups')
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, 'corrupted.json'), '{ "key": "group_broken", "title": "Broken" ,,, }')
  writeFileSync(join(dir, 'no-key.json'), JSON.stringify({title: 'Missing key entirely'}))

  const title = `E2E isolation ${Date.now()}`
  writeFieldGroup(dir, `group_e2e_isolation_${Date.now()}`, title)

  const result = await runCli(['acf', 'push'])

  expect(result.exitCode).toBe(0)
  expect(unwrap(result.stderr)).toContain('Skipping')
  expect(unwrap(result.stderr)).toContain('corrupted.json')
  expect(unwrap(result.stderr)).toContain('no-key.json')

  const row = await findAcfFieldGroupRow(page, wp, title)
  await expect(row).toBeVisible()
})

test('removes local files for a field group deleted on WordPress, and does not resurrect it on the next push', async ({
  page,
  projectDir,
  runCli,
  wp,
}) => {
  const dir = join(projectDir, 'acf', 'field-groups')
  const key = `group_e2e_delete_${Date.now()}`
  const title = `E2E delete ${Date.now()}`
  writeFieldGroup(dir, key, title)

  await runCli(['acf', 'push'])
  await expect(await findAcfFieldGroupRow(page, wp, title)).toBeVisible()

  // Trashed from the native ACF admin, not through Loopress's own endpoints: this is the path
  // that actually broke for Code Snippets (BUG-12, get_snippets() didn't filter trashed rows).
  // ACF's own acf_get_internal_post_type_posts() was confirmed by hand to exclude trashed posts
  // correctly, but that's exactly the kind of native-WordPress-behavior assumption worth
  // pinning down with a real test rather than trusting it stays true.
  await trashAcfFieldGroup(page, wp, title)

  const pullResult = await runCli(['acf', 'pull'])
  expect(pullResult.exitCode).toBe(0)
  expect(unwrap(pullResult.stderr)).toContain('Removed')
  expect(existsSync(join(dir, `${key}.json`))).toBe(false)

  const pushResult = await runCli(['acf', 'push'])
  expect(pushResult.exitCode).toBe(0)

  await page.goto(`${wp.url}/wp-admin/edit.php?post_type=acf-field-group`)
  await expect(page.getByRole('link', {exact: true, name: title})).toHaveCount(0)
})

// Post types (and taxonomies) are the one ACF object type that has an effect beyond ACF's own
// storage: pushing one should make WordPress itself treat it as a real, queryable post type.
// Asserting against wp/v2/types (the same source of truth WordPress core uses) catches a push
// that "succeeds" but only writes ACF's internal config without actually re-registering
// anything, which the CLI's own stdout can't distinguish from a real registration.
test('pushes a post type and it becomes a real, registered WordPress post type', async ({projectDir, request, runCli, wp}) => {
  const slug = `e2e_pt_${Date.now().toString(36)}`
  const dir = join(projectDir, 'acf', 'post-types')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `e2e_test_${slug}.json`),
    JSON.stringify({
      active: true,
      key: `e2e_test_${slug}`,
      labels: {name: 'E2E Widgets', singular_name: 'E2E Widget'},
      post_type: slug,
      public: true,
      show_in_rest: true,
      title: 'E2E Widgets',
    }),
  )

  const result = await runCli(['acf', 'push', '--type', 'post-types'])
  expect(result.exitCode).toBe(0)

  const typeResponse = await request.get(`${wp.url}/wp-json/wp/v2/types/${slug}`, {
    headers: {Authorization: `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`},
  })
  expect(typeResponse.ok()).toBe(true)
  const type = (await typeResponse.json()) as {slug: string}
  expect(type.slug).toBe(slug)
})

// The CI/dev WordPress instance runs ACF Free (no license for PRO), so options pages are the
// one object type that can never actually be created there — the interesting behavior is
// exactly that failure being loud and specific instead of the silent no-op
// acf_import_internal_post_type() produces on its own (see AcfService::requireRegisteredType()).
test('push fails clearly for an options page on ACF Free instead of silently no-oping', async ({projectDir, runCli}) => {
  const dir = join(projectDir, 'acf', 'options-pages')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, 'ui_options_page_e2e.json'),
    JSON.stringify({key: 'ui_options_page_e2e', menu_slug: 'e2e-options', title: 'E2E Options'}),
  )

  const result = await runCli(['acf', 'push', '--type', 'options-pages'])

  expect(result.exitCode).not.toBe(0)
  expect(unwrap(result.stderr)).toContain('ACF PRO may be required for options pages')
})

test.describe('ACF plugin inactive', () => {
  test.beforeAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, 'advanced-custom-fields', false)
    await page.close()
  })

  test.afterAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, 'advanced-custom-fields', true)
    await page.close()
  })

  test('acf list fails with a clear "ACF is not active" error instead of a 404 or a fatal', async ({runCli}) => {
    const result = await runCli(['acf', 'list'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('ACF is not active')
  })
})
