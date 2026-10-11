/* eslint-disable camelcase -- option values mirror real plugin settings, which are snake_case. */
import {randomInt} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restDelete, restGet, restPost, restPut} from './helpers/rest.js'

type LocalOption = {autoload: string; name: string; readonly?: boolean; refs?: Record<string, string>; value: unknown}

function optionFile(projectDir: string, name: string): string {
  return join(projectDir, 'options', `${name}.json`)
}

function writeOption(projectDir: string, option: LocalOption): string {
  mkdirSync(join(projectDir, 'options'), {recursive: true})
  const file = optionFile(projectDir, option.name)
  writeFileSync(file, JSON.stringify(option, null, 2) + '\n')
  return file
}

function readOption(projectDir: string, name: string): LocalOption {
  return JSON.parse(readFileSync(optionFile(projectDir, name), 'utf8')) as LocalOption
}


// Avoids every name pattern the plugin refuses to read as a likely secret (_key, token, ...).
function uniqueName(): string {
  return `e2e_opt_${Date.now()}_${randomInt(1000)}`
}

// Options this test created on the shared instance, deleted through the plugin's own endpoint.
const created: string[] = []
test.afterEach(async ({request, wp}) => {
  for (const name of created.splice(0)) await restDelete(request, wp, `loopress/v1/options/${name}`)
})

test('push creates an untracked-yet option on WordPress with the exact JSON value', async ({projectDir, request, runCli, wp}) => {
  const name = uniqueName()
  created.push(name)
  const value = {enabled: true, items: ['a', 'b'], nested: {count: 3, label: 'E2E'}}
  writeOption(projectDir, {autoload: 'off', name, value})

  const push = await runCli(['option', 'push'])
  expect(push.exitCode, output(push)).toBe(0)
  expect(push.stdout).toContain('All options pushed.')

  const remote = await restGet(request, wp, `loopress/v1/options/${name}`)
  expect(remote.ok()).toBe(true)
  expect(await remote.json()).toMatchObject({name, value})
})

test('option add starts tracking an existing option, then pull refreshes it after a WordPress-side change', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const name = uniqueName()
  created.push(name)
  expect((await restPut(request, wp, `loopress/v1/options/${name}`, {autoload: 'yes', value: 'first'})).ok()).toBe(true)

  const add = await runCli(['option', 'add', name])
  expect(add.exitCode, output(add)).toBe(0)
  expect(add.stdout).toContain(`Tracking "${name}"`)
  expect(readOption(projectDir, name)).toMatchObject({name, readonly: false, value: 'first'})

  expect((await restPut(request, wp, `loopress/v1/options/${name}`, {value: 'second'})).ok()).toBe(true)
  const pull = await runCli(['option', 'pull'])
  expect(pull.exitCode, output(pull)).toBe(0)
  expect(pull.stdout).toContain(`Pulled: ${name}`)
  expect(readOption(projectDir, name).value).toBe('second')
})

test('pull never adds an option that is not tracked locally', async ({projectDir, runCli}) => {
  const pull = await runCli(['option', 'pull'])

  expect(pull.exitCode).toBe(0)
  expect(pull.stdout).toContain('Nothing tracked locally')
  expect(existsSync(join(projectDir, 'options'))).toBe(false)
})

test('pull removes the local file of a tracked option deleted on WordPress', async ({projectDir, request, runCli, wp}) => {
  const name = uniqueName()
  writeOption(projectDir, {autoload: 'off', name, value: 'gone soon'})
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  expect((await restDelete(request, wp, `loopress/v1/options/${name}`)).ok()).toBe(true)

  const pull = await runCli(['option', 'pull'])

  expect(pull.exitCode, output(pull)).toBe(0)
  expect(existsSync(optionFile(projectDir, name))).toBe(false)
})

test('a readonly option is skipped by push, and the WordPress value stays untouched', async ({projectDir, request, runCli, wp}) => {
  const name = uniqueName()
  created.push(name)
  expect((await restPut(request, wp, `loopress/v1/options/${name}`, {value: 'remote'})).ok()).toBe(true)
  writeOption(projectDir, {autoload: 'off', name, readonly: true, value: 'local'})

  const push = await runCli(['option', 'push'])

  expect(push.exitCode, output(push)).toBe(0)
  expect(push.stdout).toContain(`Skipping 1 readonly option: ${name}`)
  const remote = await restGet(request, wp, `loopress/v1/options/${name}`)
  expect(((await remote.json()) as {value: unknown}).value).toBe('remote')
})

test('add marks a site-wide core option like siteurl readonly by default', async ({projectDir, runCli}) => {
  const add = await runCli(['option', 'add', 'siteurl'])

  expect(add.exitCode, output(add)).toBe(0)
  expect(add.stdout).toContain('readonly: push will skip it')
  expect(readOption(projectDir, 'siteurl').readonly).toBe(true)
})

test('add refuses the options owned by lps plugin / lps theme', async ({projectDir, runCli}) => {
  const add = await runCli(['option', 'add', 'active_plugins'])

  expect(add.exitCode).not.toBe(0)
  expect(output(add)).toContain('"active_plugins" is managed by `lps plugin`/`lps theme`')
  expect(existsSync(optionFile(projectDir, 'active_plugins'))).toBe(false)
})

test('add fails clearly for an option that does not exist', async ({runCli}) => {
  const name = uniqueName()
  const add = await runCli(['option', 'add', name])

  expect(add.exitCode).not.toBe(0)
  expect(output(add)).toContain(`Option "${name}" was not found on`)
})

test('WordPress refuses to hand back an option whose name looks like a stored secret', async ({runCli}) => {
  const add = await runCli(['option', 'add', 'e2e_service_api_key'])

  expect(add.exitCode).not.toBe(0)
  expect(output(add)).toContain('looks like a stored secret')
})

test('WordPress refuses to write a protected core option even when the file is not readonly', async ({projectDir, request, runCli, wp}) => {
  const before = await restGet(request, wp, 'loopress/v1/options/default_role')
  const {value} = (await before.json()) as {value: string}
  writeOption(projectDir, {autoload: 'on', name: 'default_role', readonly: false, value: 'administrator'})

  const push = await runCli(['option', 'push'])

  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('"default_role" is a protected option')
  const after = await restGet(request, wp, 'loopress/v1/options/default_role')
  expect(((await after.json()) as {value: string}).value).toBe(value)
})

test('remove deletes the option on WordPress and stops tracking it; --local-only keeps it on WordPress', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const kept = uniqueName()
  const deleted = uniqueName()
  created.push(kept)
  writeOption(projectDir, {autoload: 'off', name: kept, value: 1})
  writeOption(projectDir, {autoload: 'off', name: deleted, value: 2})
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)

  const localOnly = await runCli(['option', 'remove', kept, '--local-only'])
  expect(localOnly.exitCode, output(localOnly)).toBe(0)
  expect(existsSync(optionFile(projectDir, kept))).toBe(false)
  expect((await restGet(request, wp, `loopress/v1/options/${kept}`)).ok()).toBe(true)

  const remove = await runCli(['option', 'remove', deleted, '--yes'])
  expect(remove.exitCode, output(remove)).toBe(0)
  expect(remove.stdout).toContain(`Removed "${deleted}"`)
  expect(existsSync(optionFile(projectDir, deleted))).toBe(false)
  expect((await restGet(request, wp, `loopress/v1/options/${deleted}`)).status()).toBe(404)

  const again = await runCli(['option', 'remove', deleted, '--yes'])
  expect(again.exitCode).toBe(0)
  expect(again.stdout).toContain('was already absent')
})

test('refs: a page reference travels as its path and lands as this environment\'s page ID', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const stamp = Date.now()
  const parent = await restPost(request, wp, 'wp/v2/pages', {slug: `e2e-shop-${stamp}`, status: 'publish', title: 'E2E Shop'})
  const {id: parentId} = (await parent.json()) as {id: number}
  const child = await restPost(request, wp, 'wp/v2/pages', {
    parent: parentId,
    slug: 'checkout',
    status: 'publish',
    title: 'E2E Checkout',
  })
  const {id: childId} = (await child.json()) as {id: number}

  const name = uniqueName()
  created.push(name)
  const refs = {'pages.checkout': 'page', 'pages.empty': 'page'}
  writeOption(projectDir, {autoload: 'off', name, refs, value: {pages: {checkout: `e2e-shop-${stamp}/checkout`, empty: 0}}})

  const push = await runCli(['option', 'push'])
  expect(push.exitCode, output(push)).toBe(0)

  // Read without refs: what WordPress actually stores is the real ID, and an unset ref is untouched.
  const raw = await restGet(request, wp, `loopress/v1/options/${name}`)
  expect(((await raw.json()) as {value: unknown}).value).toEqual({pages: {checkout: childId, empty: 0}})

  // Pulled back with its refs, the file holds the path again, never this environment's ID.
  const pull = await runCli(['option', 'pull'])
  expect(pull.exitCode, output(pull)).toBe(0)
  expect(readOption(projectDir, name)).toMatchObject({refs, value: {pages: {checkout: `e2e-shop-${stamp}/checkout`, empty: 0}}})
})

test('refs: a raw ID or a missing page in the file is refused instead of written as is', async ({projectDir, runCli}) => {
  const asId = uniqueName()
  const missing = uniqueName()
  writeOption(projectDir, {autoload: 'off', name: asId, refs: {'.': 'page'}, value: 42})
  writeOption(projectDir, {autoload: 'off', name: missing, refs: {'.': 'page'}, value: `e2e-no-such-page-${Date.now()}`})

  const push = await runCli(['option', 'push'])

  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('must hold a "page" path, not an ID')
  expect(output(push)).toContain('which does not exist on this environment')
  expect(output(push)).toContain('2 options failed to push')
})

test('option list shows names only, never values, and --no-core hides WordPress defaults', async ({request, runCli, wp}) => {
  const name = uniqueName()
  created.push(name)
  await restPut(request, wp, `loopress/v1/options/${name}`, {value: 'e2e-value-never-listed'})

  const list = await runCli(['option', 'list', '--json'])
  expect(list.exitCode).toBe(0)
  expect(list.stdout).not.toContain('e2e-value-never-listed')
  const options = JSON.parse(list.stdout) as Array<{core: boolean; name: string}>
  expect(options.find((option) => option.name === name)).toMatchObject({core: false})
  expect(options.find((option) => option.name === 'blogname')).toMatchObject({core: true})

  const noCore = await runCli(['option', 'list', '--no-core', '--json'])
  const names = (JSON.parse(noCore.stdout) as Array<{name: string}>).map((option) => option.name)
  expect(names).toContain(name)
  expect(names).not.toContain('blogname')
})

test('option diff flags a WordPress-side change, and rollback undoes the last push', async ({projectDir, request, runCli, wp}) => {
  const name = uniqueName()
  created.push(name)
  writeOption(projectDir, {autoload: 'off', name, value: 'v1'})
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  expect((await runCli(['option', 'pull'])).exitCode).toBe(0)

  const inSync = await runCli(['option', 'diff'])
  expect(inSync.exitCode, output(inSync)).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  await restPut(request, wp, `loopress/v1/options/${name}`, {value: 'changed on WordPress'})
  const drifted = await runCli(['option', 'diff'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain(name)

  // Put the file back in charge, then push v2 and roll it back to v1.
  writeOption(projectDir, {...readOption(projectDir, name), value: 'v1'})
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  writeOption(projectDir, {...readOption(projectDir, name), value: 'v2'})
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)

  const rollback = await runCli(['option', 'rollback', '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)
  const remote = await restGet(request, wp, `loopress/v1/options/${name}`)
  expect(((await remote.json()) as {value: unknown}).value).toBe('v1')

  rmSync(optionFile(projectDir, name))
})
