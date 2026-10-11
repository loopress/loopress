/* eslint-disable camelcase -- register_post_type() arguments are snake_case. */
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restGet, restPost, uniqueSlug} from './helpers/rest.js'

function writeCpt(projectDir: string, slug: string, args: Record<string, unknown>): string {
  const dir = join(projectDir, 'cpt')
  mkdirSync(dir, {recursive: true})
  const file = join(dir, `${slug}.json`)
  writeFileSync(file, JSON.stringify(args, null, 2) + '\n')
  return file
}

function cptArgs(label: string): Record<string, unknown> {
  return {labels: {name: label, singular_name: label}, public: true, show_in_rest: true, supports: ['title', 'editor']}
}


// Every test cleans up the post type it declared: the e2e instance is shared and long-lived,
// and a leftover Loopress post type is registered on every request from then on.
const declared: string[] = []
test.afterEach(async ({runCli}) => {
  for (const slug of declared.splice(0)) await runCli(['cpt', 'rm', slug, '--yes'])
})

test('pushes a post type that WordPress itself registers, lists it as Loopress, and accepts posts of it', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  writeCpt(projectDir, slug, cptArgs('E2E Books'))

  const push = await runCli(['cpt', 'push'])
  expect(push.exitCode, output(push)).toBe(0)
  expect(push.stdout).toContain('All post types pushed.')

  // wp/v2/types is WordPress core's own registry, not the Loopress REST layer under test.
  const type = await restGet(request, wp, `wp/v2/types/${slug}`)
  expect(type.ok()).toBe(true)
  expect(((await type.json()) as {name: string}).name).toBe('E2E Books')

  const created = await restPost(request, wp, `wp/v2/${slug}`, {status: 'publish', title: 'E2E first book'})
  expect(created.ok(), await created.text()).toBe(true)

  const list = await runCli(['cpt', 'list'])
  expect(list.exitCode).toBe(0)
  expect(list.stdout).toContain(`${slug} (E2E Books): Loopress, 1 published`)

  const listJson = await runCli(['cpt', 'list', '--json'])
  const items = JSON.parse(listJson.stdout) as Array<{conflict: boolean; managed: boolean; slug: string; source: string}>
  expect(items.find((item) => item.slug === slug)).toMatchObject({conflict: false, managed: true, source: 'loopress'})
  // WordPress's own post types are listed too, but never as Loopress ones.
  expect(items.find((item) => item.slug === 'post')).toMatchObject({managed: false, source: 'wordpress'})
})

test('pull writes back exactly the arguments that were pushed, named after the slug', async ({projectDir, runCli}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  const args = {...cptArgs('E2E Round Trip'), has_archive: true, menu_icon: 'dashicons-book', rewrite: {slug: `rt-${slug}`}}
  const file = writeCpt(projectDir, slug, args)

  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)
  rmSync(file)

  const pull = await runCli(['cpt', 'pull'])
  expect(pull.exitCode, output(pull)).toBe(0)
  expect(existsSync(file)).toBe(true)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(args)
})

test('a local edit pushed again updates the registered post type', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  writeCpt(projectDir, slug, cptArgs('E2E Before'))
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)

  writeCpt(projectDir, slug, cptArgs('E2E After'))
  const push = await runCli(['cpt', 'push'])
  expect(push.exitCode, output(push)).toBe(0)

  const type = await restGet(request, wp, `wp/v2/types/${slug}`)
  expect(((await type.json()) as {name: string}).name).toBe('E2E After')
})

test('rm stops registering the post type but keeps its posts, which come back on the next push', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  writeCpt(projectDir, slug, cptArgs('E2E Kept'))
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)

  const created = await restPost(request, wp, `wp/v2/${slug}`, {status: 'publish', title: 'E2E survivor'})
  expect(created.ok(), await created.text()).toBe(true)
  const {id} = (await created.json()) as {id: number}

  const rm = await runCli(['cpt', 'rm', slug, '--yes'])
  expect(rm.exitCode, output(rm)).toBe(0)
  expect(rm.stdout).toContain(`Removed post type ${slug}`)
  expect((await restGet(request, wp, `wp/v2/types/${slug}`)).status()).toBe(404)
  // The local file is the user's, rm never touches it.
  expect(existsSync(join(projectDir, 'cpt', `${slug}.json`))).toBe(true)

  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)
  const post = await restGet(request, wp, `wp/v2/${slug}/${id}`)
  expect(post.ok()).toBe(true)
  expect(((await post.json()) as {title: {rendered: string}}).title.rendered).toBe('E2E survivor')
})

test('rm without --yes refuses to run non-interactively, and leaves the post type registered', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  writeCpt(projectDir, slug, cptArgs('E2E Confirm'))
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)

  const rm = await runCli(['cpt', 'rm', slug])
  expect(rm.exitCode).not.toBe(0)
  expect(output(rm)).toContain('needs confirmation. Re-run with --yes.')
  expect((await restGet(request, wp, `wp/v2/types/${slug}`)).ok()).toBe(true)
})

test('rm of a post type Loopress does not manage fails clearly instead of touching it', async ({request, runCli, wp}) => {
  const rm = await runCli(['cpt', 'rm', 'post', '--yes'])

  expect(rm.exitCode).not.toBe(0)
  expect(output(rm)).toContain('post type post is not managed by Loopress')
  expect((await restGet(request, wp, 'wp/v2/types/post')).ok()).toBe(true)
})

test('rm --dry-run reports without removing anything', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  writeCpt(projectDir, slug, cptArgs('E2E Dry'))
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)

  const rm = await runCli(['cpt', 'rm', slug, '--dry-run'])
  expect(rm.exitCode).toBe(0)
  expect(rm.stdout).toContain(`[dry-run] Would remove post type ${slug}`)
  expect((await restGet(request, wp, `wp/v2/types/${slug}`)).ok()).toBe(true)
})

test('push --dry-run registers nothing', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2e')
  writeCpt(projectDir, slug, cptArgs('E2E Not Pushed'))

  const push = await runCli(['cpt', 'push', '--dry-run'])
  expect(push.exitCode, output(push)).toBe(0)
  expect((await restGet(request, wp, `wp/v2/types/${slug}`)).status()).toBe(404)
  expect((await restGet(request, wp, `loopress/v1/post-types/${slug}`)).status()).toBe(404)
})

test('WordPress refuses a reserved slug, and the push fails naming it', async ({projectDir, runCli}) => {
  writeCpt(projectDir, 'attachment', cptArgs('E2E Reserved'))

  const push = await runCli(['cpt', 'push'])

  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('Post type slug "attachment" is reserved by WordPress')
  expect(output(push)).toContain('1 post type failed to push')
})

test('WordPress refuses an argument that runs PHP code, which lps validate also flags offline', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2e')
  writeCpt(projectDir, slug, {...cptArgs('E2E Code'), register_meta_box_cb: 'phpinfo'})

  const validate = await runCli(['validate'])
  expect(validate.exitCode).toBe(1)
  expect(output(validate)).toContain('"register_meta_box_cb" runs PHP code')

  const push = await runCli(['cpt', 'push'])
  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('"register_meta_box_cb" runs PHP code, use a hook instead of a cpt/ file for it')
  expect((await restGet(request, wp, `loopress/v1/post-types/${slug}`)).status()).toBe(404)
})

test('WordPress refuses a string where it expects an array, instead of a fatal on every request', async ({projectDir, runCli}) => {
  const slug = uniqueSlug('e2e')
  writeCpt(projectDir, slug, {...cptArgs('E2E Array'), supports: 'title'})

  const push = await runCli(['cpt', 'push'])

  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('"supports" must be a JSON object or array (or false)')
})

test('a malformed file is skipped with a warning and does not block the other post types', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  writeCpt(projectDir, slug, cptArgs('E2E Survivor'))
  writeFileSync(join(projectDir, 'cpt', 'broken.json'), '{ "public": true,,, }')

  const push = await runCli(['cpt', 'push'])

  expect(push.exitCode, output(push)).toBe(0)
  expect(output(push)).toContain('broken.json')
  expect((await restGet(request, wp, `wp/v2/types/${slug}`)).ok()).toBe(true)
})

test('cpt diff reports no drift after a push + pull, then flags a local edit', async ({projectDir, runCli}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  const file = writeCpt(projectDir, slug, cptArgs('E2E Diff'))
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)
  // Pull everything the shared instance has, so the baseline is genuinely in sync.
  expect((await runCli(['cpt', 'pull'])).exitCode).toBe(0)

  const inSync = await runCli(['cpt', 'diff'])
  expect(inSync.exitCode, output(inSync)).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  writeFileSync(file, JSON.stringify(cptArgs('E2E Diff edited')))
  const drifted = await runCli(['cpt', 'diff'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain('Drift detected')
  expect(drifted.stdout).toContain(slug)
})

test('rollback restores the post type arguments from before the last push', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2e')
  declared.push(slug)
  writeCpt(projectDir, slug, cptArgs('E2E Version One'))
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)

  writeCpt(projectDir, slug, cptArgs('E2E Version Two'))
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)
  const before = await restGet(request, wp, `wp/v2/types/${slug}`)
  expect(((await before.json()) as {name: string}).name).toBe('E2E Version Two')

  const rollback = await runCli(['cpt', 'rollback', '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)
  expect(rollback.stdout).toContain('Rolled back Post types')

  const after = await restGet(request, wp, `wp/v2/types/${slug}`)
  expect(((await after.json()) as {name: string}).name).toBe('E2E Version One')
})
