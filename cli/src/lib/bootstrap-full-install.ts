import {launchLocalBrowser} from './browser-launch.js'
import {downloadLatestFullZip} from './github-release.js'
import {createTempAdmin, deleteTempAdmin, type TempAdmin} from './temp-admin.js'
import {type WpClient} from './wp-client.js'

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

  // The temp account is a real administrator; it must never outlive this function, including
  // when the process is interrupted mid-install (Ctrl-C, or a hung/killed headless browser).
  // removeTempAdmin() memoises a single deletion so the normal path and either signal handler
  // all await the same in-flight promise instead of racing or deleting twice.
  let cleanupPromise: Promise<void> | undefined
  const removeTempAdmin = async (): Promise<void> => {
    cleanupPromise ??= deleteTempAdmin(wp, admin)
    return cleanupPromise
  }

  const onSignal = (signal: NodeJS.Signals): void => {
    // Finish (or start) the deletion, surface a manual-removal hint if it fails since the normal
    // error path below won't run, then re-raise the signal with our handler gone so Node's
    // default termination runs with the right exit code.
    removeTempAdmin()
      .catch((error: unknown) => {
        log(
          `Could not remove the temporary admin account "${admin.username}"; remove it manually in wp-admin. (${(error as Error).message})`,
        )
      })
      .finally(() => {
        process.removeListener('SIGINT', onSignal)
        process.removeListener('SIGTERM', onSignal)
        process.kill(process.pid, signal)
      })
  }

  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)

  let installError: unknown
  let cleanupError: unknown
  try {
    try {
      log('Installing and activating Loopress Full...')
      await runBrowserInstall(admin, siteUrl, zipPath)
      log('Loopress Full installed and activated.')
    } catch (error) {
      installError = error
    }

    log('Removing the temporary admin account...')
    try {
      await removeTempAdmin()
    } catch (error) {
      cleanupError = error
    }
  } finally {
    // Only stop guarding once the deletion has settled: a signal during the removal above must
    // still trigger (or await) cleanup rather than terminating the process with the account live.
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }

  const manualFallback = `Install it manually: upload ${zipPath} at ${siteUrl}/wp-admin/plugin-install.php?tab=upload`

  if (installError && cleanupError) {
    throw new Error(
      `Could not install Loopress Full automatically, and the temporary admin account could not be removed (${(cleanupError as Error).message}). ${manualFallback}`,
      {cause: installError},
    )
  }

  if (cleanupError) throw cleanupError as Error

  if (installError) {
    throw new Error(`Could not install Loopress Full automatically. ${manualFallback}`, {cause: installError})
  }
}

async function runBrowserInstall(admin: TempAdmin, siteUrl: string, zipPath: string): Promise<void> {
  const browser = await launchLocalBrowser()

  try {
    const page = await browser.newPage()

    await page.goto(`${siteUrl}/wp-login.php`, {waitUntil: 'domcontentloaded'})
    await page.fill('#user_login', admin.username)
    await page.fill('#user_pass', admin.password)
    await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#wp-submit')])

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
