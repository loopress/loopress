import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {type WpNativePlugin} from '../../types/plugin.js'
import {diffPlugins, lockedWpackagistSlugs, parseInstalledPlugins} from '../../utils/plugins.js'

type StatusResult = {
  drift: boolean
  inactive: string[]
  missing: string[]
  status: 'composer-managed' | 'drift' | 'in-sync'
  untrackedActive: string[]
  wrongVersion: Array<{live: string; pinned: string; slug: string}>
}

export default class Status extends LoopressCommand {
  static description = 'Compare the plugins on WordPress against loopress.json and report drift'
  static enableJsonFlag = true
  static examples = ['$ lps plugin status']
  static flags = {}

  async run(): Promise<StatusResult> {
    const {url} = this.siteConfig

    if (existsSync(join(process.cwd(), this.rootDir, 'composer.json'))) {
      this.warn('This project has a composer.json, which is authoritative for plugins. Run `lps composer` commands instead.')
      return {drift: false, inactive: [], missing: [], status: 'composer-managed', untrackedActive: [], wrongVersion: []}
    }

    const manifest = this.localConfig.plugins ?? {}

    const raw = await this.wp.get<WpNativePlugin[]>('wp/v2/plugins')
    const installed = parseInstalledPlugins(raw)
    const managed = lockedWpackagistSlugs(await this.fetchInstanceLock(), 'plugin')

    const diff = diffPlugins(manifest, installed, managed)

    const missing = diff.toInstall.map((a) => a.slug)
    const wrongVersion = diff.toPin.map((p) => ({live: p.from, pinned: p.to, slug: p.slug}))
    const inactive = diff.toActivate.map((a) => a.slug)
    const {untrackedActive} = diff
    // `collisions` are also drift (Loopress doesn't own them yet); surface them under missing's
    // banner so `plugin push --force` is the obvious next step.
    const collisions = diff.collisions.map((c) => c.slug)

    const drift =
      missing.length > 0 ||
      wrongVersion.length > 0 ||
      inactive.length > 0 ||
      diff.toRemove.length > 0 ||
      collisions.length > 0

    if (!drift && untrackedActive.length === 0) {
      this.log(`In sync with loopress.json (${url})`)
      return {drift: false, inactive: [], missing: [], status: 'in-sync', untrackedActive: [], wrongVersion: []}
    }

    if (missing.length > 0) this.log(`Not installed: ${missing.join(', ')}`)
    if (collisions.length > 0) this.log(`Installed outside Loopress (run \`plugin push --force\`): ${collisions.join(', ')}`)
    for (const w of wrongVersion) this.log(`Version drift: ${w.slug} is ${w.live}, loopress.json pins ${w.pinned}`)
    if (inactive.length > 0) this.log(`Pinned but inactive: ${inactive.join(', ')}`)
    if (diff.toRemove.length > 0) this.log(`Managed by Loopress but dropped from loopress.json: ${diff.toRemove.join(', ')}`)
    if (untrackedActive.length > 0) this.log(`Active but untracked: ${untrackedActive.join(', ')}`)

    if (drift) this.exit(1)

    return {drift, inactive, missing, status: drift ? 'drift' : 'in-sync', untrackedActive, wrongVersion}
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
}
