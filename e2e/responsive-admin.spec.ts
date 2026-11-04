import {expect, test} from './helpers/environment.js'

// The plugin's wp-admin app must never scroll the page sideways on a phone: wide tables scroll
// in their own container, header and action bars wrap, the tab strip scrolls. Checked on every
// tab of the installed edition at 360px (phone) and 782px (where wp-admin folds its menu).
const TABS = ['overview', 'config', 'code', 'dependencies', 'settings']

for (const width of [360, 782]) {
  test(`plugin admin has no horizontal page scroll at ${width}px`, async ({page, wp}) => {
    await page.setViewportSize({height: 800, width})

    for (const tab of TABS) {
      await page.goto(`${wp.url}/wp-admin/admin.php?page=loopress#${tab}`)
      await expect(page.locator('#loopress-admin-root [role="tab"]').first()).toBeVisible({timeout: 15_000})
      // The Light edition has no code, dependencies or settings tab: the hash then falls back to overview.
      const metrics = await page.evaluate(() => ({
        inner: window.innerWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      expect(metrics.scroll, `tab ${tab} at ${width}px`).toBeLessThanOrEqual(metrics.inner)
    }
  })
}
