import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {lockedWpackagistSlugs} from '../../utils/plugins.js'
import {diffThemes, parseInstalledThemes, type WpNativeTheme} from '../../utils/themes.js'

type StatusResult = {
  drift: boolean
  missing: string[]
  status: 'composer-managed' | 'drift' | 'in-sync'
  wrongVersion: Array<{live: string; pinned: string; slug: string}>
}

export default class Status extends LoopressCommand {
  static description = 'Compare the themes on WordPress against loopress.json and report version drift'
  static enableJsonFlag = true
  static examples = ['$ lps theme status']
  static flags = {}

  async run(): Promise<StatusResult> {
    const {url} = this.siteConfig

    if (existsSync(join(process.cwd(), this.rootDir, 'composer.json'))) {
      this.warn('This project has a composer.json, which is authoritative. Run `lps composer` commands instead.')
      return {drift: false, missing: [], status: 'composer-managed', wrongVersion: []}
    }

    const manifest = this.localConfig.themes ?? {}
    const raw = await this.wp.get<WpNativeTheme[]>('wp/v2/themes')
    const installed = parseInstalledThemes(raw)
    const managed = lockedWpackagistSlugs(await this.fetchInstanceLock(), 'theme')
    const diff = diffThemes(manifest, installed, managed)

    const missing = [...diff.toInstall.map((a) => a.slug), ...diff.collisions.map((c) => c.slug)]
    const wrongVersion = diff.toPin.map((p) => ({live: p.from, pinned: p.to, slug: p.slug}))
    const drift = missing.length > 0 || wrongVersion.length > 0 || diff.toRemove.length > 0

    if (!drift) {
      this.log(`In sync with loopress.json (${url})`)
      return {drift: false, missing: [], status: 'in-sync', wrongVersion: []}
    }

    if (diff.toInstall.length > 0) this.log(`Not installed: ${diff.toInstall.map((a) => a.slug).join(', ')}`)
    if (diff.collisions.length > 0) this.log(`Installed outside Loopress: ${diff.collisions.map((c) => c.slug).join(', ')}`)
    for (const w of wrongVersion) this.log(`Version drift: ${w.slug} is ${w.live}, loopress.json pins ${w.pinned}`)
    if (diff.toRemove.length > 0) this.log(`Managed by Loopress but dropped from loopress.json: ${diff.toRemove.join(', ')}`)

    this.exit(1)
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
