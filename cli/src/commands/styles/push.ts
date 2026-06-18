import {Flags} from '@oclif/core'
import {glob} from 'glob'
import got from 'got'

import {LoopressCommand} from '../base.js'

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
      const content = await fs.readFile(jsonPath, 'utf8')
      const data = JSON.parse(content)

      if (!data.id) {
        this.error('❌ File does not contain a global styles ID. Please run "styles pull" first.')
      }

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
      const headers = await this.buildAuthHeaders()

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
}
