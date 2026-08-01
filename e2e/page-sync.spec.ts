import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test, type WpCredentials} from './helpers/environment.js'

function authHeader(wp: WpCredentials): string {
  return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`
}

function writePage(dir: string, basename: string, title: string, content: string): void {
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, `${basename}.html`), content)
  writeFileSync(join(dir, `${basename}.json`), JSON.stringify({status: 'draft', title}))
}

function readSoleJson(dir: string): {id: number} {
  const jsonFile = readdirSync(dir).find((file) => file.endsWith('.json'))
  if (!jsonFile) throw new Error(`No .json sidecar found in ${dir}`)
  return JSON.parse(readFileSync(join(dir, jsonFile), 'utf8')) as {id: number}
}

test('pushes a new page, and the local file is renamed to <id>-<slug>', async ({projectDir, request, runCli, wp}) => {
  const title = `E2E page round trip ${Date.now()}`
  const pagesDir = join(projectDir, 'pages')
  writePage(pagesDir, 'roundtrip', title, '<p>hello from e2e</p>')

  const result = await runCli(['page', 'push'])
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stdout).toContain('All pages pushed')

  const {id} = readSoleJson(pagesDir)
  // Renamed to the canonical `<id>-<slug>` pair (see pageFileBase in utils/page-format.ts);
  // the exact slug text isn't asserted here, that's already covered at the unit level
  // (page/push.test.ts's ensureCanonicalFilename suite).
  expect(readdirSync(pagesDir).filter((file) => file.startsWith(`${id}-`))).toHaveLength(2)

  const response = await request.get(`${wp.url}/wp-json/wp/v2/pages/${id}?context=edit`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  const remote = (await response.json()) as {title: {raw: string}}
  expect(remote.title.raw).toBe(title)
})

// Regression coverage: the fallback POST used to reuse the same payload as the failed PUT,
// which still carried the now-stale `id` field. WordPress core rejects any create request that
// carries an `id` with a 400 "Cannot create existing post", regardless of whether that id
// actually exists, so this used to fail on every retry until the id was removed by hand.
test('recreates a page whose local id no longer exists on the site, instead of failing to push', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const title = `E2E page stale id ${Date.now()}`
  const pagesDir = join(projectDir, 'pages')
  writePage(pagesDir, 'stale', title, '<p>stale id test</p>')

  const first = await runCli(['page', 'push'])
  expect(first.exitCode, first.stderr).toBe(0)
  const {id} = readSoleJson(pagesDir)

  const deleteResponse = await request.delete(`${wp.url}/wp-json/wp/v2/pages/${id}?force=true`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(deleteResponse.ok()).toBe(true)

  const second = await runCli(['page', 'push'])
  expect(second.exitCode, second.stderr).toBe(0)
  expect(second.stdout).toContain('All pages pushed')

  const {id: newId} = readSoleJson(pagesDir)
  expect(newId).not.toBe(id)

  const verifyResponse = await request.get(`${wp.url}/wp-json/wp/v2/pages/${newId}?context=edit`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(verifyResponse.ok()).toBe(true)
  const remote = (await verifyResponse.json()) as {title: {raw: string}}
  expect(remote.title.raw).toBe(title)
})
