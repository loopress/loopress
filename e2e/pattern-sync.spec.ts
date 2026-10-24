import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restGet, uniqueSlug} from './helpers/rest.js'

type WpPage = {id: number}

function write(projectDir: string, dir: string, file: string, content: string): void {
  mkdirSync(join(projectDir, dir), {recursive: true})
  writeFileSync(join(projectDir, dir, file), content)
}

function pattern(text: string): string {
  return `<!--\ntitle: E2E Hero\ncategories: banner\n-->\n<!-- wp:paragraph -->\n<p id="e2e-pattern">${text}</p>\n<!-- /wp:paragraph -->\n`
}

let slug: string
test.beforeEach(() => {
  slug = uniqueSlug('e2e-pattern-')
})

test.afterEach(async ({requestUtils, runCli}) => {
  await runCli(['pattern', 'rm', slug, '--yes'])
  const pages = await requestUtils.rest<WpPage[]>({path: '/wp/v2/pages', params: {slug, status: 'any'}})
  for (const page of pages) {
    await requestUtils.rest({method: 'DELETE', path: `/wp/v2/pages/${page.id}`, params: {force: true}})
  }
})

test('a page referencing a pattern renders its current version, pushing the pattern alone updates it', async ({
  page,
  projectDir,
  request,
  runCli,
  wp,
}) => {
  write(projectDir, 'patterns', `${slug}.html`, pattern('first version'))
  write(projectDir, 'pages', `${slug}.html`, `<!--\ntitle: E2E ${slug}\nstatus: publish\n-->\n<!-- wp:pattern {"slug":"loopress/${slug}"} /-->\n`)

  const push = await runCli(['pattern', 'push'])
  expect(push.exitCode, output(push)).toBe(0)
  expect((await runCli(['page', 'push'])).exitCode).toBe(0)

  // WordPress core's own pattern registry, independent of the Loopress endpoints.
  const registered = await restGet(request, wp, 'wp/v2/block-patterns/patterns')
  const names = ((await registered.json()) as Array<{categories: string[]; name: string}>).filter((p) => p.name === `loopress/${slug}`)
  expect(names).toEqual([expect.objectContaining({categories: ['banner']})])

  await page.goto(`${wp.url}/${slug}/`)
  await expect(page.locator('#e2e-pattern')).toHaveText('first version')

  write(projectDir, 'patterns', `${slug}.html`, pattern('second version'))
  expect((await runCli(['pattern', 'push'])).exitCode).toBe(0)

  await page.goto(`${wp.url}/${slug}/`)
  await expect(page.locator('#e2e-pattern')).toHaveText('second version')

  const list = await runCli(['pattern', 'list'])
  expect(list.stdout).toContain(`${slug} (E2E Hero): Loopress`)
})

test('pull writes the pattern back as the same HTML file, diff then shows nothing', async ({projectDir, runCli}) => {
  write(projectDir, 'patterns', `${slug}.html`, pattern('pulled'))
  expect((await runCli(['pattern', 'push'])).exitCode).toBe(0)

  const pull = await runCli(['pattern', 'pull', '--yes'])
  expect(pull.exitCode, output(pull)).toBe(0)

  const diff = await runCli(['pattern', 'diff'])
  expect(diff.exitCode, output(diff)).toBe(0)
})

test('rollback restores the pattern content from before the last push', async ({projectDir, runCli}) => {
  write(projectDir, 'patterns', `${slug}.html`, pattern('rollback one'))
  expect((await runCli(['pattern', 'push'])).exitCode).toBe(0)
  write(projectDir, 'patterns', `${slug}.html`, pattern('rollback two'))
  expect((await runCli(['pattern', 'push'])).exitCode).toBe(0)

  const rollback = await runCli(['pattern', 'rollback', '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)
  expect(rollback.stdout).toContain('Rolled back')

  expect((await runCli(['pattern', 'pull', '--yes'])).exitCode).toBe(0)
  expect(readFileSync(join(projectDir, 'patterns', `${slug}.html`), 'utf8')).toContain('rollback one')
})
