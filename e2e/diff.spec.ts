import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test} from './helpers/environment.js'
import {setPluginActive} from './helpers/wp-admin.js'

// Pin the snippet backend so the round-trip is deterministic, same as snippet-sync.spec.ts.
test.beforeAll(async ({requestUtils}) => {
  await setPluginActive(requestUtils, 'code-snippets', false)
  await setPluginActive(requestUtils, 'insert-headers-and-footers', true)
})

function writeSnippet(dir: string, base: string, name: string, code: string): void {
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, `${base}.php`), code)
  writeFileSync(join(dir, `${base}.json`), JSON.stringify({location: 'everywhere', name, type: 'php'}))
}

test('reports no drift right after a push, then flags a local edit and exits non-zero', async ({projectDir, runCli}) => {
  const name = `E2E diff ${Date.now()}`
  const snippetsDir = join(projectDir, 'snippets')
  writeSnippet(snippetsDir, 'diff-me', name, '<?php\n\necho "one";\n')

  expect((await runCli(['snippet', 'push'])).exitCode).toBe(0)

  // push renames the file to <id>-<slug>; find it back.
  const pushedFile = readdirSync(snippetsDir).find((f) => f.endsWith('.php') && f !== 'diff-me.php')
  expect(pushedFile, 'snippet push should have written an <id>-<slug>.php file').toBeTruthy()

  const inSync = await runCli(['snippet', 'diff'])
  expect(inSync.exitCode, inSync.stdout + inSync.stderr).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  const filePath = join(snippetsDir, pushedFile!)
  writeFileSync(filePath, readFileSync(filePath, 'utf8').replace('one', 'two'))

  const drifted = await runCli(['snippet', 'diff'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain('Drift detected')
  expect(drifted.stdout).toMatch(/~ \d+/)
})

test('--json emits a machine-readable report and nothing else on stdout', async ({projectDir, runCli}) => {
  const name = `E2E diff json ${Date.now()}`
  writeSnippet(join(projectDir, 'snippets'), 'json-me', name, '<?php\n\necho "json";\n')
  await runCli(['snippet', 'push'])

  const result = await runCli(['snippet', 'diff', '--json'])

  const parsed = JSON.parse(result.stdout) as {drift: boolean; resources: {snippet: {changed: unknown[]}}}
  expect(parsed).toHaveProperty('drift')
  expect(parsed.resources).toHaveProperty('snippet')
})

test('the aggregate `lps diff --only snippet` sees the same drift', async ({projectDir, runCli}) => {
  const name = `E2E diff only ${Date.now()}`
  const snippetsDir = join(projectDir, 'snippets')
  writeSnippet(snippetsDir, 'only-me', name, '<?php\n\necho "only";\n')
  await runCli(['snippet', 'push'])

  const pushedFile = readdirSync(snippetsDir).find((f) => f.endsWith('.php') && f !== 'only-me.php')!
  const filePath = join(snippetsDir, pushedFile)
  writeFileSync(filePath, readFileSync(filePath, 'utf8').replace('only', 'changed'))

  const result = await runCli(['diff', '--only', 'snippet'])

  expect(result.exitCode).toBe(1)
  expect(result.stdout).toContain('Snippets')
})
