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
// rendering and reacting inside an ordinary published WordPress page. Reuses the e2e
// fixture (auto wp-admin login, isolated CLI config, disposable instance).
test('a single-page app rendering inside a WordPress page', async ({page, projectDir, request, runCli, wp}) => {
  cpSync(FIXTURE, join(projectDir, 'apps', 'search'), {recursive: true})

  const push = await runCli(['app', 'push', 'search'])
  expect(push.exitCode, push.stderr).toBe(0)

  const created = await request.post(`${wp.url}/wp-json/wp/v2/pages`, {
    data: {content: '[loopress_app name="search"]', status: 'publish', title: 'Search demo'},
    headers: {Authorization: authHeader(wp)},
  })
  expect(created.ok(), await created.text()).toBe(true)
  const {id: pageId, link} = (await created.json()) as {id: number; link: string}

  try {
    await installCursor(page)
    await page.goto(link)

    const app = page.locator('#loopress-app-search')
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
    const video = page.video()
    await page.close()
    if (video) {
      mkdirSync(OUT, {recursive: true})
      await video.saveAs(join(OUT, 'apps-in-a-page.webm'))
    }

    await request.delete(`${wp.url}/wp-json/wp/v2/pages/${pageId}?force=true`, {
      headers: {Authorization: authHeader(wp)},
    })
    await runCli(['app', 'remove', 'search', '--yes'])
  }
})
