import {Args} from '@oclif/core'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {
  canonicalGlobalStyles,
  getActiveThemeGlobalStyles,
  globalStylesEndpoint,
  type GlobalStylesRecord,
  themeStylesFileName,
} from '../../utils/theme-styles-format.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to theme styles directory (overrides project config)'}),
  }

  static description =
    "Pull the active block theme's Global Styles customizations (Site Editor > Styles) from WordPress into a local file"

  static examples = ['$ lps theme-styles pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Pull)
    const {url} = this.siteConfig
    const dir = this.resolveThemeStylesPath(args.path)

    this.log(`Pulling Global Styles from ${url}`)

    const {id, stylesheet} = await getActiveThemeGlobalStyles(this.wp)
    const item = await this.wp.get<GlobalStylesRecord>(globalStylesEndpoint(id))
    const file = join(dir, themeStylesFileName(stylesheet))

    if (this.dryRun) {
      this.log(`[dry-run] Would pull Global Styles for "${stylesheet}" to ${file}`)
      return
    }

    await mkdir(dir, {recursive: true})
    await writeFile(file, JSON.stringify(canonicalGlobalStyles(item), null, 2) + '\n')
    this.log(`Pulled Global Styles for "${stylesheet}" to ${file}`)
  }
}
