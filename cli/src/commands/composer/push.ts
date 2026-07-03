import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {ComposerJson} from '../../utils/composer.js'

export default class ComposerPush extends PushCommand {
  static description = 'Push composer.json and composer.lock to WordPress and run composer install'
  static examples = ['$ lps composer push', '$ lps composer push --dry-run']
  static flags = {
    ...PushCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {url} = this.siteConfig

    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    const composerLockPath = join(process.cwd(), this.rootDir, 'composer.lock')

    if (!existsSync(composerJsonPath)) {
      this.error(`No composer.json found at ${composerJsonPath}`)
    }

    const composerJsonRaw = await readFile(composerJsonPath, 'utf8')
    const parsed = JSON.parse(composerJsonRaw) as ComposerJson
    const packageCount = Object.keys(parsed.require ?? {}).length

    const hasLock = existsSync(composerLockPath)
    const composerLockRaw = hasLock ? await readFile(composerLockPath, 'utf8') : null

    this.log(`Pushing composer.json (${packageCount} ${packageCount === 1 ? 'package' : 'packages'}) to ${url}`)
    if (composerLockRaw) {
      this.log('  + composer.lock included (reproducible install)')
    } else {
      this.warn('No composer.lock found. The server will resolve versions freely.')
    }

    if (this.dryRun) return

    await this.wp.post('loopress/v1/composer/sync', {
      composerJson: composerJsonRaw,
      composerLock: composerLockRaw,
    })

    this.log('composer install completed on the server.')
    await this.recordSuccess()
  }
}
