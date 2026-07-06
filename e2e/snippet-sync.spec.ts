import {existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test} from './helpers/environment.js'
import {findWpCodeSnippetRow, loginToWpAdmin, setPluginActive, trashWpCodeSnippet} from './helpers/wp-admin.js'

// Regression coverage for a bug where two active snippet plugins made WPCode win silently
// (see snippet-provider-conflict.spec.ts): pin the site to WPCode only for these tests.
test.beforeAll(async ({browser, wp}) => {
  const page = await browser.newPage()
  await loginToWpAdmin(page, wp)
  await setPluginActive(page, wp, 'code-snippets', false)
  await setPluginActive(page, wp, 'insert-headers-and-footers', true)
  await page.close()
})

function writeSnippet(dir: string, basename: string, name: string, code: string): void {
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, `${basename}.php`), code)
  writeFileSync(join(dir, `${basename}.json`), JSON.stringify({location: 'everywhere', name, type: 'php'}))
}

test('pushes a new snippet and it appears correctly in the WPCode admin list', async ({page, projectDir, runCli, wp}) => {
  const name = `E2E round trip ${Date.now()}`
  const snippetsDir = join(projectDir, 'snippets')
  writeSnippet(snippetsDir, 'roundtrip', name, '<?php\n\necho "hello from e2e";\n')

  const result = await runCli(['snippet', 'push'])
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain('All snippets pushed')

  const row = await findWpCodeSnippetRow(page, wp, name)
  await expect(row).toBeVisible()
  await expect(row.locator('.code_type')).toContainText('php')
  await expect(row.locator('.location')).toContainText('Run Everywhere')
})

test('skips a snippet with a malformed sidecar instead of blocking the others', async ({page, projectDir, runCli, wp}) => {
  const goodName = `E2E isolation good ${Date.now()}`
  const snippetsDir = join(projectDir, 'snippets')
  mkdirSync(snippetsDir, {recursive: true})
  writeFileSync(join(snippetsDir, 'broken.php'), '<?php echo 1;')
  writeFileSync(join(snippetsDir, 'broken.json'), '{ this is not valid json !!')
  writeSnippet(snippetsDir, 'good', goodName, '<?php echo 2;')

  const result = await runCli(['snippet', 'push'])
  expect(result.exitCode).toBe(0)
  expect(result.stderr).toContain('Skipping')
  expect(result.stderr).toContain('broken.json')

  const row = await findWpCodeSnippetRow(page, wp, goodName)
  await expect(row).toBeVisible()
})

test('removes local files for a snippet deleted on WordPress, and does not resurrect it on the next push', async ({
  page,
  projectDir,
  runCli,
  wp,
}) => {
  const name = `E2E delete ${Date.now()}`
  const snippetsDir = join(projectDir, 'snippets')
  writeSnippet(snippetsDir, 'to-delete', name, '<?php echo "bye";')

  await runCli(['snippet', 'push'])
  await expect(await findWpCodeSnippetRow(page, wp, name)).toBeVisible()

  await trashWpCodeSnippet(page, wp, name)

  const pullResult = await runCli(['snippet', 'pull'])
  expect(pullResult.exitCode).toBe(0)
  expect(pullResult.stderr).toContain('Removed')

  const remainingFiles = readdirSync(snippetsDir)
  expect(remainingFiles.some((file) => file.includes('to-delete'))).toBe(false)

  const pushResult = await runCli(['snippet', 'push'])
  expect(pushResult.exitCode).toBe(0)

  await page.goto(`${wp.url}/wp-admin/admin.php?page=wpcode`)
  await expect(page.getByRole('link', {exact: true, name})).toHaveCount(0)
})

test('never touches a hand-created file with no numeric id prefix while cleaning up orphans', async ({projectDir, runCli}) => {
  const snippetsDir = join(projectDir, 'snippets')
  mkdirSync(snippetsDir, {recursive: true})
  writeFileSync(join(snippetsDir, 'hand-written.php'), '<?php echo "not yet pushed";')

  const result = await runCli(['snippet', 'pull'])
  expect(result.exitCode).toBe(0)
  expect(existsSync(join(snippetsDir, 'hand-written.php'))).toBe(true)
})
