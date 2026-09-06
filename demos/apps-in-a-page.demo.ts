import {Buffer} from 'node:buffer'
import {cpSync, mkdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {expect, test} from '../e2e/helpers/environment.js'
import {glideTo, installCursor} from './lib/cursor.js'
import {beat, hold, typeHuman} from './lib/pace.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'fixtures', 'search-app')
const OUT = join(HERE, '.out')

function authHeader(wp: {appPassword: string; username: string}): string {
  return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`
}

// Records the payoff of the apps feature: a built SPA pushed with `lps app push`, then
// rendering and reacting inside an ordinary published WordPress page.
//
// Deliberately takes `browser`, not the `page` fixture: `page` auto-logs into wp-admin
// (e2e/helpers/environment.ts), and its video starts recording at context creation, so the
// clip would open on a login screen nobody asked to see. The published page is public, no
// login needed, so this opens its own unauthenticated context right on the money shot.
//
// The app name is timestamped, like the e2e app-sync spec's own fixtures: this pushes to
// (and the `finally` block removes) whatever is at that name on the target site, so a fixed
// name here could silently overwrite and then delete an app someone else already deployed.
test('a single-page app rendering inside a WordPress page', async ({browser, projectDir, request, runCli, wp}) => {
  const name = `demo-search-${Date.now()}`
  cpSync(FIXTURE, join(projectDir, 'apps', name), {recursive: true})

  const push = await runCli(['app', 'push', name])
  expect(push.exitCode, push.stderr).toBe(0)

  const created = await request.post(`${wp.url}/wp-json/wp/v2/pages`, {
    data: {content: `[loopress_app name="${name}"]`, status: 'publish', title: 'Search demo'},
    headers: {Authorization: authHeader(wp)},
  })
  expect(created.ok(), await created.text()).toBe(true)
  const {id: pageId, link} = (await created.json()) as {id: number; link: string}

  // Playwright writes the raw recording into `recordVideo.dir` under its own auto-generated
  // name; keep that out of `OUT` itself, or build.sh's `*.webm` glob picks up both it and the
  // saveAs() copy below and double-renders everything.
  const rawDir = join(OUT, '_raw')
  mkdirSync(rawDir, {recursive: true})
  const context = await browser.newContext({
    recordVideo: {dir: rawDir, size: {width: 1440, height: 900}},
    viewport: {width: 1440, height: 900},
  })
  const page = await context.newPage()
  const video = page.video()

  try {
    await installCursor(page)
    await page.goto(link)

    const app = page.locator('#loopress-demo-search')
    await expect(app.locator('.sa-item').first()).toBeVisible()
    await expect(page.locator('[data-demo-cursor]')).toBeAttached() // the injected cursor is live
    await hold(page)

    const input = app.locator('.sa-input')
    await glideTo(page, input)
    await input.click()
    await typeHuman(input, 'composer')
    await hold(page)
    await expect(app.locator('.sa-item')).toHaveCount(1)

    await input.selectText()
    await typeHuman(input, 'git')
    await hold(page)
    await beat(page, 2)
  } finally {
    await context.close()
    if (video) await video.saveAs(join(OUT, 'apps-in-a-page.webm'))

    await request.delete(`${wp.url}/wp-json/wp/v2/pages/${pageId}?force=true`, {
      headers: {Authorization: authHeader(wp)},
    })
    await runCli(['app', 'remove', name, '--yes'])
  }
})
