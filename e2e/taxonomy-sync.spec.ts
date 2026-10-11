/* eslint-disable camelcase -- register_taxonomy() arguments are snake_case. */
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restGet, restPost, uniqueSlug} from './helpers/rest.js'

function writeTaxonomy(projectDir: string, slug: string, args: Record<string, unknown>): string {
  const dir = join(projectDir, 'taxonomies')
  mkdirSync(dir, {recursive: true})
  const file = join(dir, `${slug}.json`)
  writeFileSync(file, JSON.stringify(args, null, 2) + '\n')
  return file
}

function taxonomyArgs(label: string, objectType: string[] = ['post']): Record<string, unknown> {
  return {hierarchical: true, labels: {name: label, singular_name: label}, object_type: objectType, public: true, show_in_rest: true}
}


const declared: string[] = []
test.afterEach(async ({runCli}) => {
  for (const slug of declared.splice(0)) await runCli(['taxonomy', 'rm', slug, '--yes'])
})

test('pushes a taxonomy attached to posts, WordPress registers it and accepts terms in it', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2etax')
  declared.push(slug)
  writeTaxonomy(projectDir, slug, taxonomyArgs('E2E Genres'))

  const push = await runCli(['taxonomy', 'push'])
  expect(push.exitCode, output(push)).toBe(0)
  expect(push.stdout).toContain('All taxonomies pushed.')

  // wp/v2/taxonomies is WordPress core's own registry, independent of the Loopress endpoints.
  const taxonomy = await restGet(request, wp, `wp/v2/taxonomies/${slug}`)
  expect(taxonomy.ok()).toBe(true)
  expect(await taxonomy.json()).toMatchObject({hierarchical: true, name: 'E2E Genres', types: ['post']})

  const term = await restPost(request, wp, `wp/v2/${slug}`, {name: 'E2E Thriller'})
  expect(term.ok(), await term.text()).toBe(true)

  const list = await runCli(['taxonomy', 'list'])
  expect(list.exitCode).toBe(0)
  expect(list.stdout).toContain(`${slug} (E2E Genres): Loopress, 1 term, on post`)
})

test('a taxonomy attached to a Loopress post type pushed in the same session', async ({projectDir, request, runCli, wp}) => {
  const cpt = uniqueSlug('e2e')
  const slug = uniqueSlug('e2etax')
  declared.push(slug)
  mkdirSync(join(projectDir, 'cpt'), {recursive: true})
  writeFileSync(
    join(projectDir, 'cpt', `${cpt}.json`),
    JSON.stringify({labels: {name: 'E2E Films'}, public: true, show_in_rest: true}),
  )
  writeTaxonomy(projectDir, slug, taxonomyArgs('E2E Film Genres', [cpt]))

  try {
    expect((await runCli(['cpt', 'push'])).exitCode).toBe(0)
    expect((await runCli(['taxonomy', 'push'])).exitCode).toBe(0)

    const taxonomy = await restGet(request, wp, `wp/v2/taxonomies/${slug}`)
    expect(((await taxonomy.json()) as {types: string[]}).types).toEqual([cpt])
    const type = await restGet(request, wp, `wp/v2/types/${cpt}`)
    expect(((await type.json()) as {taxonomies: string[]}).taxonomies).toContain(slug)
  } finally {
    await runCli(['cpt', 'rm', cpt, '--yes'])
  }
})

test('pull writes back the arguments, object_type included, never the terms', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2etax')
  declared.push(slug)
  const args = {...taxonomyArgs('E2E Pulled'), rewrite: {slug: `pulled-${slug}`}}
  const file = writeTaxonomy(projectDir, slug, args)
  expect((await runCli(['taxonomy', 'push'])).exitCode).toBe(0)
  expect((await restPost(request, wp, `wp/v2/${slug}`, {name: 'E2E Not Pulled'})).ok()).toBe(true)

  rmSync(file)
  const pull = await runCli(['taxonomy', 'pull'])
  expect(pull.exitCode, output(pull)).toBe(0)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(args)
  expect(readFileSync(file, 'utf8')).not.toContain('E2E Not Pulled')
})

test('rm stops registering the taxonomy but keeps its terms, which come back on the next push', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const slug = uniqueSlug('e2etax')
  declared.push(slug)
  writeTaxonomy(projectDir, slug, taxonomyArgs('E2E Kept Terms'))
  expect((await runCli(['taxonomy', 'push'])).exitCode).toBe(0)
  const term = await restPost(request, wp, `wp/v2/${slug}`, {name: 'E2E Kept'})
  const {id} = (await term.json()) as {id: number}

  const rm = await runCli(['taxonomy', 'rm', slug, '--yes'])
  expect(rm.exitCode, output(rm)).toBe(0)
  expect(rm.stdout).toContain(`Removed taxonomy ${slug}`)
  expect((await restGet(request, wp, `wp/v2/taxonomies/${slug}`)).status()).toBe(404)

  expect((await runCli(['taxonomy', 'push'])).exitCode).toBe(0)
  const back = await restGet(request, wp, `wp/v2/${slug}/${id}`)
  expect(back.ok()).toBe(true)
  expect(((await back.json()) as {name: string}).name).toBe('E2E Kept')
})

test('rm of a taxonomy Loopress does not manage fails clearly', async ({runCli}) => {
  const rm = await runCli(['taxonomy', 'remove', 'category', '--yes'])

  expect(rm.exitCode).not.toBe(0)
  expect(output(rm)).toContain('taxonomy category is not managed by Loopress')
})

test('WordPress refuses default_term, since Loopress never syncs terms', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2etax')
  writeTaxonomy(projectDir, slug, {...taxonomyArgs('E2E Default Term'), default_term: {name: 'Uncategorized'}})

  const validate = await runCli(['validate'])
  expect(validate.exitCode).toBe(1)
  expect(output(validate)).toContain('"default_term" creates a term')

  const push = await runCli(['taxonomy', 'push'])
  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain("\"default_term\" creates a term, and Loopress doesn't sync terms")
  expect((await restGet(request, wp, `loopress/v1/taxonomies/${slug}`)).status()).toBe(404)
})

test('WordPress refuses a reserved taxonomy slug', async ({projectDir, runCli}) => {
  writeTaxonomy(projectDir, 'post_tag', taxonomyArgs('E2E Reserved'))

  const push = await runCli(['taxonomy', 'push'])

  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('Taxonomy slug "post_tag" is reserved by WordPress')
})

test('WordPress refuses a code argument and a non-array object_type', async ({projectDir, runCli}) => {
  writeTaxonomy(projectDir, uniqueSlug('e2etax'), {...taxonomyArgs('E2E Code'), meta_box_cb: 'phpinfo'})
  writeTaxonomy(projectDir, uniqueSlug('e2etax'), {...taxonomyArgs('E2E Object Type'), object_type: 'post'})

  const push = await runCli(['taxonomy', 'push'])

  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('"meta_box_cb" runs PHP code, use a hook instead of a taxonomies/ file for it')
  expect(output(push)).toContain('"object_type" must be a JSON object or array')
  expect(output(push)).toContain('2 taxonomies failed to push')
})

test('taxonomy diff flags a local edit after a pull, and rollback restores the previous push', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const slug = uniqueSlug('e2etax')
  declared.push(slug)
  const file = writeTaxonomy(projectDir, slug, taxonomyArgs('E2E Tax One'))
  expect((await runCli(['taxonomy', 'push'])).exitCode).toBe(0)
  expect((await runCli(['taxonomy', 'pull'])).exitCode).toBe(0)

  const inSync = await runCli(['taxonomy', 'diff'])
  expect(inSync.exitCode, output(inSync)).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  writeFileSync(file, JSON.stringify(taxonomyArgs('E2E Tax Two')))
  const drifted = await runCli(['taxonomy', 'diff'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain(slug)

  expect((await runCli(['taxonomy', 'push'])).exitCode).toBe(0)
  const rollback = await runCli(['taxonomy', 'rollback', '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)

  const taxonomy = await restGet(request, wp, `wp/v2/taxonomies/${slug}`)
  expect(((await taxonomy.json()) as {name: string}).name).toBe('E2E Tax One')
  expect(existsSync(file)).toBe(true)
})
