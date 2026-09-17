import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import type {WpCredentials} from './helpers/environment.js'

import {expect, test, unwrap} from './helpers/environment.js'

const BLOCK_THEME = 'twentytwentyfour'

function authHeader(wp: WpCredentials): string {
  return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`
}

// Twenty Twenty-Four ships with WordPress core and is a block theme (Full Site Editing), so it's
// always available on the shared e2e instance without installing anything extra. Whatever theme
// was active before this file ran is restored afterward, other spec files (and manual runs
// against a persistent instance) never see their active theme changed.
test.describe('theme-styles sync (block theme)', () => {
  let previousActiveTheme: string

  test.beforeAll(async ({requestUtils, wp}) => {
    const themes = await requestUtils.rest<Array<{status: string; stylesheet: string}>>({path: '/wp/v2/themes'})
    previousActiveTheme = themes.find((theme) => theme.status === 'active')!.stylesheet

    await requestUtils.activateTheme(BLOCK_THEME)
    // A prior run (or a prior spec file sharing this instance) may have left Global Styles
    // customizations behind; start from a clean slate so this file's assertions are about what
    // it itself pushed, not leftover state.
    await requestUtils.resetThemeGlobalStyles()
  })

  test.afterAll(async ({requestUtils}) => {
    await requestUtils.activateTheme(previousActiveTheme)
  })

  test('classic theme active: the command fails clearly instead of syncing nothing silently', async ({requestUtils, runCli}) => {
    // `theme_supports` on a *non-active* theme's list entry isn't reliably populated by
    // WordPress core (only the currently active theme's own entry is), so a candidate can only
    // be confirmed classic by actually activating it and re-reading its own entry. Every
    // installed theme other than the block one this file activates is tried in turn; the first
    // one that reports as non-block once active is used, and the whole assertion is skipped if
    // none exist on this instance (a fresh core download today ships only block themes).
    const initialThemes = await requestUtils.rest<Array<{stylesheet: string}>>({path: '/wp/v2/themes'})
    const candidates = initialThemes.map((theme) => theme.stylesheet).filter((slug) => slug !== BLOCK_THEME)

    let classicSlug: string | undefined
    for (const slug of candidates) {
      await requestUtils.activateTheme(slug)
      const themesOnceActive = await requestUtils.rest<Array<{status: string; stylesheet: string; theme_supports?: Record<string, unknown>}>>({
        path: '/wp/v2/themes',
      })
      const active = themesOnceActive.find((theme) => theme.status === 'active')
      if (active?.theme_supports?.['block-templates'] !== true) {
        classicSlug = slug
        break
      }
    }

    test.skip(!classicSlug, 'No classic theme installed on this instance to activate for this assertion.')

    try {
      const result = await runCli(['theme-styles', 'pull'])
      expect(result.exitCode).not.toBe(0)
      expect(unwrap(result.stderr)).toContain('classic theme')
    } finally {
      await requestUtils.activateTheme(BLOCK_THEME)
    }
  })

  test('pulls a color set via the REST API, then a locally edited color pushes back and reads live', async ({
    projectDir,
    request,
    requestUtils,
    runCli,
    wp,
  }) => {
    const stylesPostId = await requestUtils.getCurrentThemeGlobalStylesPostId()
    expect(stylesPostId).toBeTruthy()

    const firstColor = `#${Date.now().toString(16).slice(-6)}`
    const putResponse = await request.post(`${wp.url}/wp-json/wp/v2/global-styles/${stylesPostId}`, {
      data: {settings: {}, styles: {color: {background: firstColor}}},
      headers: {Authorization: authHeader(wp)},
    })
    expect(putResponse.ok()).toBe(true)

    const pullResult = await runCli(['theme-styles', 'pull'])
    expect(pullResult.exitCode).toBe(0)

    const file = join(projectDir, 'theme', `${BLOCK_THEME}-global-styles.json`)
    expect(existsSync(file)).toBe(true)
    const pulled = JSON.parse(readFileSync(file, 'utf8')) as {settings: Record<string, unknown>; styles: {color?: {background?: string}}}
    expect(pulled.styles.color?.background).toBe(firstColor)

    const secondColor = `#${(Date.now() + 1).toString(16).slice(-6)}`
    mkdirSync(join(projectDir, 'theme'), {recursive: true})
    writeFileSync(file, JSON.stringify({settings: pulled.settings, styles: {color: {background: secondColor}}}))

    const pushResult = await runCli(['theme-styles', 'push'])
    expect(pushResult.exitCode).toBe(0)

    const liveResponse = await request.get(`${wp.url}/wp-json/wp/v2/global-styles/${stylesPostId}`, {
      headers: {Authorization: authHeader(wp)},
    })
    expect(liveResponse.ok()).toBe(true)
    const live = (await liveResponse.json()) as {styles: {color?: {background?: string}}}
    expect(live.styles.color?.background).toBe(secondColor)
  })

  test('theme-styles diff reports no drift right after a pull', async ({runCli}) => {
    const pullResult = await runCli(['theme-styles', 'pull'])
    expect(pullResult.exitCode).toBe(0)

    const diffResult = await runCli(['theme-styles', 'diff'])
    expect(diffResult.exitCode).toBe(0)
    expect(diffResult.stdout).toContain('in sync')
  })
})
