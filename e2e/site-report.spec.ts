import {restDelete, restGet, restPut} from './helpers/rest.js'
import {expect, test} from './helpers/environment.js'

// The Console setting of the Settings tab (src/SiteReport/). Only the paths that never reach the
// Loopress api: a well-formed token would send a real report, which the unit tests cover with a
// mocked HTTP layer instead.
test('the site token route rejects a malformed token and never stores it', async ({request, wp}) => {
  const initial = await restGet(request, wp, 'loopress/v1/site-report')
  expect(initial.status()).toBe(200)
  expect(await initial.json()).toMatchObject({connected: false, token: null})

  const rejected = await restPut(request, wp, 'loopress/v1/site-report', {token: 'lps_not_a_site_token'})
  expect(rejected.status()).toBe(400)
  expect((await rejected.json()) as {error: string}).toMatchObject({error: expect.stringContaining('lps_site_')})

  const after = await restGet(request, wp, 'loopress/v1/site-report')
  expect(await after.json()).toMatchObject({connected: false, token: null})

  const disconnected = await restDelete(request, wp, 'loopress/v1/site-report')
  expect(disconnected.status()).toBe(200)
  expect(await disconnected.json()).toMatchObject({connected: false, token: null, connectedUrl: null})
})
