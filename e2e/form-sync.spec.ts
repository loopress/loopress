import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test, unwrap, type WpCredentials} from './helpers/environment.js'
import {loginToWpAdmin, setPluginActive} from './helpers/wp-admin.js'

const WPFORMS_SLUG = 'wpforms-lite'

function authHeader(wp: WpCredentials): string {
  return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`
}

function writeForm(dir: string, basename: string, title: string): void {
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, `${basename}.json`), JSON.stringify({settings: {form_title: title}}))
}

// Push/pull rename local files to `<id>-<slug>.json`, same convention as form-format.ts.
function soleJsonFile(dir: string): string {
  const file = readdirSync(dir).find((name) => name.endsWith('.json'))
  if (!file) throw new Error(`No .json file found in ${dir}`)
  return file
}

test('pushes a new form, renames the local file to <id>-<slug>, and it reads back identically', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const title = `E2E form round trip ${Date.now()}`
  const formsDir = join(projectDir, 'forms')
  writeForm(formsDir, 'draft', title)

  const result = await runCli(['form', 'push'])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout).toContain('All forms pushed')

  const id = Number(soleJsonFile(formsDir).split('-')[0])
  expect(Number.isInteger(id)).toBe(true)

  const response = await request.get(`${wp.url}/wp-json/loopress/v1/forms/${id}`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  const remote = (await response.json()) as {settings: {form_title: string}}
  expect(remote.settings.form_title).toBe(title)
})

// Same isolation guarantee as snippet-sync.spec.ts / acf-sync.spec.ts: one bad sidecar in a
// directory of otherwise-valid forms must not block the rest of the batch.
test('skips a form with a malformed sidecar instead of blocking the others', async ({projectDir, runCli}) => {
  const formsDir = join(projectDir, 'forms')
  mkdirSync(formsDir, {recursive: true})
  writeFileSync(join(formsDir, 'broken.json'), '{ this is not valid json !!')

  const title = `E2E form isolation ${Date.now()}`
  writeForm(formsDir, 'good', title)

  const result = await runCli(['form', 'push'])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(unwrap(result.stderr)).toContain('Skipping')
  expect(unwrap(result.stderr)).toContain('broken.json')

  const listResult = await runCli(['form', 'list'])
  expect(listResult.exitCode).toBe(0)
  expect(listResult.stdout).toContain(title)
})

// Regression coverage for the same class of bug fixed for pages (see page-sync.spec.ts):
// pushForm's PUT-then-404-fallback-POST must recreate the form, not fail, when the locally
// recorded id no longer exists on the site.
test('recreates a form whose local id no longer exists on the site, instead of failing to push', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const title = `E2E form stale id ${Date.now()}`
  const formsDir = join(projectDir, 'forms')
  writeForm(formsDir, 'stale', title)

  const first = await runCli(['form', 'push'])
  expect(first.exitCode, first.stderr).toBe(0)
  const id = Number(soleJsonFile(formsDir).split('-')[0])

  const deleteResponse = await request.delete(`${wp.url}/wp-json/loopress/v1/forms/${id}`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(deleteResponse.ok()).toBe(true)

  const second = await runCli(['form', 'push'])
  expect(second.exitCode, second.stderr).toBe(0)
  expect(second.stdout).toContain('All forms pushed')

  const newId = Number(soleJsonFile(formsDir).split('-')[0])
  expect(newId).not.toBe(id)

  const verifyResponse = await request.get(`${wp.url}/wp-json/loopress/v1/forms/${newId}`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(verifyResponse.ok()).toBe(true)
  const remote = (await verifyResponse.json()) as {settings: {form_title: string}}
  expect(remote.settings.form_title).toBe(title)
})

// Unlike snippets, forms have a real DELETE endpoint, so this is a full round trip rather than
// the "data accumulates forever" tradeoff noted in the README for snippets.
test('pull removes the local file for a form deleted on WordPress, and does not resurrect it on the next push', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const title = `E2E form delete ${Date.now()}`
  const formsDir = join(projectDir, 'forms')
  writeForm(formsDir, 'to-delete', title)

  await runCli(['form', 'push'])
  const file = soleJsonFile(formsDir)
  const id = Number(file.split('-')[0])

  const deleteResponse = await request.delete(`${wp.url}/wp-json/loopress/v1/forms/${id}`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(deleteResponse.ok()).toBe(true)

  const pullResult = await runCli(['form', 'pull'])
  expect(pullResult.exitCode, pullResult.stderr).toBe(0)
  expect(unwrap(pullResult.stderr)).toContain('Removed')
  expect(existsSync(join(formsDir, file))).toBe(false)

  // `form pull` repopulates the directory with every form currently on the (shared) site, not
  // just this test's own, so the meaningful assertion is that the deleted id specifically
  // never comes back, not that the directory or the next push is empty.
  const pushResult = await runCli(['form', 'push'])
  expect(pushResult.exitCode).toBe(0)
  expect(existsSync(join(formsDir, file))).toBe(false)

  const verifyResponse = await request.get(`${wp.url}/wp-json/loopress/v1/forms/${id}`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(verifyResponse.status()).toBe(404)
})

test('never touches a hand-created file with no numeric id prefix while cleaning up orphans', async ({projectDir, runCli}) => {
  const formsDir = join(projectDir, 'forms')
  mkdirSync(formsDir, {recursive: true})
  writeFileSync(join(formsDir, 'hand-written.json'), JSON.stringify({settings: {form_title: 'Not yet pushed'}}))

  const result = await runCli(['form', 'pull'])
  expect(result.exitCode).toBe(0)
  expect(existsSync(join(formsDir, 'hand-written.json'))).toBe(true)
})

// FormService::requireActiveProvider() only has one real provider today (WPForms), so "multiple
// active at once" isn't reachable, unlike seo-sync.spec.ts's RankMath/Yoast pair. "Zero active"
// is the one reachable failure mode, mirrors acf-sync.spec.ts's "ACF plugin inactive" block.
test.describe('no active form plugin', () => {
  test.beforeAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, WPFORMS_SLUG, false)
    await page.close()
  })

  test.afterAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, WPFORMS_SLUG, true)
    await page.close()
  })

  test('form list fails with a clear "No supported form plugin is active" error', async ({runCli}) => {
    const result = await runCli(['form', 'list'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('No supported form plugin is active')
  })

  // Regression coverage, same shape as the SEO 409-not-500 test: FormController checks
  // isActive() up front on every route, so this must never fall through to a generic 500.
  test('the underlying REST response is a 409, not a 500', async ({request, wp}) => {
    const response = await request.get(`${wp.url}/wp-json/loopress/v1/forms`, {
      headers: {Authorization: authHeader(wp)},
    })

    expect(response.status()).toBe(409)
  })
})
