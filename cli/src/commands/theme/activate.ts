import {Args} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {activateTheme, type SiteCapabilities} from '../../lib/capabilities.js'
import {guardProductionPush} from '../../lib/guard-production-push.js'

type ActivateResult = {active: string; previous: string; status: 'activated' | 'dry-run' | 'unchanged'}

export default class Activate extends LoopressCommand {
  static args = {
    stylesheet: Args.string({description: 'Theme to activate (default: the Loopress child theme, <parent>-loopress)'}),
  }

  static description =
    'Activate a theme on WordPress, the Loopress child theme by default. A child theme without settings of its own starts from a copy of its parent\'s theme mods and Global Styles. Set "activateChildTheme": true in loopress.json to have `lps theme template push` keep the child active.'

  static enableJsonFlag = true
  static examples = ['$ lps theme activate', '$ lps theme activate twentytwentyfive --env staging', '$ lps theme activate --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<ActivateResult> {
    const {args} = await this.parse(Activate)
    const {theme} = await this.capabilities()
    const stylesheet = args.stylesheet ?? this.childStylesheet(theme)

    if (stylesheet === theme.active) {
      this.log(`${stylesheet} is already the active theme.`)
      return {active: stylesheet, previous: theme.active, status: 'unchanged'}
    }

    if (this.dryRun) {
      this.log(`[dry-run] Would activate ${stylesheet} instead of ${theme.active}.`)
      return {active: stylesheet, previous: theme.active, status: 'dry-run'}
    }

    await guardProductionPush({dryRun: this.dryRun, error: (message) => this.error(message), siteConfig: this.siteConfig, yes: this.yes})
    const activation = await activateTheme(this.wp, stylesheet)
    this.log(`Activated ${activation.active} (was ${activation.previous}).`)
    return {active: activation.active, previous: activation.previous, status: 'activated'}
  }

  private childStylesheet(theme: SiteCapabilities['theme']): string {
    if (theme.child === undefined) this.error('The Loopress child theme needs Loopress Full. Name the theme to activate instead.')
    if (theme.child === null) {
      this.error(`The active theme "${theme.active}" can't have a Loopress child theme: it needs a block theme that isn't already a child theme.`)
    }

    if (!theme.child.exists) this.error(`${theme.child.stylesheet} doesn't exist yet. Run \`lps theme template push\` first.`)
    return theme.child.stylesheet
  }
}
