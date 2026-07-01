import {Flags} from '@oclif/core'
import got from 'got'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {readLocalConfig} from '../../utils/loopress-config.js'

interface ComposerLockResponse {
  composerLock: string
}

export default class ComposerPull extends LoopressCommand {
  static description = 'Pull composer.lock from the WordPress server'
  static examples = ['$ lps composer pull', '$ lps composer pull --dry-run']
  static flags = {
    ...LoopressCommand.baseFlags,
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would be written without making changes'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ComposerPull)
    const dryRun = flags['dry-run']
    const {url} = this.siteConfig

    this.log(`Pulling composer.lock from ${url}`)

    const headers = await this.buildAuthHeaders()
    const {composerLock}: ComposerLockResponse = await got
      .get(`${url}/wp-json/loopress/v1/composer/lock`, {headers})
      .json()

    if (dryRun) {
      this.log('[dry-run] Would write composer.lock')
      return
    }

    const localConfig = await readLocalConfig()
    const rootDir = localConfig.rootDir ?? '.'
    const lockPath = join(process.cwd(), rootDir, 'composer.lock')

    await writeFile(lockPath, composerLock, 'utf8')
    this.log(`Wrote composer.lock`)
  }
}
