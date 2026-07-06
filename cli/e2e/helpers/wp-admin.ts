import type {Page} from '@playwright/test'

import type {WpCredentials} from './environment.js'

export async function loginToWpAdmin(page: Page, wp: WpCredentials): Promise<void> {
  await page.goto(`${wp.url}/wp-admin`)
  await page.fill('#user_login', wp.username)
  await page.fill('#user_pass', wp.adminPassword)
  await page.click('#wp-submit')
  await page.waitForLoadState('networkidle')
}

// Drives the real wp-admin Plugins list (the same "Activate"/"Deactivate" row links a user
// would click), rather than toggling plugin state through any backdoor, so the resulting
// state is exactly what a real WordPress install would end up in.
export async function setPluginActive(page: Page, wp: WpCredentials, slug: string, active: boolean): Promise<void> {
  await page.goto(`${wp.url}/wp-admin/plugins.php`)

  const link = page.locator(`#${active ? 'activate' : 'deactivate'}-${slug}`)
  if ((await link.count()) === 0) return // already in the desired state

  await link.click()
  await page.waitForLoadState('networkidle')
}

// Finds a WPCode admin list row by its exact snippet name. Row actions (Trash, Edit, ...)
// are only visible on hover in wp-admin's list table styling, hence the explicit hover.
export async function findWpCodeSnippetRow(page: Page, wp: WpCredentials, name: string) {
  await page.goto(`${wp.url}/wp-admin/admin.php?page=wpcode`)
  await page.waitForLoadState('networkidle')

  const row = page.locator('table.wp-list-table tbody tr', {has: page.getByRole('link', {exact: true, name})})
  await row.hover()
  return row
}

export async function trashWpCodeSnippet(page: Page, wp: WpCredentials, name: string): Promise<void> {
  const row = await findWpCodeSnippetRow(page, wp, name)
  await row.getByRole('link', {name: 'Trash'}).click()
  await page.waitForLoadState('networkidle')
}
