import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restGet} from './helpers/rest.js'

// `<resource> rollback` for the resources whose own spec only covers push/pull: ACF, menus and
// Global Styles. Each one is the same scenario: push v1, push v2, roll back,
// and check WordPress itself holds v1 again. Forms are left out: the CI site has no form plugin.

test('acf rollback restores a field group title from before the last push', async ({projectDir, runCli}) => {
  const key = `group_e2e_rb_${Date.now()}`
  const dir = join(projectDir, 'acf', 'field-groups')
  mkdirSync(dir, {recursive: true})
  const write = (title: string) =>
    writeFileSync(
      join(dir, `${key}.json`),
      JSON.stringify({active: true, fields: [], key, location: [[{operator: '==', param: 'post_type', value: 'post'}]], title}),
    )

  write(`E2E acf rollback one ${key}`)
  expect((await runCli(['acf', 'push'])).exitCode).toBe(0)
  write(`E2E acf rollback two ${key}`)
  expect((await runCli(['acf', 'push'])).exitCode).toBe(0)

  const rollback = await runCli(['acf', 'rollback', '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)
  expect(rollback.stdout).toContain('Rolled back')

  // Read back through `acf pull`, the same view of WordPress every other ACF assertion uses.
  expect((await runCli(['acf', 'pull', '--yes'])).exitCode).toBe(0)
  const pulled = JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8')) as {title: string}
  expect(pulled.title).toBe(`E2E acf rollback one ${key}`)
})

test('menu rollback restores the menu name from before the last push', async ({projectDir, request, runCli, wp}) => {
  const slug = `e2e-menu-rb-${Date.now()}`
  const dir = join(projectDir, 'menus')
  mkdirSync(dir, {recursive: true})
  const item = {
    children: [],
    classes: [],
    description: '',
    object: null,
    objectSlug: null,
    target: '',
    title: 'E2E link',
    type: 'custom',
    url: 'https://example.com/',
    xfn: '',
  }
  const write = (name: string) => writeFileSync(join(dir, `${slug}.json`), JSON.stringify({items: [item], name, slug, warnings: []}))

  write('E2E menu one')
  expect((await runCli(['menu', 'push'])).exitCode).toBe(0)
  write('E2E menu two')
  expect((await runCli(['menu', 'push'])).exitCode).toBe(0)

  const rollback = await runCli(['menu', 'rollback', '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)

  // wp/v2/menus is WordPress core's own endpoint, independent of the Loopress menu layer.
  const menus = await restGet(request, wp, `wp/v2/menus?slug=${slug}`)
  const [menu] = (await menus.json()) as Array<{name: string}>
  expect(menu.name).toBe('E2E menu one')
})

test.describe('Global Styles history (block theme)', () => {
  const BLOCK_THEME = 'twentytwentyfour'
  let previousActiveTheme: string

  test.beforeAll(async ({requestUtils}) => {
    const themes = await requestUtils.rest<Array<{status: string; stylesheet: string}>>({path: '/wp/v2/themes'})
    previousActiveTheme = themes.find((theme) => theme.status === 'active')!.stylesheet
    await requestUtils.activateTheme(BLOCK_THEME)
    await requestUtils.resetThemeGlobalStyles()
  })

  test.afterAll(async ({requestUtils}) => {
    await requestUtils.resetThemeGlobalStyles()
    await requestUtils.activateTheme(previousActiveTheme)
  })

  test('theme style rollback restores the colors from before the last push', async ({projectDir, request, requestUtils, runCli, wp}) => {
    const file = join(projectDir, 'theme', `${BLOCK_THEME}-global-styles.json`)
    mkdirSync(join(projectDir, 'theme'), {recursive: true})
    writeFileSync(file, JSON.stringify({settings: {}, styles: {color: {background: '#111111'}}}))
    const first = await runCli(['theme', 'style', 'push'])
    expect(first.exitCode, output(first)).toBe(0)
    writeFileSync(file, JSON.stringify({settings: {}, styles: {color: {background: '#222222'}}}))
    expect((await runCli(['theme', 'style', 'push'])).exitCode).toBe(0)

    const rollback = await runCli(['theme', 'style', 'rollback', '--yes'])
    expect(rollback.exitCode, output(rollback)).toBe(0)

    const id = await requestUtils.getCurrentThemeGlobalStylesPostId()
    const live = await restGet(request, wp, `wp/v2/global-styles/${id}`)
    expect(((await live.json()) as {styles: {color?: {background?: string}}}).styles.color?.background).toBe('#111111')
  })
})
