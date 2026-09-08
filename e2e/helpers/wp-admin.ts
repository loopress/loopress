import type {Page} from '@playwright/test'
import type {RequestUtils} from '@wordpress/e2e-test-utils-playwright'

import type {WpCredentials} from './environment.js'

export async function loginToWpAdmin(page: Page, wp: WpCredentials): Promise<void> {
  await page.goto(`${wp.url}/wp-admin`)
  await page.fill('#user_login', wp.username)
  await page.fill('#user_pass', wp.adminPassword)
  await page.click('#wp-submit')
  // `networkidle` is discouraged (WP admin keeps a heartbeat poll open) and was the single
  // slowest wait in the suite. The admin bar is present and visible on every wp-admin page
  // once logged in, and absent on wp-login.php, so it's the "we're actually in, not bounced
  // back to the login form" signal.
  await page.locator('#wpadminbar').waitFor({state: 'visible', timeout: 15_000})
}

// RequestUtils.activatePlugin/deactivatePlugin key plugins by a kebab-cased `Plugin Name:`
// header (see its getPluginsMap(), paramCase(plugin.name)), not the wp.org install slug
// setup-ci/scripts/setup-wordpress.sh installs these under. The two only coincide when a
// plugin's display name happens to equal its slug (advanced-custom-fields, code-snippets);
// these three don't (checked against the actual headers on the QA WP instance).
const PLUGIN_NAME_SLUGS: Record<string, string> = {
  'insert-headers-and-footers': 'wpcode-lite', // Plugin Name: WPCode Lite
  'seo-by-rank-math': 'rank-math-seo', // Plugin Name: Rank Math SEO
  'wordpress-seo': 'yoast-seo', // Plugin Name: Yoast SEO
}

// Goes through the `wp/v2/plugins/{slug}` REST endpoint (RequestUtils.activatePlugin/
// deactivatePlugin) rather than driving the wp-admin Plugins list UI: same end state a real
// admin toggling the row link would produce, but not dependent on that page's markup or its
// own reflow-related flakiness (with two SEO plugins active at once, RankMath's dismissible
// "keep only one SEO plugin active" notice made a real `.click()` here flake exactly the way
// ACF's PRO upsell banner does for `trashAcfFieldGroup` below). Test-infrastructure only, not
// used for anything actually under test: see the `requestUtils` fixture's own comment on why
// its nonce/cookie auth must never leak into a REST assertion.
//
// Takes the real wp.org install slug (matching `wp plugin install <slug>` in
// setup-wordpress.sh), translating to whatever RequestUtils itself needs internally, so every
// call site can keep using the slug a reader actually recognizes.
export async function setPluginActive(requestUtils: RequestUtils, slug: string, active: boolean): Promise<void> {
  const nameSlug = PLUGIN_NAME_SLUGS[slug] ?? slug
  await (active ? requestUtils.activatePlugin(nameSlug) : requestUtils.deactivatePlugin(nameSlug))
}

// Finds a WPCode admin list row by its exact snippet name. Row actions (Trash, Edit, ...)
// are only visible on hover in wp-admin's list table styling, hence the explicit hover.
export async function findWpCodeSnippetRow(page: Page, wp: WpCredentials, name: string) {
  // `&s=` filters the list-table server-side. There's no snippet delete endpoint, so on a
  // long-lived instance this list grows past its first page every run; filtering to the one
  // unique test name keeps the row on page 1. Also replaces the old `networkidle` wait, which
  // could return before the table had painted and leave the `.hover()` below hanging.
  await page.goto(`${wp.url}/wp-admin/admin.php?page=wpcode&s=${encodeURIComponent(name)}`)

  const row = page.locator('table.wp-list-table tbody tr', {has: page.getByRole('link', {exact: true, name})})
  await row.waitFor({timeout: 15_000})
  await row.hover()
  return row
}

export async function trashWpCodeSnippet(page: Page, wp: WpCredentials, name: string): Promise<void> {
  const row = await findWpCodeSnippetRow(page, wp, name)
  await row.getByRole('link', {name: 'Trash'}).click()
  // The Trash row action is a plain link (?action=trash&...), so a full navigation follows;
  // the deleted row being gone is the post-condition worth waiting on.
  await row.waitFor({state: 'detached', timeout: 15_000})
}

// Finds an ACF field group by its exact title in the native admin list table
// (edit.php?post_type=acf-field-group). Unlike findWpCodeSnippetRow, callers here only need
// visibility, never a hover-revealed row action, so no `.hover()`.
export async function findAcfFieldGroupRow(page: Page, wp: WpCredentials, title: string) {
  // `&s=` filters the list-table server-side to matching titles. ACF sorts this list by title,
  // not by date, so on a long-lived instance (many `E2E ...` groups from prior runs) a newly
  // created group lands on page 2+ and a bare list would never show it. Every test title here
  // is unique, so the filtered result is a single row on page 1.
  await page.goto(`${wp.url}/wp-admin/edit.php?post_type=acf-field-group&s=${encodeURIComponent(title)}`)

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
  await row.waitFor({timeout: 15_000})
  const href = await row.locator('.row-actions .trash a').getAttribute('href')
  if (!href) throw new Error(`No trash action found for ACF field group "${title}"`)

  const response = await page.request.get(href)
  if (!response.ok()) throw new Error(`Failed to trash ACF field group "${title}": HTTP ${response.status()}`)
}
