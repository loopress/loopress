import {Args, Flags} from '@oclif/core'
import {glob} from 'glob'
import got from 'got'

import {WordpressDXCommand} from '../base.js'

export default class Push extends WordpressDXCommand {
  static args = {
    path: Args.string({default: './styles.json', description: 'Path to styles file'}),
  }
  static description = 'Push Global Styles to WordPress'
  static examples = [
    '$ wdx styles push',
    '$ wdx styles push --url http://example.com',
    '$ wdx styles push --path ./my-styles.json',
  ]
  static flags = {
    ...WordpressDXCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const {dryRun} = flags as {dryRun: boolean}
    const {url} = this.siteConfig
    const {path} = args

    this.log(`📤 Pushing Global Styles to ${url}`)
    this.log(`📂 From file: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(path, 'utf8')
      const data = JSON.parse(content)

      if (!data.id) {
        this.error('❌ File does not contain a global styles ID. Please run "styles pull" first.')
      }

      this.log('🎨 Bundling CSS files in memory...')
      const cssFiles = await glob('./styles/**/*.css')

      let bundledCss = ''
      if (cssFiles.length > 0) {
        const cssContents = await Promise.all(cssFiles.map((file) => fs.readFile(file, 'utf8')))
        bundledCss = cssContents.join('\n').trim()
        this.log(`✨ Bundled ${cssFiles.length} CSS files`)
      } else {
        this.log('⚠️ No CSS files found in ./styles/**/*.css')
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
