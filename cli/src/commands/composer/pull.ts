import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isNotFoundError} from '../../lib/wp-client.js'

interface ComposerJsonResponse {
  composerJson: string
}

interface ComposerLockResponse {
  composerLock: string
}

export default class ComposerPull extends LoopressCommand {
  static description = 'Pull composer.json and composer.lock from WordPress'
  static examples = ['$ lps composer pull', '$ lps composer pull --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {url} = this.siteConfig

    this.log(`Pulling composer.json and composer.lock from ${url}`)

    const {composerJson} = await this.wp.get<ComposerJsonResponse>('loopress/v1/composer/json')

    // A site that never had Composer dependencies pushed has no composer.lock yet: that's a
    // legitimate applicative 404 from the Loopress controller, not a sign anything is broken.
    let composerLock: string | undefined
    try {
      ;({composerLock} = await this.wp.get<ComposerLockResponse>('loopress/v1/composer/lock'))
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }

    if (this.dryRun) {
      this.log(composerLock ? '[dry-run] Would write composer.json and composer.lock' : '[dry-run] Would write composer.json')
      return
    }

    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    await writeFile(composerJsonPath, composerJson, 'utf8')

    if (composerLock === undefined) {
      this.log('Wrote composer.json (no composer.lock on this site yet)')
      return
    }

    const lockPath = join(process.cwd(), this.rootDir, 'composer.lock')
    await writeFile(lockPath, composerLock, 'utf8')
    this.log(`Wrote composer.json and composer.lock`)
  }
}
