import {Flags} from '@oclif/core'
import got from 'got'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {ComposerJson} from '../../utils/composer.js'
import {readLocalConfig} from '../../utils/loopress-config.js'

export default class ComposerPush extends PushCommand {
  static description = 'Push composer.json and composer.lock to WordPress and run composer install'
  static examples = ['$ lps composer push', '$ lps composer push --dry-run']
  static flags = {
    ...PushCommand.baseFlags,
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would change without making changes'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ComposerPush)
    const dryRun = flags['dry-run']
    this.dryRun = dryRun
    const {url} = this.siteConfig

    const localConfig = await readLocalConfig()
    const rootDir = localConfig.rootDir ?? '.'

    const composerJsonPath = join(process.cwd(), rootDir, 'composer.json')
    const composerLockPath = join(process.cwd(), rootDir, 'composer.lock')

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

    if (dryRun) return

    const headers = await this.buildAuthHeaders()
    await got.post(`${url}/wp-json/loopress/v1/composer/sync`, {
      headers,
      json: {composerJson: composerJsonRaw, composerLock: composerLockRaw},
    })

    this.log('composer install completed on the server.')
    await this.recordSuccess()
  }
}
