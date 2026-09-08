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

// The `<id>-<slug>.php` file whose body carries `marker`, after push/pull renamed it.
function findByMarker(dir: string, marker: string): string {
  const match = readdirSync(dir).find((file) => file.endsWith('.php') && readFileSync(join(dir, file), 'utf8').includes(marker))
  expect(match, `expected a snippet file containing "${marker}"`).toBeTruthy()
  return join(dir, match!)
}

test('reports no drift after a push + pull, then flags a local edit and exits non-zero', async ({projectDir, runCli}) => {
  const marker = `echo "diff-${Date.now()}"`
  const snippetsDir = join(projectDir, 'snippets')
  writeSnippet(snippetsDir, 'diff-me', `E2E diff ${Date.now()}`, `<?php\n\n${marker};\n`)

  expect((await runCli(['snippet', 'push'])).exitCode).toBe(0)
  // Pull everything the (shared) instance has so the baseline is genuinely in sync, not just
  // "the one snippet this test pushed".
  expect((await runCli(['snippet', 'pull'])).exitCode).toBe(0)

  const inSync = await runCli(['snippet', 'diff'])
  expect(inSync.exitCode, inSync.stdout + inSync.stderr).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  const filePath = findByMarker(snippetsDir, marker)
  writeFileSync(filePath, readFileSync(filePath, 'utf8').replace('diff-', 'edited-'))

  const drifted = await runCli(['snippet', 'diff'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain('Drift detected')
  expect(drifted.stdout).toMatch(/~ \d+/)
})

test('--json emits a parseable report with the expected shape', async ({projectDir, runCli}) => {
  writeSnippet(join(projectDir, 'snippets'), 'json-me', `E2E diff json ${Date.now()}`, '<?php\n\necho "json";\n')
  await runCli(['snippet', 'push'])

  const result = await runCli(['snippet', 'diff', '--json'])

  const parsed = JSON.parse(result.stdout) as {drift: boolean; resources: {snippet: {added: string[]}}}
  expect(typeof parsed.drift).toBe('boolean')
  expect(parsed.resources.snippet).toHaveProperty('added')
})

test('the aggregate `lps diff --only snippet` sees a snippet edit as drift', async ({projectDir, runCli}) => {
  const marker = `echo "only-${Date.now()}"`
  const snippetsDir = join(projectDir, 'snippets')
  writeSnippet(snippetsDir, 'only-me', `E2E diff only ${Date.now()}`, `<?php\n\n${marker};\n`)
  await runCli(['snippet', 'push'])
  await runCli(['snippet', 'pull'])

  const filePath = findByMarker(snippetsDir, marker)
  writeFileSync(filePath, readFileSync(filePath, 'utf8').replace('only-', 'changed-'))

  const result = await runCli(['diff', '--only', 'snippet'])

  expect(result.exitCode).toBe(1)
  expect(result.stdout).toContain('Snippets')
})
