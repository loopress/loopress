import type {APIRequestContext} from '@playwright/test'

import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import type {WpCredentials} from './helpers/environment.js'

import {expect, test, unwrap} from './helpers/environment.js'
import {loginToWpAdmin, setPluginActive} from './helpers/wp-admin.js'

const RANK_MATH_SLUG = 'seo-by-rank-math'
const YOAST_SLUG = 'wordpress-seo'

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

async function setBothActive(wp: WpCredentials, browser: {newPage(): Promise<import('@playwright/test').Page>}, active: boolean): Promise<void> {
  const page = await browser.newPage()
  await loginToWpAdmin(page, wp)
  await setPluginActive(page, wp, RANK_MATH_SLUG, active)
  await setPluginActive(page, wp, YOAST_SLUG, active)
  await page.close()
}

// The shared e2e instance normally has RankMath and Yoast active at once (SeoService::requireActiveProvider()
// rejects that combination, since neither `lps seo` command can tell which one is authoritative), so
// every other describe block below deactivates one before running and restores both afterward.
// This test alone wants that "both active" state, and ensures it explicitly rather than assuming
// no other spec file left the instance in a different state.
test.describe('both RankMath and Yoast active at once', () => {
  test.beforeAll(async ({browser, wp}) => {
    await setBothActive(wp, browser, true)
  })

  test('seo commands fail with a clear "Multiple SEO plugins are active" error', async ({runCli}) => {
    const result = await runCli(['seo', 'list'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('Multiple SEO plugins are active')
  })
})

test.describe('neither RankMath nor Yoast active', () => {
  test.beforeAll(async ({browser, wp}) => {
    await setBothActive(wp, browser, false)
  })

  test.afterAll(async ({browser, wp}) => {
    await setBothActive(wp, browser, true)
  })

  test('seo commands fail with a clear "No supported SEO plugin is active" error', async ({runCli}) => {
    const result = await runCli(['seo', 'list'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('No supported SEO plugin is active')
  })
})

test.describe('RankMath active alone', () => {
  test.beforeAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, YOAST_SLUG, false)
    await page.close()
  })

  test.afterAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, YOAST_SLUG, true)
    await page.close()
  })

  test('pushes settings to WordPress and they read back identically', async ({projectDir, request, runCli, wp}) => {
    const dir = join(projectDir, 'seo')
    mkdirSync(dir, {recursive: true})
    const settings = {e2eMarker: `e2e-${Date.now()}`, titleSeparator: '-'}
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings))

    const pushResult = await runCli(['seo', 'push'])
    expect(pushResult.exitCode).toBe(0)

    const response = await request.get(`${wp.url}/wp-json/loopress/v1/seo/settings`, {
      headers: {Authorization: authHeader(wp)},
    })
    expect(response.ok()).toBe(true)
    expect(await response.json()).toMatchObject(settings)
  })

  test('pushes post meta onto an existing post and it reads back identically', async ({projectDir, request, runCli, wp}) => {
    const slug = `e2e-rankmath-${Date.now()}`
    await createPost(request, wp, slug, 'E2E RankMath post')

    const dir = join(projectDir, 'seo', 'post-meta', 'post')
    mkdirSync(dir, {recursive: true})
    writeFileSync(
      join(dir, `${slug}.json`),
      JSON.stringify({meta: {'rank_math_focus_keyword': 'e2e', 'rank_math_title': 'E2E SEO Title'}, slug, title: 'E2E RankMath post'}),
    )

    const pushResult = await runCli(['seo', 'push'])
    expect(pushResult.exitCode).toBe(0)

    const response = await request.get(`${wp.url}/wp-json/loopress/v1/seo/post-meta/post/${slug}`, {
      headers: {Authorization: authHeader(wp)},
    })
    expect(response.ok()).toBe(true)
    const body = (await response.json()) as {meta: Record<string, unknown>}
    expect(body.meta.rank_math_title).toBe('E2E SEO Title')
    expect(body.meta.rank_math_focus_keyword).toBe('e2e')
  })

  // Pins down the explicit guard shared by RankMathService/YoastService: unlike ACF field
  // groups or redirects, SEO data syncs onto existing content only, push must never create a post.
  test('push fails clearly when the target post does not exist', async ({projectDir, runCli}) => {
    const dir = join(projectDir, 'seo', 'post-meta', 'post')
    mkdirSync(dir, {recursive: true})
    writeFileSync(join(dir, 'e2e-ghost-post.json'), JSON.stringify({meta: {}, slug: 'e2e-ghost-post', title: 'Ghost'}))

    const result = await runCli(['seo', 'push'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('does not create posts')
  })

  test('pull removes the local post-meta file for a post deleted on WordPress', async ({projectDir, request, runCli, wp}) => {
    const slug = `e2e-rankmath-orphan-${Date.now()}`
    const postId = await createPost(request, wp, slug, 'E2E RankMath orphan')

    const firstPull = await runCli(['seo', 'pull', '--post-type', 'post'])
    expect(firstPull.exitCode).toBe(0)
    const file = join(projectDir, 'seo', 'post-meta', 'post', `${slug}.json`)
    expect(existsSync(file)).toBe(true)

    const deleteResponse = await request.delete(`${wp.url}/wp-json/wp/v2/posts/${postId}?force=true`, {
      headers: {Authorization: authHeader(wp)},
    })
    expect(deleteResponse.ok()).toBe(true)

    const secondPull = await runCli(['seo', 'pull', '--post-type', 'post'])
    expect(secondPull.exitCode).toBe(0)
    expect(unwrap(secondPull.stderr)).toContain('Removed')
    expect(existsSync(file)).toBe(false)
  })

  // This is the least-verified corner of the SEO integration: RankMathService's redirects
  // table/column names (`{$wpdb->prefix}rank_math_redirections`) come from RankMath's documented
  // schema. If that schema is wrong, this is the test that's expected to catch it, with a loud
  // 500 from the REST layer rather than silence.
  test('creates a redirect and it shows up in the redirects list', async ({projectDir, runCli}) => {
    const dir = join(projectDir, 'seo', 'redirects')
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

    const pushResult = await runCli(['seo', 'push'])
    expect(pushResult.exitCode).toBe(0)

    const listResult = await runCli(['seo', 'list'])
    expect(listResult.exitCode).toBe(0)
    expect(listResult.stdout).toContain(urlTo)
  })
})

test.describe('Yoast active alone', () => {
  test.beforeAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, RANK_MATH_SLUG, false)
    await page.close()
  })

  test.afterAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, RANK_MATH_SLUG, true)
    await page.close()
  })

  // Unlike RankMath's `rank-math-options-titles` option (a plain get_option/update_option
  // passthrough), Yoast's `wpseo_titles` option is validated by Yoast's own sanitize_option
  // callback on every update_option() call: an arbitrary made-up key (tried first, see git
  // history) is silently dropped and the whole option comes back filled with Yoast's defaults
  // instead. `title-post` is one of Yoast's own real, freely-editable template fields, so a
  // custom value there survives that sanitizer and actually proves the round trip.
  test('pushes settings to WordPress and a real Yoast field reads back identically', async ({projectDir, request, runCli, wp}) => {
    const dir = join(projectDir, 'seo')
    mkdirSync(dir, {recursive: true})
    const titlePost = `E2E %%title%% ${Date.now()}`
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({'title-post': titlePost}))

    const pushResult = await runCli(['seo', 'push'])
    expect(pushResult.exitCode).toBe(0)

    const response = await request.get(`${wp.url}/wp-json/loopress/v1/seo/settings`, {
      headers: {Authorization: authHeader(wp)},
    })
    expect(response.ok()).toBe(true)
    const body = (await response.json()) as Record<string, unknown>
    expect(body['title-post']).toBe(titlePost)
  })

  test('pushes post meta onto an existing post and it reads back identically', async ({projectDir, request, runCli, wp}) => {
    const slug = `e2e-yoast-${Date.now()}`
    await createPost(request, wp, slug, 'E2E Yoast post')

    const dir = join(projectDir, 'seo', 'post-meta', 'post')
    mkdirSync(dir, {recursive: true})
    writeFileSync(
      join(dir, `${slug}.json`),
      JSON.stringify({meta: {'_yoast_wpseo_title': 'E2E SEO Title'}, slug, title: 'E2E Yoast post'}),
    )

    const pushResult = await runCli(['seo', 'push'])
    expect(pushResult.exitCode).toBe(0)

    const response = await request.get(`${wp.url}/wp-json/loopress/v1/seo/post-meta/post/${slug}`, {
      headers: {Authorization: authHeader(wp)},
    })
    expect(response.ok()).toBe(true)
    const body = (await response.json()) as {meta: Record<string, unknown>}
    expect(body.meta._yoast_wpseo_title).toBe('E2E SEO Title')
  })

  // Yoast has no free redirect manager, `seo pull` must degrade gracefully (warn, keep the rest
  // of the pull) rather than fail the whole command over a feature this plugin never supports.
  test('pull warns and skips redirects instead of failing', async ({projectDir, runCli}) => {
    const result = await runCli(['seo', 'pull'])

    expect(result.exitCode).toBe(0)
    expect(unwrap(result.stderr)).toContain('Skipping redirects')
  })

  // Unlike pull, push must fail clearly (not silently) if the user has a local redirect file:
  // silently dropping data the user explicitly created would be worse than an empty pull.
  test('push fails clearly for a local redirect file since Yoast does not support redirects', async ({projectDir, runCli}) => {
    const dir = join(projectDir, 'seo', 'redirects')
    mkdirSync(dir, {recursive: true})
    writeFileSync(
      join(dir, 'draft.json'),
      JSON.stringify({
        createdAt: null,
        headerCode: 301,
        hits: 0,
        id: 0,
        sources: [{comparison: 'exact', pattern: '/e2e-old-path'}],
        status: 'active',
        updatedAt: null,
        urlTo: '/e2e-new-path',
      }),
    )

    const result = await runCli(['seo', 'push'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('not supported')
  })
})
