import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

import {expect, test, unwrap} from './helpers/environment.js'
import {loginToWpAdmin, setPluginActive} from './helpers/wp-admin.js'

// Regression test: when both snippet plugins are active at once, Loopress must fail loudly
// instead of silently picking one (it used to pick WPCode, ignoring loopress.json entirely).
//
// Skipped: this branch is based on main, which doesn't have the wordpress-plugin fix these
// tests assert on yet (see the qa-loopress branch/PR). Restore once that fix lands on main.
test.describe.skip('two snippet plugins active at once', () => {
  test.beforeAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, 'code-snippets', true)
    await setPluginActive(page, wp, 'insert-headers-and-footers', true)
    await page.close()
  })

  // Restore the single-provider baseline other spec files rely on.
  test.afterAll(async ({browser, wp}) => {
    const page = await browser.newPage()
    await loginToWpAdmin(page, wp)
    await setPluginActive(page, wp, 'code-snippets', false)
    await page.close()
  })

  test('snippet list fails with a clear "multiple plugins active" error', async ({runCli}) => {
    const result = await runCli(['snippet', 'list'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('Multiple snippet plugins are active')
  })

  test('snippet push fails the same way instead of silently syncing to the wrong plugin', async ({projectDir, runCli}) => {
    const snippetsDir = join(projectDir, 'snippets')
    mkdirSync(snippetsDir, {recursive: true})
    writeFileSync(join(snippetsDir, 'conflict.php'), '<?php echo 1;')
    writeFileSync(join(snippetsDir, 'conflict.json'), JSON.stringify({location: 'everywhere', name: 'Conflict', type: 'php'}))

    const result = await runCli(['snippet', 'push'])

    expect(result.exitCode).not.toBe(0)
    expect(unwrap(result.stderr)).toContain('Multiple snippet plugins are active')
  })
})
