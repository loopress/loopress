import type {Page} from '@playwright/test'

import type {WpCredentials} from './environment.js'

export async function loginToWpAdmin(page: Page, wp: WpCredentials): Promise<void> {
  await page.goto(`${wp.url}/wp-admin`)
  await page.fill('#user_login', wp.username)
  await page.fill('#user_pass', wp.adminPassword)
  await page.click('#wp-submit')
  await page.waitForLoadState('networkidle')
}

// Drives the real wp-admin Plugins list (the same "Activate"/"Deactivate" row link a user would
// click), rather than toggling plugin state through any backdoor, so the resulting state is
// exactly what a real WordPress install would end up in. Reads the link's href and fires it
// through `page.request` (same session cookies as `page`) instead of `.click()`: with two SEO
// plugins active at once, RankMath injects its own dismissible "keep only one SEO plugin
// active" notice at the top of this page, whose layout settles a beat after load, and that
// reflow made a real `.click()` here flake exactly the way ACF's PRO upsell banner does for
// `trashAcfFieldGroup` below.
export async function setPluginActive(page: Page, wp: WpCredentials, slug: string, active: boolean): Promise<void> {
  await page.goto(`${wp.url}/wp-admin/plugins.php`)

  const link = page.locator(`#${active ? 'activate' : 'deactivate'}-${slug}`)
  if ((await link.count()) === 0) return // already in the desired state

  const href = await link.getAttribute('href')
  if (!href) throw new Error(`No ${active ? 'activate' : 'deactivate'} action found for plugin "${slug}"`)

  // plugins.php row actions render as relative URLs (unlike ACF's trash link below, which WP
  // renders absolute), page.request has no base URL of its own to resolve them against.
  const response = await page.request.get(new URL(href, page.url()).toString())
  if (!response.ok()) throw new Error(`Failed to ${active ? 'activate' : 'deactivate'} plugin "${slug}": HTTP ${response.status()}`)
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

// Finds an ACF field group by its exact title in the native admin list table
// (edit.php?post_type=acf-field-group). Unlike findWpCodeSnippetRow, callers here only need
// visibility, never a hover-revealed row action, so no `.hover()`.
export async function findAcfFieldGroupRow(page: Page, wp: WpCredentials, title: string) {
  await page.goto(`${wp.url}/wp-admin/edit.php?post_type=acf-field-group`)
  await page.waitForLoadState('networkidle')

  return page.locator('table.wp-list-table tbody tr', {has: page.getByRole('link', {exact: true, name: title})})
}

// Row actions in this list table are only laid out (not just hidden) on hover, which makes a
// real `.hover()` + `.click()` flaky under CI load: the row's bounding box can still be
// settling (ACF's own PRO upsell banner reflows the page) when Playwright's hover-stability
// check runs. Reading the trash link's href directly and firing it through `page.request`
// (same session cookies as `page`) exercises the identical server-side action without
// depending on that hover state ever stabilizing.
export async function trashAcfFieldGroup(page: Page, wp: WpCredentials, title: string): Promise<void> {
  const row = await findAcfFieldGroupRow(page, wp, title)
  const href = await row.locator('.row-actions .trash a').getAttribute('href')
  if (!href) throw new Error(`No trash action found for ACF field group "${title}"`)

  const response = await page.request.get(href)
  if (!response.ok()) throw new Error(`Failed to trash ACF field group "${title}": HTTP ${response.status()}`)
}
