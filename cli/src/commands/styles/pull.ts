import {Args, Flags} from '@oclif/core'
import got from 'got'

import {LoopressCommand} from '../base.js'

interface Theme {
  _links: {
    'wp:user-global-styles': Array<{href: string}>
  }
  id: number
  name: string
  stylesheet: string
}

interface GlobalStyles {
  id: string
  settings: object
  styles: object
}

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({default: './styles.json', description: 'Path to styles file'}),
  }
  static description = 'Pull Global Styles from WordPress'
  static examples = [
    '$ lps styles pull',
    '$ lps styles pull --url http://example.com',
    '$ lps styles pull --path ./my-styles.json',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const {dryRun} = flags as {dryRun: boolean}
    const {url} = this.siteConfig
    const {path} = args

    this.log(`📥 Pulling Global Styles from ${url}`)
    this.log(`📂 Target file: ${path}`)
    this.log(`🔄 Dry run: ${dryRun ? 'yes' : 'no'}`)

    try {
      const headers = await this.buildAuthHeaders()

      this.log('🔍 Finding active theme...')
      const themes: Theme[] = await got.get(`${url}/wp-json/wp/v2/themes?status=active`, {headers}).json()

      if (!themes || themes.length === 0) {
        this.error('❌ No active theme found.')
      }

      const activeTheme = themes[0]
      const globalStylesEndpoint = activeTheme._links['wp:user-global-styles'][0].href

      if (!globalStylesEndpoint) {
        this.error(`❌ Active theme "${activeTheme.name}" does not have global styles endpoint.`)
      }

      const globalStyles: GlobalStyles = await got.get(globalStylesEndpoint, {headers}).json()

      const dataToSave = {
        id: globalStyles.id,
        settings: globalStyles.settings,
        styles: globalStyles.styles,
      }

      if (dryRun) {
        this.log(`📝 [DRY RUN] Would pull styles and settings for ID: ${globalStyles.id}`)
        this.log(`📄 Data preview: ${JSON.stringify(dataToSave).slice(0, 100)}...`)
        return
      }

      const fs = await import('node:fs/promises')
      await fs.writeFile(path, JSON.stringify(dataToSave, null, 2))

      this.log(`✅ Successfully pulled global styles to ${path}`)
    } catch (error) {
      this.error(`❌ Error pulling global styles: ${(error as Error).message}`)
    }
  }
}
