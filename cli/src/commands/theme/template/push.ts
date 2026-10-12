import {PushCommand} from '../../../lib/push-command.js'
import {getResourceStateProvider} from '../../../lib/resource-state.js'
import {formatPageProblems} from '../../../utils/page-format.js'
import {pluralize} from '../../../utils/pluralize.js'
import {resolveResourceDir} from '../../../utils/resource-dirs.js'
import {CHILD_THEME_ENDPOINT, type ChildTheme, readLocalTemplates} from '../../../utils/template-format.js'
import {bundleThemeCss} from '../../../utils/theme-css.js'

type PushResult = {
  active?: boolean
  blockStyles: string[]
  customized?: string[]
  parts: string[]
  status: 'dry-run' | 'success'
  stylesheet?: string
  templates: string[]
  unknownBlocks?: string[]
}

export default class Push extends PushCommand {
  static description =
    'Push block templates (theme/templates/<slug>.html), template parts (theme/parts/<slug>.html) and the theme CSS (theme/css/style.css, theme/blocks/<namespace>/<block>.css, bundled with esbuild) as the files of a child theme of the active block theme, <parent>-loopress. The child mirrors the project: files removed locally are removed from it. It is never activated for you.'

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
    const {css, problems: cssProblems} = await bundleThemeCss(
      resolveResourceDir('css', this.localConfig),
      resolveResourceDir('blockCss', this.localConfig),
    )
    problems.push(...cssProblems)
    if (problems.length > 0) {
      this.error(`Nothing was pushed, fix these files first:\n  ${formatPageProblems(problems)}`)
    }

    const names = {
      blockStyles: css.blocks.map((block) => block.name),
      parts: parts.map((part) => part.slug),
      templates: templates.map((template) => template.slug),
    }
    this.log(
      `Found ${pluralize(templates.length, 'template')}, ${pluralize(parts.length, 'part')}, ` +
        `${css.style ? 'a global stylesheet' : 'no global stylesheet'} and ${pluralize(css.blocks.length, 'block stylesheet')}`,
    )

    if (this.dryRun) {
      await this.previewRemote(getResourceStateProvider('template'), templatesPath)
      this.log('[dry-run] Would rewrite the child theme with them.')
      return {...names, status: 'dry-run'}
    }

    const child = await this.wp.put<ChildTheme>(CHILD_THEME_ENDPOINT, {...css, parts, templates})
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

    // A warning, never a refusal: the block may come from a plugin active on another environment.
    const unknownBlocks = child.unknownBlocks ?? []
    if (unknownBlocks.length > 0) {
      this.warn(
        `No block registered on this site under these names, their CSS will never load: ${unknownBlocks.join(', ')}. ` +
          'Check the file name in theme/blocks/, or activate the plugin that provides the block.',
      )
    }

    return {
      ...names,
      active: child.active,
      customized: child.customized,
      status: 'success',
      stylesheet: child.stylesheet,
      unknownBlocks,
    }
  }
}
