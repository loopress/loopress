import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {isTimeoutError} from '../../lib/wp-client.js'
import {type ComposerJson} from '../../utils/composer.js'
import {parseCollisions, SYNC_TIMEOUT_MS, type SyncIntent, type SyncResponse} from '../../utils/plugin-sync.js'

type PushResult = {
  hasLock: boolean
  packageCount: number
  status: 'dry-run' | 'success'
}

// Split a composer.json `require` map into the three intent namespaces the sync endpoint
// understands. `composer/installers` is owned by the server scaffold, never sent.
function toIntent(require: Record<string, string>): SyncIntent {
  const intent: SyncIntent = {libraries: {}, plugins: {}, themes: {}}

  for (const [name, constraint] of Object.entries(require)) {
    if (name === 'composer/installers') continue
    if (name.startsWith('wpackagist-plugin/')) {
      intent.plugins![name.slice('wpackagist-plugin/'.length)] = constraint
    } else if (name.startsWith('wpackagist-theme/')) {
      intent.themes![name.slice('wpackagist-theme/'.length)] = constraint
    } else {
      intent.libraries![name] = constraint
    }
  }

  return intent
}

export default class ComposerPush extends PushCommand {
  static description = 'Push composer.json (and composer.lock, if present) to WordPress and run Composer'
  static enableJsonFlag = true
  static examples = ['$ lps composer push', '$ lps composer push --dry-run']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    force: Flags.boolean({default: false, description: 'Allow downgrades and take over plugins/themes installed outside Loopress'}),
  }

  async run(): Promise<PushResult> {
    const {url} = this.siteConfig
    const {flags} = await this.parse(ComposerPush)
    const {force} = flags

    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')
    const composerLockPath = join(process.cwd(), this.rootDir, 'composer.lock')

    if (!existsSync(composerJsonPath)) {
      this.error(`No composer.json found at ${composerJsonPath}. Run \`lps composer init\` first.`)
    }

    const parsed = JSON.parse(await readFile(composerJsonPath, 'utf8')) as ComposerJson
    const require = parsed.require ?? {}
    const packageCount = Object.keys(require).length
    const intent = toIntent(require)

    const hasLock = existsSync(composerLockPath)
    const lock = hasLock ? await readFile(composerLockPath, 'utf8') : null

    this.log(`Pushing composer.json (${packageCount} ${packageCount === 1 ? 'package' : 'packages'}) to ${url}`)
    if (lock) this.log('  + composer.lock included (reproducible install)')
    else this.warn('No composer.lock found. The server will resolve versions freely.')

    if (this.dryRun) return {hasLock, packageCount, status: 'dry-run'}

    this.log('Running Composer on the server, this can take a few minutes...')

    let response: SyncResponse
    try {
      response = await this.wp.post<SyncResponse>(
        'loopress/v1/composer/sync',
        {force, intent, lock},
        {timeoutMs: SYNC_TIMEOUT_MS},
      )
    } catch (error) {
      if (parseCollisions(error)) {
        this.error('Plugins or themes are installed outside Loopress. Re-run with --force to take them over.')
      }

      if (isTimeoutError(error)) {
        this.error(`${(error as Error).message} The Composer run may still be in progress on the server.`)
      }

      throw error
    }

    if (response.output.trim()) this.log(response.output.trim())
    this.log('Composer run completed on the server.')
    await this.recordSuccess()

    return {hasLock, packageCount, status: 'success'}
  }
}
