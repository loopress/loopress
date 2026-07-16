import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'

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
    const {composerLock} = await this.wp.get<ComposerLockResponse>('loopress/v1/composer/lock')

    if (this.dryRun) {
      this.log('[dry-run] Would write composer.json and composer.lock')
      return
    }

    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    const lockPath = join(process.cwd(), this.rootDir, 'composer.lock')

    await writeFile(composerJsonPath, composerJson, 'utf8')
    await writeFile(lockPath, composerLock, 'utf8')
    this.log(`Wrote composer.json and composer.lock`)
  }
}
