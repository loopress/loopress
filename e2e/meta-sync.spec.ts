/* eslint-disable camelcase -- register_post_meta() arguments are snake_case. */
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restGet, restPost, uniqueSlug} from './helpers/rest.js'

// meta/<post-type>.json holds every Loopress key of that post type, and `meta rm` drops the whole
// file's worth at once. Declaring keys on `post` here would race other runs on the shared instance,
// so every test declares its keys on a throwaway Loopress post type of its own instead (custom-fields
// support is what makes WordPress expose registered meta on its REST route).
function writeCpt(projectDir: string, slug: string): void {
  mkdirSync(join(projectDir, 'cpt'), {recursive: true})
  writeFileSync(
    join(projectDir, 'cpt', `${slug}.json`),
    JSON.stringify({labels: {name: 'E2E Meta Host'}, public: true, show_in_rest: true, supports: ['title', 'custom-fields']}),
  )
}

function writeMeta(projectDir: string, postType: string, keys: Record<string, unknown>): string {
  const dir = join(projectDir, 'meta')
  mkdirSync(dir, {recursive: true})
  const file = join(dir, `${postType}.json`)
  writeFileSync(file, JSON.stringify(keys, null, 2) + '\n')
  return file
}


const hosts: string[] = []
test.afterEach(async ({runCli}) => {
  for (const slug of hosts.splice(0)) {
    await runCli(['meta', 'rm', slug, '--yes'])
    await runCli(['cpt', 'rm', slug, '--yes'])
  }
})

async function setupHost(projectDir: string, runCli: (args: string[]) => Promise<{exitCode: number}>): Promise<string> {
  const slug = uniqueSlug('e2em')
  hosts.push(slug)
  writeCpt(projectDir, slug)
  expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)
  return slug
}

test('pushed meta keys are registered by WordPress: a post stores and returns them over REST with their types', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const host = await setupHost(projectDir, runCli)
  writeMeta(projectDir, host, {
    e2e_isbn: {show_in_rest: true, single: true, type: 'string'},
    e2e_pages: {default: 0, show_in_rest: true, single: true, type: 'integer'},
    e2e_tags: {show_in_rest: {schema: {items: {type: 'string'}, type: 'array'}}, single: true, type: 'array'},
  })

  const push = await runCli(['meta', 'push'])
  expect(push.exitCode, output(push)).toBe(0)
  expect(push.stdout).toContain('All post meta pushed.')

  const created = await restPost(request, wp, `wp/v2/${host}`, {
    meta: {e2e_isbn: '978-0-00', e2e_pages: 321, e2e_tags: ['a', 'b']},
    status: 'publish',
    title: 'E2E meta post',
  })
  expect(created.ok(), await created.text()).toBe(true)
  const {id} = (await created.json()) as {id: number}

  const post = await restGet(request, wp, `wp/v2/${host}/${id}`)
  expect(((await post.json()) as {meta: Record<string, unknown>}).meta).toMatchObject({
    e2e_isbn: '978-0-00',
    e2e_pages: 321,
    e2e_tags: ['a', 'b'],
  })

  // The default applies to a post that never set the key.
  const bare = await restPost(request, wp, `wp/v2/${host}`, {status: 'publish', title: 'E2E bare'})
  const {id: bareId} = (await bare.json()) as {id: number}
  const barePost = await restGet(request, wp, `wp/v2/${host}/${bareId}`)
  expect(((await barePost.json()) as {meta: Record<string, unknown>}).meta.e2e_pages).toBe(0)
})

test('meta list reports each Loopress key with its post type and type, also as JSON', async ({projectDir, runCli}) => {
  const host = await setupHost(projectDir, runCli)
  writeMeta(projectDir, host, {e2e_rating: {show_in_rest: true, single: true, type: 'number'}})
  expect((await runCli(['meta', 'push'])).exitCode).toBe(0)

  const list = await runCli(['meta', 'list'])
  expect(list.exitCode).toBe(0)
  expect(list.stdout).toContain(`${host}.e2e_rating (number): Loopress, in REST`)

  const json = await runCli(['meta', 'list', '--json'])
  const keys = JSON.parse(json.stdout) as Array<{key: string; postType: string}>
  expect(keys.find((key) => key.postType === host && key.key === 'e2e_rating')).toMatchObject({
    conflict: false,
    managed: true,
    showInRest: true,
    single: true,
    source: 'loopress',
    type: 'number',
  })
})

test('pull writes back the declared keys only, never the values stored on posts', async ({projectDir, request, runCli, wp}) => {
  const host = await setupHost(projectDir, runCli)
  const keys = {e2e_subtitle: {description: 'Shown under the title', show_in_rest: true, single: true, type: 'string'}}
  const file = writeMeta(projectDir, host, keys)
  expect((await runCli(['meta', 'push'])).exitCode).toBe(0)
  await restPost(request, wp, `wp/v2/${host}`, {meta: {e2e_subtitle: 'E2E secret value'}, status: 'publish', title: 'E2E'})

  rmSync(file)
  const pull = await runCli(['meta', 'pull'])
  expect(pull.exitCode, output(pull)).toBe(0)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(keys)
  expect(readFileSync(file, 'utf8')).not.toContain('E2E secret value')
})

test('rm unregisters the keys of one post type but keeps their values, which come back on the next push', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const host = await setupHost(projectDir, runCli)
  writeMeta(projectDir, host, {e2e_kept: {show_in_rest: true, single: true, type: 'string'}})
  expect((await runCli(['meta', 'push'])).exitCode).toBe(0)
  const created = await restPost(request, wp, `wp/v2/${host}`, {meta: {e2e_kept: 'still here'}, status: 'publish', title: 'E2E'})
  const {id} = (await created.json()) as {id: number}

  const rm = await runCli(['meta', 'rm', host, '--yes'])
  expect(rm.exitCode, output(rm)).toBe(0)
  const unregistered = await restGet(request, wp, `wp/v2/${host}/${id}`)
  expect(((await unregistered.json()) as {meta: Record<string, unknown>}).meta).not.toHaveProperty('e2e_kept')

  expect((await runCli(['meta', 'push'])).exitCode).toBe(0)
  const back = await restGet(request, wp, `wp/v2/${host}/${id}`)
  expect(((await back.json()) as {meta: Record<string, unknown>}).meta.e2e_kept).toBe('still here')
})

test('built-in post types are allowed: meta/post.json is not a reserved slug', async ({projectDir, request, runCli, wp}) => {
  // Read-only check through dry-run: a real push would replace whatever meta/post.json other runs
  // declared on the shared instance. WordPress's acceptance is covered by the custom type above.
  writeMeta(projectDir, 'post', {e2e_dry: {single: true, type: 'string'}})

  const push = await runCli(['meta', 'push', '--dry-run'])

  expect(push.exitCode, output(push)).toBe(0)
  expect(push.stdout).toContain('Found 1 post meta to push')
  const stored = await restGet(request, wp, 'loopress/v1/post-meta')
  const items = (await stored.json()) as Array<{args: Record<string, unknown>; slug: string}>
  expect(items.find((item) => item.slug === 'post')?.args ?? {}).not.toHaveProperty('e2e_dry')
})

test('WordPress refuses an array key exposed in REST without a schema, which validate also catches', async ({projectDir, runCli}) => {
  writeMeta(projectDir, uniqueSlug('e2em'), {e2e_list: {show_in_rest: true, single: true, type: 'array'}})

  const validate = await runCli(['validate'])
  expect(validate.exitCode).toBe(1)
  expect(output(validate)).toContain('a array exposed in REST needs "show_in_rest": { "schema": {...} }')

  const push = await runCli(['meta', 'push'])
  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('a array exposed in REST needs "show_in_rest": { "schema": {...} }')
})

test('WordPress refuses an unknown type, a default of the wrong type and a PHP callback', async ({projectDir, runCli}) => {
  writeMeta(projectDir, uniqueSlug('e2em'), {e2e_x: {type: 'date'}})
  writeMeta(projectDir, uniqueSlug('e2em'), {e2e_y: {default: 'ten', type: 'integer'}})
  writeMeta(projectDir, uniqueSlug('e2em'), {e2e_z: {sanitize_callback: 'phpinfo', type: 'string'}})

  const push = await runCli(['meta', 'push'])

  expect(push.exitCode).not.toBe(0)
  const text = output(push)
  expect(text).toContain('"e2e_x": "type" must be one of string, boolean, integer, number, array, object')
  expect(text).toContain('"e2e_y": "default" must be a integer')
  expect(text).toContain('"e2e_z": "sanitize_callback" runs PHP code, use a hook instead of a meta/ file for it')
  expect(text).toContain('3 post meta failed to push')
})

test('meta diff is in sync after push + pull, then flags an added key', async ({projectDir, runCli}) => {
  const host = await setupHost(projectDir, runCli)
  const file = writeMeta(projectDir, host, {e2e_a: {single: true, type: 'string'}})
  expect((await runCli(['meta', 'push'])).exitCode).toBe(0)
  expect((await runCli(['meta', 'pull'])).exitCode).toBe(0)

  const inSync = await runCli(['meta', 'diff'])
  expect(inSync.exitCode, output(inSync)).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  writeFileSync(file, JSON.stringify({e2e_a: {single: true, type: 'string'}, e2e_b: {single: true, type: 'boolean'}}))
  const drifted = await runCli(['meta', 'diff'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain(host)
})

test('rollback restores the keys declared before the last push', async ({projectDir, request, runCli, wp}) => {
  const host = await setupHost(projectDir, runCli)
  writeMeta(projectDir, host, {e2e_v1: {single: true, type: 'string'}})
  expect((await runCli(['meta', 'push'])).exitCode).toBe(0)
  writeMeta(projectDir, host, {e2e_v2: {single: true, type: 'string'}})
  expect((await runCli(['meta', 'push'])).exitCode).toBe(0)

  const rollback = await runCli(['meta', 'rollback', '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)

  const stored = await restGet(request, wp, `loopress/v1/post-meta/${host}`)
  expect(((await stored.json()) as {args: Record<string, unknown>}).args).toEqual({e2e_v1: {single: true, type: 'string'}})
})
