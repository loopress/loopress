import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {isTimeoutError} from '../../lib/wp-client.js'
import {type ComposerJson} from '../../utils/composer.js'
import {
  type LockDriftEntry,
  parseCollisions,
  SYNC_TIMEOUT_MS,
  type SyncIntent,
  type SyncResponse,
} from '../../utils/plugin-sync.js'

type PushResult = {
  hasLock: boolean
  lockDrift: LockDriftEntry[]
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
  static description = 'Push composer.json to WordPress and run Composer to resolve and install dependencies'
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
    // The server resolves composer.json itself; it never installs from this lock (a crafted
    // lock could point package downloads at arbitrary hosts). It is sent only so the server
    // can report which pinned versions its own resolution moved. `lps composer pull` brings
    // the resolved lock back.
    const lock = hasLock ? await readFile(composerLockPath, 'utf8') : null

    this.log(`Pushing composer.json (${packageCount} ${packageCount === 1 ? 'package' : 'packages'}) to ${url}`)
    if (lock) this.log('  + composer.lock sent for drift comparison (the server resolves versions from composer.json)')

    if (this.dryRun) return {hasLock, lockDrift: [], packageCount, status: 'dry-run'}

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

    const lockDrift = response.lockDrift ?? []
    this.reportLockDrift(lockDrift)

    await this.recordSuccess()

    return {hasLock, lockDrift, packageCount, status: 'success'}
  }

  // The server resolves composer.json from scratch and never installs from the uploaded lock,
  // so a project that committed a lock can see versions move. Spell out exactly what changed
  // and point at `lps composer pull` to bring the resolved lock back locally.
  private reportLockDrift(lockDrift: LockDriftEntry[]): void {
    if (lockDrift.length === 0) return

    this.log('')
    this.log(
      `The server resolved ${lockDrift.length} ${lockDrift.length === 1 ? 'package' : 'packages'} to a different version than your local composer.lock:`,
    )
    for (const {from, name, to} of lockDrift) {
      this.log(`  ${name}: ${from ?? '(absent)'} -> ${to ?? '(removed)'}`)
    }

    this.log('Run `lps composer pull` to update your local composer.json and composer.lock.')
  }
}
