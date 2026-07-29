import {launchLocalBrowser} from './browser-launch.js'
import {downloadLatestFullZip} from './github-release.js'
import {createTempAdmin, deleteTempAdmin, type TempAdmin} from './temp-admin.js'
import {WpClient} from './wp-client.js'

/**
 * Installs and activates Loopress Full on a site that doesn't have it yet: downloads the
 * latest release zip, creates a temporary admin (the only way to get `install_plugins` from
 * just an app password), drives the wp-admin upload UI headlessly, then removes the temp
 * account. Cleanup always runs, whether the install succeeded or not: the temp account never
 * stays alive waiting on a human, the fallback for a failed install is manual instructions
 * using the real user's own credentials, not the temp account.
 */
export async function bootstrapLoopressFull(wp: WpClient, siteUrl: string, log: (message: string) => void): Promise<void> {
  log('Downloading the latest Loopress Full release...')
  const zipPath = await downloadLatestFullZip()

  log('Creating a temporary admin account to install it...')
  const admin = await createTempAdmin(wp)

  let installError: unknown
  try {
    log('Installing and activating Loopress Full...')
    await runBrowserInstall(admin, siteUrl, zipPath)
  } catch (error) {
    installError = error
  }

  log('Removing the temporary admin account...')
  let cleanupError: unknown
  try {
    await deleteTempAdmin(wp, admin)
  } catch (error) {
    cleanupError = error
  }

  const manualFallback = `Install it manually: upload ${zipPath} at ${siteUrl}/wp-admin/plugin-install.php?tab=upload`

  if (installError && cleanupError) {
    throw new Error(
      `Could not install Loopress Full automatically, and the temporary admin account could not be removed (${(cleanupError as Error).message}). ${manualFallback}`,
      {cause: installError},
    )
  }

  if (cleanupError) throw cleanupError

  if (installError) {
    throw new Error(`Could not install Loopress Full automatically. ${manualFallback}`, {cause: installError})
  }

  log('Loopress Full installed and activated.')
}

async function runBrowserInstall(admin: TempAdmin, siteUrl: string, zipPath: string): Promise<void> {
  const browser = await launchLocalBrowser()

  try {
    const page = await browser.newPage()

    await page.goto(`${siteUrl}/wp-login.php`, {waitUntil: 'domcontentloaded'})
    await page.fill('#user_login', admin.username)
    await page.fill('#user_pass', admin.password)
    await page.click('#wp-submit')
    await page.waitForLoadState('domcontentloaded')

    await page.goto(`${siteUrl}/wp-admin/plugin-install.php?tab=upload`, {waitUntil: 'domcontentloaded'})
    await page.setInputFiles('#pluginzip', zipPath)
    await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('input[name="install-plugin-submit"]')])

    // The activate link only appears after a successful install; its absence (a moved
    // selector, DISALLOW_FILE_MODS, an unexpected wp-admin state) means the install didn't
    // go through, not that activation is a separate optional step.
    const activateLink = await page.waitForSelector('a[href*="action=activate"]', {timeout: 15_000})
    await Promise.all([page.waitForLoadState('domcontentloaded'), activateLink.click()])
  } finally {
    await browser.close()
  }
}
