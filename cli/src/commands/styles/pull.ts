import {Flags} from '@oclif/core'
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
  static description = 'Pull Global Styles from WordPress'
  static examples = [
    '$ lps styles pull',
    '$ lps styles pull --url http://example.com',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    dryRun: Flags.boolean({char: 'd', description: 'Dry run - show what would happen without making changes'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Pull)
    const {dryRun} = flags as {dryRun: boolean}
    const {url} = this.siteConfig
    const stylesDir = await this.resolveStylesPath()
    const outputPath = `${stylesDir}/global-styles.json`

    this.log(`📥 Pulling Global Styles from ${url}`)
    this.log(`📂 Target file: ${outputPath}`)
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
      await fs.mkdir(stylesDir, {recursive: true})
      await fs.writeFile(outputPath, JSON.stringify(dataToSave, null, 2))

      this.log(`✅ Successfully pulled global styles to ${outputPath}`)
    } catch (error) {
      this.error(`❌ Error pulling global styles: ${(error as Error).message}`)
    }
  }
}
