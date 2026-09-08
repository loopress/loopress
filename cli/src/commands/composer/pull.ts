import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isApplicative404} from '../../lib/wp-client.js'

type ComposerJsonResponse = {
  composerJson: string
}

type ComposerLockResponse = {
  composerLock: string
}

// A site that never had Composer dependencies pushed has no composer.lock yet: the Loopress
// controller answers that specific 404 with `{"error": "composer.lock not found"}`. Any other
// 404 (route absent because the plugin isn't installed or predates Composer support) must
// still surface the normal "is the plugin installed?" guidance instead of being swallowed.
function isMissingComposerLock(error: unknown): boolean {
  return isApplicative404(error, 'composer.lock not found')
}

type PullResult = {
  status: 'dry-run' | 'success'
  wroteLock: boolean
}

export default class ComposerPull extends LoopressCommand {
  static description = 'Pull composer.json and composer.lock from WordPress'
  static enableJsonFlag = true
  static examples = ['$ lps composer pull', '$ lps composer pull --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<PullResult> {
    const {url} = this.siteConfig

    this.log(`Pulling composer.json and composer.lock from ${url}`)

    const {composerJson} = await this.wp.get<ComposerJsonResponse>('loopress/v1/composer/json')

    // A site that never had Composer dependencies pushed has no composer.lock yet: that's a
    // legitimate applicative 404 from the Loopress controller (ComposerController::get_lock(),
    // body `{"error": "composer.lock not found"}`), not a sign anything is broken. Any other
    // 404 (route absent because the plugin isn't installed or predates Composer support) must
    // still surface the normal "is the plugin installed?" guidance instead of being swallowed.
    let composerLock: string | undefined
    try {
      ;({composerLock} = await this.wp.get<ComposerLockResponse>('loopress/v1/composer/lock'))
    } catch (error) {
      if (!isMissingComposerLock(error)) throw error
    }

    if (this.dryRun) {
      this.log(composerLock ? '[dry-run] Would write composer.json and composer.lock' : '[dry-run] Would write composer.json')
      return {status: 'dry-run', wroteLock: composerLock !== undefined}
    }

    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    await writeFile(composerJsonPath, composerJson, 'utf8')

    if (composerLock === undefined) {
      this.log('Wrote composer.json (no composer.lock on this site yet)')
      return {status: 'success', wroteLock: false}
    }

    const lockPath = join(process.cwd(), this.rootDir, 'composer.lock')
    await writeFile(lockPath, composerLock, 'utf8')
    this.log(`Wrote composer.json and composer.lock`)

    return {status: 'success', wroteLock: true}
  }
}
