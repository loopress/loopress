import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test, unwrap} from './helpers/environment.js'
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

// The aggregate `lps diff` compares several resources in one run and ORs their exit codes
// (0 in sync, 1 drift), so it doubles as a CI drift gate. This drives two providers at once
// and checks the drift is attributed to the edited one only, not smeared across the report.
test('the aggregate `lps diff` evaluates every selected resource and isolates drift to the changed one', async ({
  projectDir,
  runCli,
}) => {
  const stamp = Date.now()
  const snippetsDir = join(projectDir, 'snippets')
  const marker = `echo "agg-${stamp}"`
  writeSnippet(snippetsDir, 'agg-me', `E2E diff agg ${stamp}`, `<?php\n\n${marker};\n`)

  const apiDir = join(projectDir, 'api')
  mkdirSync(apiDir, {recursive: true})
  writeFileSync(
    join(apiDir, `agg-route-${stamp}.php`),
    `<?php\n\ndeclare(strict_types=1);\n\nfinal class AggRoute${stamp}\n{\n    public function get(): array\n    {\n        return [];\n    }\n}\n`,
  )

  await runCli(['snippet', 'push'])
  await runCli(['api', 'push'])
  await runCli(['snippet', 'pull'])
  await runCli(['api', 'pull'])

  const inSync = await runCli(['diff', '--only', 'snippet', '--only', 'api'])
  expect(inSync.exitCode, inSync.stdout + inSync.stderr).toBe(0)
  expect(inSync.stdout).toContain('Everything is in sync')

  writeFileSync(findByMarker(snippetsDir, marker), `<?php\n\necho "agg-changed-${stamp}";\n`)

  const drifted = await runCli(['diff', '--only', 'snippet', '--only', 'api'])
  expect(drifted.exitCode).toBe(1)
  expect(drifted.stdout).toContain('Drift detected')
  // The API provider still ran and came back clean; only the snippet is flagged. `in sync` is
  // colour-wrapped (Playwright runs the CLI with FORCE_COLOR), so strip ANSI before matching.
  const plain = unwrap(drifted.stdout.replaceAll(/\u001b\[[0-9;]*m/g, ''))
  expect(plain).toContain('API routes in sync')
  expect(plain).toMatch(/~ \d+/)
})
