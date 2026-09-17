import {Args} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {PushCommand} from '../../lib/push-command.js'
import {getActiveThemeGlobalStyles, globalStylesEndpoint, themeStylesFileName} from '../../utils/theme-styles-format.js'

export default class Push extends PushCommand {
  static args = {
    path: Args.string({description: 'Path to theme styles directory (overrides project config)'}),
  }

  static description =
    "Push the local Global Styles file to the active block theme's Site Editor > Styles on WordPress"

  static examples = ['$ lps theme-styles push']
  static flags = {
    ...PushCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Push)
    const {url} = this.siteConfig
    const dir = this.resolveThemeStylesPath(args.path)

    this.log(`Pushing Global Styles to ${url}`)

    const {id, stylesheet} = await getActiveThemeGlobalStyles(this.wp)
    const file = join(dir, themeStylesFileName(stylesheet))

    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.error(`No local Global Styles file found for the active theme ("${file}"). Run \`lps theme-styles pull\` first.`)
      }

      throw error
    }

    if (this.dryRun) {
      this.log(`[dry-run] Would push: ${file}`)
      return
    }

    const local = JSON.parse(raw) as {settings?: Record<string, unknown>; styles?: Record<string, unknown>}
    await this.wp.post(globalStylesEndpoint(id), {settings: local.settings ?? {}, styles: local.styles ?? {}})
    this.log(`Pushed: ${file}`)

    await this.recordSuccess()
  }
}
