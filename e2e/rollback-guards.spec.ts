import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, output, test} from './helpers/environment.js'
import {restDelete, restGet, restPut, uniqueSlug} from './helpers/rest.js'

// The guards shared by every `<resource> rollback` (rollback-command.ts), driven through options
// because WordPress-side changes are one REST call away. rollback.spec.ts covers the snippet
// round trip, the per-resource specs a plain rollback each.

function writeOption(projectDir: string, name: string, value: unknown): void {
  mkdirSync(join(projectDir, 'options'), {recursive: true})
  writeFileSync(join(projectDir, 'options', `${name}.json`), JSON.stringify({autoload: 'off', name, value}))
}

function uniqueName(): string {
  return `e2e_opt_rb_${uniqueSlug('')}`
}

async function remoteValue(request: Parameters<typeof restGet>[0], wp: Parameters<typeof restGet>[1], name: string): Promise<unknown> {
  return ((await (await restGet(request, wp, `loopress/v1/options/${name}`)).json()) as {value: unknown}).value
}

const created: string[] = []
test.afterEach(async ({request, wp}) => {
  for (const name of created.splice(0)) await restDelete(request, wp, `loopress/v1/options/${name}`)
})

test('refuses to roll back over a WordPress-side change made since the push, unless --yes', async ({
  projectDir,
  request,
  runCli,
  wp,
}) => {
  const name = uniqueName()
  created.push(name)
  writeOption(projectDir, name, 'v1')
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  writeOption(projectDir, name, 'v2')
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  await restPut(request, wp, `loopress/v1/options/${name}`, {value: 'edited in wp-admin'})

  const refused = await runCli(['option', 'rollback'])
  expect(refused.exitCode).not.toBe(0)
  expect(output(refused)).toContain('has changed on')
  expect(output(refused)).toContain('Re-run with --yes to roll back anyway')
  expect(await remoteValue(request, wp, name)).toBe('edited in wp-admin')

  const forced = await runCli(['option', 'rollback', '--yes'])
  expect(forced.exitCode, output(forced)).toBe(0)
  expect(await remoteValue(request, wp, name)).toBe('v1')
})

test('--dry-run shows what would be restored without restoring it', async ({projectDir, request, runCli, wp}) => {
  const name = uniqueName()
  created.push(name)
  writeOption(projectDir, name, 'v1')
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  writeOption(projectDir, name, 'v2')
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)

  const dryRun = await runCli(['option', 'rollback', '--dry-run'])

  expect(dryRun.exitCode, output(dryRun)).toBe(0)
  expect(dryRun.stdout).toContain('This would restore')
  expect(dryRun.stdout).toContain(name)
  expect(await remoteValue(request, wp, name)).toBe('v2')
})

test('--to restores an older snapshot than the latest one', async ({projectDir, request, runCli, wp}) => {
  const name = uniqueName()
  created.push(name)
  for (const value of ['v1', 'v2', 'v3']) {
    writeOption(projectDir, name, value)
    expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  }

  // Most recent first: [before v3 (= v2), before v2 (= v1), before v1].
  const list = await runCli(['option', 'rollback', '--list', '--json'])
  const {snapshots} = JSON.parse(list.stdout) as {snapshots: Array<{id: string}>}
  expect(snapshots.length).toBeGreaterThanOrEqual(3)

  const rollback = await runCli(['option', 'rollback', '--to', snapshots[1].id, '--yes'])
  expect(rollback.exitCode, output(rollback)).toBe(0)
  expect(await remoteValue(request, wp, name)).toBe('v1')
})

test('an item the rolled-back push created is reported, not deleted', async ({projectDir, request, runCli, wp}) => {
  const first = uniqueName()
  const added = uniqueName()
  created.push(first, added)
  writeOption(projectDir, first, 'v1')
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)
  writeOption(projectDir, added, 'new in the second push')
  writeOption(projectDir, first, 'v2')
  expect((await runCli(['option', 'push'])).exitCode).toBe(0)

  const rollback = await runCli(['option', 'rollback', '--yes'])

  expect(rollback.exitCode, output(rollback)).toBe(0)
  expect(output(rollback)).toContain('will NOT be removed')
  expect(output(rollback)).toContain(added)
  expect(await remoteValue(request, wp, first)).toBe('v1')
  expect(await remoteValue(request, wp, added)).toBe('new in the second push')
})
