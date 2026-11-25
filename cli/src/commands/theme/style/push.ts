import {Args} from '@oclif/core'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {errorCode, isRecord} from '../../../lib/narrow.js'
import {type PushChange, PushCommand} from '../../../lib/push-command.js'
import {getResourceStateProvider, type ResourceStateProvider} from '../../../lib/resource-state.js'
import {canonicalGlobalStyles, getActiveThemeGlobalStyles, globalStylesEndpoint, themeStylesFileName} from '../../../utils/theme-styles-format.js'

type ThemeStylePushResult = {changes?: PushChange[]; file: string; status: 'dry-run' | 'success'}

export default class Push extends PushCommand {
  static override args = {
    path: Args.string({description: 'Path to theme styles directory (overrides project config)'}),
  }

  static override description =
    "Push the local Global Styles file to the active block theme's Site Editor > Styles on WordPress"

  static override enableJsonFlag = true
  static override examples = ['$ lps theme style push']
  static override flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<ThemeStylePushResult> {
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
      if (errorCode(error) === 'ENOENT') {
        this.error(`No local Global Styles file found for the active theme ("${file}"). Run \`lps theme style pull\` first.`)
      }

      throw error
    }

    const local: unknown = JSON.parse(raw)
    // Never fall back to empty settings/styles: that push would wipe the site's customizations.
    if (!isRecord(local)) throw new Error(`${file} is not a JSON object`)
    const {settings, styles} = local

    // Only the active theme's file is pushed, whatever else the directory holds.
    const stored = getResourceStateProvider('theme-style')
    // An empty file has no state entry, like an uncustomized site, so diff reports no drift. For
    // this push it is a reset that clears the site's customizations: the outside-edits guard and
    // the dry run must see it, so the push's local state keeps it.
    let reset = false
    const provider: ResourceStateProvider = {
      ...stored,
      async local(localDir, onWarn, wp) {
        const state = await stored.local(localDir, onWarn, wp)
        reset = !state.has(stylesheet)
        if (reset) state.set(stylesheet, canonicalGlobalStyles({settings, styles}))
        return state
      },
    }
    const beforeState = await this.captureBeforePushState(provider, dir, (name) => name === stylesheet)

    // The active theme always has a Global Styles record: an uncustomized one has no state entry,
    // yet the push updates it, it never creates one. A reset of an uncustomized site changes nothing.
    if (this.dryRun) {
      const changes = this.previewChanges.map((change): PushChange => (change.status === 'created' ? {...change, status: reset ? 'unchanged' : 'changed'} : change))
      return {changes, file, status: 'dry-run'}
    }

    await this.wp.post(globalStylesEndpoint(id), {settings: settings ?? {}, styles: styles ?? {}})
    this.log(`Pushed: ${file}`)

    await this.writeAfterPushSnapshot(provider, dir, beforeState)

    await this.recordSuccess()
    return {file, status: 'success'}
  }
}
