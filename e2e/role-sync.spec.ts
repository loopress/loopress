import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restDelete, restPost, uniqueSlug} from './helpers/rest.js'

function writeRole(projectDir: string, slug: string, role: Record<string, unknown>): void {
  const dir = join(projectDir, 'roles')
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, `${slug}.json`), JSON.stringify(role, null, 2) + '\n')
}

const declared: string[] = []
const users: number[] = []
test.afterEach(async ({request, runCli, wp}) => {
  for (const id of users.splice(0)) await restDelete(request, wp, `wp/v2/users/${id}?force=true&reassign=1`)
  for (const slug of declared.splice(0)) await runCli(['role', 'rm', slug, '--yes'])
})

test('pushes a role WordPress accepts for a user, and rm removes it again', async ({projectDir, request, runCli, wp}) => {
  const slug = uniqueSlug('e2erole')
  declared.push(slug)
  writeRole(projectDir, slug, {capabilities: {edit_pages: true, read: true}, name: 'E2E Client editor'})

  const push = await runCli(['role', 'push'])
  expect(push.exitCode, output(push)).toBe(0)
  expect(push.stdout).toContain('All roles pushed.')

  // wp/v2/users refuses an unknown role: WordPress core itself sees the Loopress one.
  const user = await restPost(request, wp, 'wp/v2/users', {
    email: `${slug}@example.com`,
    password: `pw-${slug}`,
    roles: [slug],
    username: slug,
  })
  expect(user.ok(), await user.text()).toBe(true)
  const created = (await user.json()) as {capabilities: Record<string, boolean>; id: number}
  users.push(created.id)
  expect(created.capabilities).toMatchObject({edit_pages: true, read: true, [slug]: true})

  const list = await runCli(['role', 'list'])
  expect(list.exitCode).toBe(0)
  expect(list.stdout).toContain(`${slug} (E2E Client editor): Loopress, 1 user`)

  // Never saved in the roles option: once Loopress stops adding it, WordPress no longer knows it.
  expect((await runCli(['role', 'rm', slug, '--yes'])).exitCode).toBe(0)
  declared.splice(declared.indexOf(slug), 1)
  const refused = await restPost(request, wp, 'wp/v2/users', {
    email: `${slug}-2@example.com`,
    password: `pw-${slug}`,
    roles: [slug],
    username: `${slug}-2`,
  })
  expect(refused.status()).toBe(400)
})

test('a built-in role is refused at push', async ({projectDir, runCli}) => {
  writeRole(projectDir, 'editor', {name: 'Editor'})

  const push = await runCli(['role', 'push'])
  expect(push.exitCode).not.toBe(0)
  expect(output(push)).toContain('reserved by WordPress')
})

test('diff shows nothing right after a push', async ({projectDir, runCli}) => {
  const slug = uniqueSlug('e2erole')
  declared.push(slug)
  const role = {capabilities: {read: true}, name: 'E2E Pulled role'}
  writeRole(projectDir, slug, role)
  expect((await runCli(['role', 'push'])).exitCode).toBe(0)

  const diff = await runCli(['role', 'diff'])
  expect(diff.exitCode, output(diff)).toBe(0)
})
