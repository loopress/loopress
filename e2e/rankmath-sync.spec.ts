/* eslint-disable camelcase -- rank_math_* meta keys mirror RankMath's own postmeta naming. */
import type {APIRequestContext} from '@playwright/test'

import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import type {WpCredentials} from './helpers/environment.js'

import {expect, test, unwrap} from './helpers/environment.js'
import {loginToWpAdmin, setPluginActive} from './helpers/wp-admin.js'

function authHeader(wp: WpCredentials): string {
  return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`
}

async function createPost(request: APIRequestContext, wp: WpCredentials, slug: string, title: string): Promise<number> {
  const response = await request.post(`${wp.url}/wp-json/wp/v2/posts`, {
    data: {slug, status: 'publish', title},
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  const post = (await response.json()) as {id: number}
  return post.id
}

test('pushes settings to WordPress and they read back identically', async ({projectDir, request, runCli, wp}) => {
  const dir = join(projectDir, 'rankmath')
  mkdirSync(dir, {recursive: true})
  const settings = {e2eMarker: `e2e-${Date.now()}`, titleSeparator: '-'}
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings))

  const pushResult = await runCli(['rankmath', 'push'])
  expect(pushResult.exitCode).toBe(0)

  const response = await request.get(`${wp.url}/wp-json/loopress/v1/rankmath/settings`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject(settings)
})

test('pushes post meta onto an existing post and it reads back identically', async ({projectDir, request, runCli, wp}) => {
  const slug = `e2e-rankmath-${Date.now()}`
  await createPost(request, wp, slug, 'E2E RankMath post')

  const dir = join(projectDir, 'rankmath', 'post-meta', 'post')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `${slug}.json`),
    JSON.stringify({meta: {rank_math_focus_keyword: 'e2e', rank_math_title: 'E2E SEO Title'}, slug, title: 'E2E RankMath post'}),
  )

  const pushResult = await runCli(['rankmath', 'push'])
  expect(pushResult.exitCode).toBe(0)

  const response = await request.get(`${wp.url}/wp-json/loopress/v1/rankmath/post-meta/post/${slug}`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as {meta: Record<string, unknown>}
  expect(body.meta.rank_math_title).toBe('E2E SEO Title')
  expect(body.meta.rank_math_focus_keyword).toBe('e2e')
})

// Pins down the explicit guard in RankMathService::upsertPostMeta(): unlike ACF field groups or
// redirects, RankMath data syncs onto existing content only, push must never create a post.
test('push fails clearly when the target post does not exist', async ({projectDir, runCli}) => {
  const dir = join(projectDir, 'rankmath', 'post-meta', 'post')
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, 'e2e-ghost-post.json'), JSON.stringify({meta: {}, slug: 'e2e-ghost-post', title: 'Ghost'}))

  const result = await runCli(['rankmath', 'push'])

  expect(result.exitCode).not.toBe(0)
  expect(unwrap(result.stderr)).toContain('does not create posts')
})

test('pull removes the local post-meta file for a post deleted on WordPress', async ({projectDir, request, runCli, wp}) => {
  const slug = `e2e-rankmath-orphan-${Date.now()}`
  const postId = await createPost(request, wp, slug, 'E2E RankMath orphan')

  const firstPull = await runCli(['rankmath', 'pull', '--post-type', 'post'])
  expect(firstPull.exitCode).toBe(0)
  const file = join(projectDir, 'rankmath', 'post-meta', 'post', `${slug}.json`)
  expect(existsSync(file)).toBe(true)

  const deleteResponse = await request.delete(`${wp.url}/wp-json/wp/v2/posts/${postId}?force=true`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(deleteResponse.ok()).toBe(true)

  const secondPull = await runCli(['rankmath', 'pull', '--post-type', 'post'])
  expect(secondPull.exitCode).toBe(0)
  expect(unwrap(secondPull.stderr)).toContain('Removed')
  expect(existsSync(file)).toBe(false)
})

// This is the least-verified corner of the RankMath integration: RankMathService's redirects
// table/column names (`{$wpdb->prefix}rank_math_redirections`) come from RankMath's documented
// schema, not a live install this codebase had checked when this test was written. If that
// schema is wrong, this is the test that's expected to catch it, with a loud 500 from the REST
// layer rather than silence.
test('creates a redirect and it shows up in the redirects list', async ({projectDir, runCli}) => {
  const dir = join(projectDir, 'rankmath', 'redirects')
  mkdirSync(dir, {recursive: true})
  const urlTo = `/e2e-redirect-${Date.now()}`
  writeFileSync(
    join(dir, 'draft.json'),
    JSON.stringify({
      createdAt: null,
      headerCode: 301,
      hits: 0,
      id: 0,
      sources: [{comparison: 'exact', pattern: `/e2e-old-path-${Date.now()}`}],
      status: 'active',
      updatedAt: null,
      urlTo,
    }),
  )

  const pushResult = await runCli(['rankmath', 'push'])
  expect(pushResult.exitCode).toBe(0)

  const listResult = await runCli(['rankmath', 'list'])
  expect(listResult.exitCode).toBe(0)
  expect(listResult.stdout).toContain(urlTo)
})

test.describe('RankMath plugin inactive', () => {
  test.beforeAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, 'seo-by-rank-math', false)
    await page.close()
  })

  test.afterAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, 'seo-by-rank-math', true)
    await page.close()
  })

  test('rankmath list fails with a clear "RankMath is not active" error instead of a 404 or a fatal', async ({runCli}) => {
    const result = await runCli(['rankmath', 'list'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('RankMath is not active')
  })
})
