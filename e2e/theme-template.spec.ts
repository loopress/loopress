import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'

// `lps theme template` writes theme/templates/*.html and theme/parts/*.html as the files of a
// <parent>-loopress child theme. Same block parent as theme-styles-sync.spec.ts (core ships it).
const BLOCK_THEME = 'twentytwentyfour'
const CHILD_THEME = `${BLOCK_THEME}-loopress`


function writeTemplate(projectDir: string, kind: 'parts' | 'templates', slug: string, html: string): string {
  const dir = join(projectDir, 'theme', kind)
  mkdirSync(dir, {recursive: true})
  const file = join(dir, `${slug}.html`)
  writeFileSync(file, html)
  return file
}

function paragraph(text: string): string {
  return `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->\n`
}

// Both: a posts-on-front site renders front-page.html when the theme has one, home.html otherwise.
function writeHome(projectDir: string, marker: string): void {
  const html = `<!-- wp:template-part {"slug":"header"} /-->\n${paragraph(marker)}`
  writeTemplate(projectDir, 'templates', 'home', html)
  writeTemplate(projectDir, 'templates', 'front-page', html)
}

test.describe('theme template sync (block theme)', () => {
  let previousActiveTheme: string

  test.beforeAll(async ({requestUtils}) => {
    const themes = await requestUtils.rest<Array<{status: string; stylesheet: string}>>({path: '/wp/v2/themes'})
    previousActiveTheme = themes.find((theme) => theme.status === 'active')!.stylesheet
    await requestUtils.activateTheme(BLOCK_THEME)
  })

  test.afterAll(async ({requestUtils}) => {
    await requestUtils.activateTheme(previousActiveTheme)
  })

  // Leaves the child theme empty, whatever a test pushed into it.
  test.afterEach(async ({projectDir, requestUtils, runCli}) => {
    await requestUtils.activateTheme(BLOCK_THEME)
    rmSync(join(projectDir, 'theme'), {force: true, recursive: true})
    const cleanup = await runCli(['theme', 'template', 'push', '--yes'])
    expect(cleanup.exitCode, output(cleanup)).toBe(0)
  })

  test('pushes a template and a part as a child theme that renders them once activated, never activating it itself', async ({
    projectDir,
    request,
    requestUtils,
    runCli,
    wp,
  }) => {
    const marker = `E2E template marker ${Date.now()}`
    const partMarker = `E2E header part ${Date.now()}`
    writeHome(projectDir, marker)
    writeTemplate(projectDir, 'parts', 'header', paragraph(partMarker))

    const push = await runCli(['theme', 'template', 'push'])
    expect(push.exitCode, output(push)).toBe(0)
    expect(push.stdout).toContain(`Child theme ${CHILD_THEME} written.`)
    expect(output(push)).toContain(`${CHILD_THEME} is not the active theme, so nothing changed on the site yet`)

    const before = await request.get(`${wp.url}/`)
    expect(await before.text()).not.toContain(marker)

    await requestUtils.activateTheme(CHILD_THEME)
    const after = await request.get(`${wp.url}/`)
    const html = await after.text()
    expect(html).toContain(marker)
    expect(html).toContain(partMarker)

    const list = await runCli(['theme', 'template', 'list', '--json'])
    expect(JSON.parse(list.stdout)).toMatchObject({
      active: true,
      exists: true,
      parent: BLOCK_THEME,
      parts: ['header'],
      stylesheet: CHILD_THEME,
    })
    expect((JSON.parse(list.stdout) as {templates: string[]}).templates.sort()).toEqual(['front-page', 'home'])
  })

  test('the child mirrors the project: a template removed locally is removed from it on the next push', async ({
    projectDir,
    runCli,
  }) => {
    writeTemplate(projectDir, 'templates', 'single', paragraph('E2E single'))
    const archive = writeTemplate(projectDir, 'templates', 'archive', paragraph('E2E archive'))
    expect((await runCli(['theme', 'template', 'push'])).exitCode).toBe(0)

    rmSync(archive)
    expect((await runCli(['theme', 'template', 'push'])).exitCode).toBe(0)

    const list = await runCli(['theme', 'template', 'list', '--json'])
    expect((JSON.parse(list.stdout) as {templates: string[]}).templates).toEqual(['single'])
  })

  test('refuses every badly named file at once, before pushing anything', async ({projectDir, runCli}) => {
    writeTemplate(projectDir, 'templates', 'single', paragraph('E2E good'))
    writeTemplate(projectDir, 'templates', 'Bad Name', paragraph('E2E bad'))
    writeTemplate(projectDir, 'parts', 'Also_Bad', paragraph('E2E bad part'))

    const push = await runCli(['theme', 'template', 'push'])

    expect(push.exitCode).not.toBe(0)
    expect(output(push)).toContain('Nothing was pushed, fix these files first')
    expect(output(push)).toContain('Bad Name')
    expect(output(push)).toContain('Also_Bad')
    const list = await runCli(['theme', 'template', 'list', '--json'])
    expect((JSON.parse(list.stdout) as {templates: string[]}).templates).not.toContain('single')
  })

  test('refuses a template-part block pinned to another theme, which would silently bypass parts/', async ({projectDir, runCli}) => {
    writeTemplate(projectDir, 'templates', 'single', `<!-- wp:template-part {"slug":"header","theme":"${BLOCK_THEME}"} /-->\n`)

    const push = await runCli(['theme', 'template', 'push'])

    expect(push.exitCode).not.toBe(0)
    expect(output(push)).toContain('a template-part block has a "theme" attribute')
  })

  test('template diff is in sync right after a push, and flags a local edit', async ({projectDir, runCli}) => {
    const file = writeTemplate(projectDir, 'templates', 'single', paragraph('E2E diff one'))
    expect((await runCli(['theme', 'template', 'push'])).exitCode).toBe(0)

    const inSync = await runCli(['theme', 'template', 'diff'])
    expect(inSync.exitCode, output(inSync)).toBe(0)
    expect(inSync.stdout).toContain('Everything is in sync')

    writeFileSync(file, paragraph('E2E diff two'))
    const drifted = await runCli(['theme', 'template', 'diff'])
    expect(drifted.exitCode).toBe(1)
    expect(drifted.stdout).toContain('single')
  })

  test('--dry-run does not write the child theme', async ({projectDir, runCli}) => {
    writeTemplate(projectDir, 'templates', 'single', paragraph('E2E dry run'))

    const push = await runCli(['theme', 'template', 'push', '--dry-run'])

    expect(push.exitCode, output(push)).toBe(0)
    expect(push.stdout).toContain('[dry-run] created: templates/single')
    const list = await runCli(['theme', 'template', 'list', '--json'])
    expect((JSON.parse(list.stdout) as {templates: string[]}).templates).not.toContain('single')
  })
})
