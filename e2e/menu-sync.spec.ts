import type {APIRequestContext} from '@playwright/test'

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import type {WpCredentials} from './helpers/environment.js'

import {expect, test, unwrap} from './helpers/environment.js'

function authHeader(wp: WpCredentials): string {
  return `Basic ${Buffer.from(`${wp.username}:${wp.appPassword}`).toString('base64')}`
}

async function createPage(request: APIRequestContext, wp: WpCredentials, slug: string, title: string): Promise<number> {
  const response = await request.post(`${wp.url}/wp-json/wp/v2/pages`, {
    data: {slug, status: 'publish', title},
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  const page = (await response.json()) as {id: number}
  return page.id
}

// wp/v2/menus and wp/v2/menu-items are WordPress core's own REST endpoints (since 5.9), not
// anything Loopress adds: used here specifically to verify the created menu's real state
// independently of the Loopress REST layer under test, the same reasoning acf-sync.spec.ts's
// wp/v2/types check uses.
async function findMenuTermId(request: APIRequestContext, wp: WpCredentials, slug: string): Promise<number> {
  const response = await request.get(`${wp.url}/wp-json/wp/v2/menus?slug=${slug}`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  const menus = (await response.json()) as Array<{id: number; slug: string}>
  const found = menus.find((candidate) => candidate.slug === slug)
  expect(found, `expected a wp/v2/menus entry for slug "${slug}"`).toBeTruthy()
  return found!.id
}

type WpMenuItem = {id: number; object_id: number; parent: number}

async function fetchMenuItems(request: APIRequestContext, wp: WpCredentials, menuTermId: number): Promise<WpMenuItem[]> {
  const response = await request.get(`${wp.url}/wp-json/wp/v2/menu-items?menus=${menuTermId}&per_page=100`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(response.ok()).toBe(true)
  return response.json()
}

function menuFile(slug: string, name: string, items: unknown[]): string {
  return JSON.stringify({items, name, slug, warnings: []})
}

test('pushes a menu whose items resolve to the real object ids on this environment, verified via the native wp/v2/menu-items endpoint', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const slug = `e2e-menu-${Date.now()}`
  const aboutSlug = `e2e-about-${Date.now()}`
  const contactSlug = `e2e-contact-${Date.now()}`
  const aboutId = await createPage(request, wp, aboutSlug, 'About')
  const contactId = await createPage(request, wp, contactSlug, 'Contact')

  const dir = join(projectDir, 'menus')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `${slug}.json`),
    menuFile(slug, 'E2E Menu', [
      {
        children: [
          {
            children: [],
            classes: [],
            description: '',
            object: 'page',
            objectSlug: contactSlug,
            target: '',
            title: '',
            type: 'post_type',
            url: null,
            xfn: '',
          },
        ],
        classes: [],
        description: '',
        object: 'page',
        objectSlug: aboutSlug,
        target: '',
        title: '',
        type: 'post_type',
        url: null,
        xfn: '',
      },
    ]),
  )

  const pushResult = await runCli(['menu', 'push'])
  expect(pushResult.exitCode, pushResult.stdout + pushResult.stderr).toBe(0)

  const termId = await findMenuTermId(request, wp, slug)
  const items = await fetchMenuItems(request, wp, termId)
  expect(items).toHaveLength(2)

  const aboutItem = items.find((item) => item.object_id === aboutId)
  const contactItem = items.find((item) => item.object_id === contactId)
  expect(aboutItem, 'the about item must resolve to the real page id on this environment, not a raw pasted id').toBeTruthy()
  expect(contactItem, 'the contact item must resolve to the real page id on this environment').toBeTruthy()
  expect(contactItem!.parent).toBe(aboutItem!.id)

  // Pulling it back must produce the same portable, slug-based identity, not the ids just
  // asserted above: those are this environment's own, and must never leak into the tracked file.
  const pullResult = await runCli(['menu', 'pull'])
  expect(pullResult.exitCode).toBe(0)
  const pulled = JSON.parse(readFileSync(join(dir, `${slug}.json`), 'utf8')) as {
    items: Array<{children: Array<{objectSlug: string}>; objectSlug: string}>
  }
  expect(pulled.items[0].objectSlug).toBe(aboutSlug)
  expect(pulled.items[0].children[0].objectSlug).toBe(contactSlug)
})

test('push fails clearly, before touching the menu, when an item references a slug that does not exist here', async ({
  projectDir,
  runCli,
}) => {
  const slug = `e2e-menu-ghost-${Date.now()}`
  const dir = join(projectDir, 'menus')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `${slug}.json`),
    menuFile(slug, 'E2E Ghost Menu', [
      {
        children: [],
        classes: [],
        description: '',
        object: 'page',
        objectSlug: `e2e-does-not-exist-${Date.now()}`,
        target: '',
        title: '',
        type: 'post_type',
        url: null,
        xfn: '',
      },
    ]),
  )

  const result = await runCli(['menu', 'push'])

  expect(result.exitCode).not.toBe(0)
  expect(unwrap(result.stderr)).toContain('was found')

  const listResult = await runCli(['menu', 'list'])
  expect(listResult.stdout).not.toContain(slug)
})

test('modifying a pulled menu and pushing again updates the item on WordPress', async ({projectDir, request, runCli, wp}) => {
  const slug = `e2e-menu-edit-${Date.now()}`
  const dir = join(projectDir, 'menus')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `${slug}.json`),
    menuFile(slug, 'E2E Edit Menu', [
      {
        children: [],
        classes: [],
        description: '',
        object: null,
        objectSlug: null,
        target: '',
        title: 'Original label',
        type: 'custom',
        url: '/original',
        xfn: '',
      },
    ]),
  )
  expect((await runCli(['menu', 'push'])).exitCode).toBe(0)

  expect((await runCli(['menu', 'pull'])).exitCode).toBe(0)
  const file = join(dir, `${slug}.json`)
  const menu = JSON.parse(readFileSync(file, 'utf8')) as {items: Array<Record<string, unknown>>}
  menu.items[0].title = 'Edited label'
  menu.items[0].url = '/edited'
  writeFileSync(file, JSON.stringify(menu))

  const pushResult = await runCli(['menu', 'push'])
  expect(pushResult.exitCode).toBe(0)

  const termId = await findMenuTermId(request, wp, slug)
  const response = await request.get(`${wp.url}/wp-json/wp/v2/menu-items?menus=${termId}`, {
    headers: {Authorization: authHeader(wp)},
  })
  const items = (await response.json()) as Array<{title: {rendered: string}; url: string}>
  expect(items).toHaveLength(1)
  expect(items[0].url).toBe('/edited')
})

test('pushes and pulls the active theme menu locations, mapping to a menu slug never a raw term id', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const slug = `e2e-menu-loc-${Date.now()}`
  const dir = join(projectDir, 'menus')
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, `${slug}.json`), menuFile(slug, 'E2E Location Menu', []))
  expect((await runCli(['menu', 'push'])).exitCode).toBe(0)

  const locationsResponse = await request.get(`${wp.url}/wp-json/loopress/v1/menu-locations`, {
    headers: {Authorization: authHeader(wp)},
  })
  expect(locationsResponse.ok()).toBe(true)
  const registered = Object.keys((await locationsResponse.json()) as Record<string, null | string>)
  test.skip(registered.length === 0, 'the active theme on this environment registers no nav menu locations')

  const location = registered[0]
  writeFileSync(join(dir, 'locations.json'), JSON.stringify({[location]: slug}))

  const pushResult = await runCli(['menu', 'push'])
  expect(pushResult.exitCode).toBe(0)

  const listResult = await runCli(['menu', 'list'])
  expect(listResult.exitCode).toBe(0)
  expect(listResult.stdout).toContain(`${location}: ${slug}`)

  expect((await runCli(['menu', 'pull'])).exitCode).toBe(0)
  const pulledLocations = JSON.parse(readFileSync(join(dir, 'locations.json'), 'utf8')) as Record<string, null | string>
  expect(pulledLocations[location]).toBe(slug)
})

test('menu diff reports no drift after a push + pull, then flags a local edit', async ({projectDir, runCli}) => {
  const slug = `e2e-menu-diff-${Date.now()}`
  const dir = join(projectDir, 'menus')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `${slug}.json`),
    menuFile(slug, 'E2E Diff Menu', [
      {
        children: [],
        classes: [],
        description: '',
        object: null,
        objectSlug: null,
        target: '',
        title: '',
        type: 'custom',
        url: '/x',
        xfn: '',
      },
    ]),
  )
  expect((await runCli(['menu', 'push'])).exitCode).toBe(0)
  expect((await runCli(['menu', 'pull'])).exitCode).toBe(0)

  const inSync = await runCli(['menu', 'diff'])
  expect(inSync.exitCode, inSync.stdout + inSync.stderr).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  const file = join(dir, `${slug}.json`)
  const menu = JSON.parse(readFileSync(file, 'utf8')) as {name: string}
  writeFileSync(file, JSON.stringify({...menu, name: `${menu.name} (edited)`}))

  const drifted = await runCli(['menu', 'diff'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain('Drift detected')
})

test('warns, but does not fail, for a custom item pointing at a different domain', async ({projectDir, runCli}) => {
  const slug = `e2e-menu-offsite-${Date.now()}`
  const dir = join(projectDir, 'menus')
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, `${slug}.json`),
    menuFile(slug, 'E2E Offsite Menu', [
      {
        children: [],
        classes: [],
        description: '',
        object: null,
        objectSlug: null,
        target: '_blank',
        title: 'Elsewhere',
        type: 'custom',
        url: 'https://elsewhere.example/path',
        xfn: '',
      },
    ]),
  )

  const result = await runCli(['menu', 'push'])

  expect(result.exitCode).toBe(0)
  expect(unwrap(result.stdout)).toContain('warning:')
  expect(existsSync(dir)).toBe(true)
})
