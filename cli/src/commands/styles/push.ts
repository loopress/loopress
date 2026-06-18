import {Flags} from '@oclif/core'
import {glob} from 'glob'
import got from 'got'

import {LoopressCommand} from '../base.js'

interface Theme {
  _links: {'wp:user-global-styles': Array<{href: string}>}
}

interface GlobalStylesData {
  id: string
  settings: object
  styles: object
}

export default class Push extends LoopressCommand {
  static description = 'Push Global Styles to WordPress'
  static examples = [
    '$ lps styles push',
    '$ lps styles push --url http://example.com',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Push)
    const {dryRun} = flags as {dryRun: boolean}
    const {url} = this.siteConfig
    const stylesDir = await this.resolveStylesPath()
    const jsonPath = `${stylesDir}/global-styles.json`

    this.log(`📤 Pushing Global Styles to ${url}`)
    this.log(`📂 From directory: ${stylesDir}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const fs = await import('node:fs/promises')
      const headers = await this.buildAuthHeaders()

      const data = await this.readOrFetchGlobalStyles(jsonPath, url, headers, fs)

      this.log('🎨 Bundling CSS files in memory...')
      const cssFiles = await glob(`${stylesDir}/**/*.css`)

      let bundledCss = ''
      if (cssFiles.length > 0) {
        const cssContents = await Promise.all(cssFiles.map((file) => fs.readFile(file, 'utf8')))
        bundledCss = cssContents.join('\n').trim()
        this.log(`✨ Bundled ${cssFiles.length} CSS files`)
      } else {
        this.log(`⚠️ No CSS files found in ${stylesDir}/**/*.css`)
      }

      const endpoint = `${url}/wp-json/wp/v2/global-styles/${data.id}`
      const payload = {
        settings: data.settings,
        styles: {
          ...data.styles,
          ...(bundledCss ? {css: bundledCss} : {}),
        },
      }

      if (dryRun) {
        this.log(`📝 [DRY RUN] Would push to ${endpoint}`)
        this.log(`📄 Payload preview: ${JSON.stringify(payload).slice(0, 100)}...`)
        return
      }

      await got.post(endpoint, {headers, json: payload})
      this.log(`✅ Successfully pushed global styles to ID: ${data.id}`)
    } catch (error) {
      this.error(`❌ Error pushing global styles: ${(error as Error).message}`)
    }
  }

  private async readOrFetchGlobalStyles(
    jsonPath: string,
    url: string,
    headers: Record<string, string>,
    fs: typeof import('node:fs/promises'),
  ): Promise<GlobalStylesData> {
    try {
      const content = await fs.readFile(jsonPath, 'utf8')
      return JSON.parse(content) as GlobalStylesData
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    this.log('ℹ️  No local cache found — fetching global styles from WordPress...')
    const themes: Theme[] = await got.get(`${url}/wp-json/wp/v2/themes?status=active`, {headers}).json()

    if (!themes || themes.length === 0) {
      this.error('❌ No active theme found.')
    }

    const globalStylesEndpoint = themes[0]._links['wp:user-global-styles'][0].href
    const globalStyles: GlobalStylesData = await got.get(globalStylesEndpoint, {headers}).json()
    const data = {id: globalStyles.id, settings: globalStyles.settings, styles: globalStyles.styles}

    await fs.mkdir(jsonPath.replace(/\/[^/]+$/, ''), {recursive: true})
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2))
    this.log(`💾 Cached to ${jsonPath}`)

    return data
  }
}
