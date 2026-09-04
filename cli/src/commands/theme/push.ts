import {Flags} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {isDowngrade, parseCollisions, SYNC_TIMEOUT_MS, type SyncResponse} from '../../utils/plugin-sync.js'
import {lockedWpackagistSlugs} from '../../utils/plugins.js'
import {diffThemes, parseInstalledThemes, type ThemeDiff, type WpNativeTheme} from '../../utils/themes.js'

type PushResult = {
  installed: string[]
  pinned: string[]
  removed: string[]
  status: 'composer-managed' | 'dry-run' | 'in-sync' | 'success'
}

const IN_SYNC: PushResult = {installed: [], pinned: [], removed: [], status: 'in-sync'}

export default class Push extends PushCommand {
  static description = 'Install themes on WordPress to match loopress.json (versions only, never switches the active theme)'
  static enableJsonFlag = true
  static examples = ['$ lps theme push', '$ lps theme push --force']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
    force: Flags.boolean({default: false, description: 'Allow downgrades and take over themes installed outside Loopress'}),
  }

  async run(): Promise<PushResult> {
    const {flags} = await this.parse(Push)
    const {force} = flags

    if (existsSync(join(process.cwd(), this.rootDir, 'composer.json'))) {
      this.warn('This project has a composer.json, which is authoritative. Run `lps composer push` instead.')
      return {...IN_SYNC, status: 'composer-managed'}
    }

    const manifest = this.localConfig.themes ?? {}
    if (Object.keys(manifest).length === 0) {
      this.error('No themes found in loopress.json. Run `lps theme pull` first.')
    }

    this.log(`Pushing themes to ${this.siteConfig.url}`)
    const raw = await this.wp.get<WpNativeTheme[]>('wp/v2/themes')
    const managed = lockedWpackagistSlugs(await this.fetchInstanceLock(), 'theme')
    const diff = diffThemes(manifest, parseInstalledThemes(raw), managed)

    this.guardForce(diff, force)

    if (isNoop(diff)) {
      this.log('Everything is already in sync.')
      return {...IN_SYNC}
    }

    for (const a of diff.toInstall) this.log(`  + ${a.slug} ${a.version}`)
    for (const p of diff.toPin) this.log(`  ~ ${p.slug} ${p.from} to ${p.to}`)
    for (const s of diff.toRemove) this.log(`  - ${s}`)
    for (const c of diff.collisions) this.log(`  ! ${c.slug} (take over)`)

    if (this.dryRun) return result(diff, 'dry-run', diff.toRemove, true)

    const response = await this.sync(manifest, force)
    if (response.output.trim()) this.log(response.output.trim())
    this.log('Themes synced.')
    await this.recordSuccess()

    return result(diff, 'success', response.removed ?? diff.toRemove, force)
  }

  private async fetchInstanceLock(): Promise<null | string> {
    try {
      const {composerLock} = await this.wp.get<{composerLock: string}>('loopress/v1/composer/lock')
      return composerLock
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  private guardForce(diff: ThemeDiff, force: boolean): void {
    if (force) return

    if (diff.collisions.length > 0) {
      const list = diff.collisions.map((c) => `${c.slug} (${c.installedVersion})`).join(', ')
      this.error(`${list} installed outside Loopress. Re-run with --force to take them over, or remove them from loopress.json.`)
    }

    const downgrades = diff.toPin.filter((p) => isDowngrade(p.from, p.to))
    if (downgrades.length > 0) {
      const list = downgrades.map((p) => `${p.slug} ${p.from} to ${p.to}`).join(', ')
      this.error(`Refusing to downgrade: ${list}. Re-run with --force.`)
    }
  }

  private async sync(manifest: Record<string, string>, force: boolean): Promise<SyncResponse> {
    try {
      return await this.wp.post<SyncResponse>(
        'loopress/v1/composer/sync',
        {force, intent: {themes: manifest}, lock: null},
        {timeoutMs: SYNC_TIMEOUT_MS},
      )
    } catch (error) {
      if (parseCollisions(error)) {
        this.error('The site rejected the push: themes installed outside Loopress. Re-run with --force.')
      }

      throw error
    }
  }
}

function isNoop(diff: ThemeDiff): boolean {
  return (
    diff.toInstall.length === 0 && diff.toPin.length === 0 && diff.toRemove.length === 0 && diff.collisions.length === 0
  )
}

function result(diff: ThemeDiff, status: PushResult['status'], removed: string[], includeCollisions: boolean): PushResult {
  const collisionSlugs = includeCollisions ? diff.collisions.map((c) => c.slug) : []
  return {
    installed: [...diff.toInstall.map((a) => a.slug), ...collisionSlugs],
    pinned: diff.toPin.map((p) => p.slug),
    removed,
    status,
  }
}
