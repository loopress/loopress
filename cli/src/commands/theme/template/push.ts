import {PushCommand} from '../../../lib/push-command.js'
import {getResourceStateProvider} from '../../../lib/resource-state.js'
import {formatPageProblems} from '../../../utils/page-format.js'
import {pluralize} from '../../../utils/pluralize.js'
import {resolveResourceDir} from '../../../utils/resource-dirs.js'
import {CHILD_THEME_ENDPOINT, type ChildTheme, readLocalTemplates} from '../../../utils/template-format.js'

type PushResult = {
  active?: boolean
  customized?: string[]
  parts: string[]
  status: 'dry-run' | 'success'
  stylesheet?: string
  templates: string[]
}

export default class Push extends PushCommand {
  static description =
    'Push block templates (templates/<slug>.html) and template parts (parts/<slug>.html) as the files of a child theme of the active block theme, <parent>-loopress. The child mirrors the project: files removed locally are removed from it. It is never activated for you.'

  static enableJsonFlag = true
  static examples = ['$ lps theme template push', '$ lps theme template push --dry-run']
  static flags = {
    ...PushCommand.dryRunFlag,
    ...PushCommand.yesFlag,
  }

  async run(): Promise<PushResult> {
    await this.parse(Push)
    const templatesPath = resolveResourceDir('template', this.localConfig)
    const partsPath = resolveResourceDir('part', this.localConfig)

    this.log(`Pushing templates and parts to ${this.siteConfig.url}`)
    this.log(`Templates path: ${templatesPath}, parts path: ${partsPath}`)

    const {parts, problems, templates} = await readLocalTemplates(templatesPath, partsPath)
    if (problems.length > 0) {
      this.error(`Nothing was pushed, fix these files first:\n  ${formatPageProblems(problems)}`)
    }

    const names = {parts: parts.map((part) => part.slug), templates: templates.map((template) => template.slug)}
    this.log(`Found ${pluralize(templates.length, 'template')} and ${pluralize(parts.length, 'part')}`)

    if (this.dryRun) {
      await this.previewRemote(getResourceStateProvider('template'), templatesPath)
      this.log('[dry-run] Would rewrite the child theme with them.')
      return {...names, status: 'dry-run'}
    }

    const child = await this.wp.put<ChildTheme>(CHILD_THEME_ENDPOINT, {parts, templates})
    await this.recordSuccess()
    this.log(`Child theme ${child.stylesheet} written.`)

    if (!child.active) {
      this.warn(`${child.stylesheet} is not the active theme, so nothing changed on the site yet. Activate it in Appearance > Themes.`)
    }

    if (child.customized.length > 0) {
      this.warn(
        `Edited in the Site Editor, their database copy still wins over the pushed file: ${child.customized.join(', ')}. ` +
          'Clear their customizations in Appearance > Editor to use the pushed version.',
      )
    }

    return {...names, active: child.active, customized: child.customized, status: 'success', stylesheet: child.stylesheet}
  }
}
