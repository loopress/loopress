import {createHash} from 'node:crypto'

import {activateTheme} from '../../../lib/capabilities.js'
import {type ResourceState} from '../../../lib/diff-state.js'
import {logChanges, type PushChange, pushChanges, PushCommand} from '../../../lib/push-command.js'
import {formatPageProblems} from '../../../utils/page-format.js'
import {pluralize} from '../../../utils/pluralize.js'
import {resolveResourceDir} from '../../../utils/resource-dirs.js'
import {CHILD_THEME_ENDPOINT, type ChildTheme, type Part, readLocalTemplates, type Template} from '../../../utils/template-format.js'
import {bundleThemeCss, type ThemeCss} from '../../../utils/theme-css.js'

// The site's CSS is only known to a plugin that reports it (ChildTheme.css): `unknown` otherwise.
type CssChange = {id: string; status: 'unknown' | PushChange['status']}

type PushResult = {
  active?: boolean
  blockStyles: string[]
  // Dry run only, against the child theme on the site. The child mirrors the project, so a file
  // it has and the project doesn't is `removed`.
  changes?: {css: CssChange[]; parts: PushChange[]; templates: PushChange[]}
  customized?: string[]
  parts: string[]
  status: 'dry-run' | 'success'
  stylesheet?: string
  templates: string[]
  unknownBlocks?: string[]
}

export default class Push extends PushCommand {
  static override description =
    'Push block templates (theme/templates/<slug>.html), template parts (theme/parts/<slug>.html) and the theme CSS (theme/css/style.css, theme/blocks/<namespace>/<block>.css, bundled with esbuild) as the files of a child theme of the active block theme, <parent>-loopress. The child mirrors the project: files removed locally are removed from it. It is activated only when loopress.json sets "activateChildTheme": true, see `lps theme activate`.'

  static override enableJsonFlag = true
  static override examples = ['$ lps theme template push', '$ lps theme template push --dry-run']
  static override flags = {
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
      const changes = await this.previewChildTheme(templates, parts, css)
      logChanges((message) => { this.log(message); }, changes.templates, 'templates/')
      logChanges((message) => { this.log(message); }, changes.parts, 'parts/')
      logChanges((message) => { this.log(message); }, changes.css, 'css/')
      if (this.localConfig.activateChildTheme) {
        const {child} = (await this.capabilities()).theme
        if (child && !child.active) this.log(`[dry-run] Would activate ${child.stylesheet}.`)
      }

      return {...names, changes, status: 'dry-run'}
    }

    const child = await this.wp.put<ChildTheme>(CHILD_THEME_ENDPOINT, {...css, parts, templates})
    await this.recordSuccess()
    this.log(`Child theme ${child.stylesheet} written.`)

    // Activated only when the project asks for it: a theme switch changes every per-theme setting.
    let {active} = child
    if (!active && this.localConfig.activateChildTheme) {
      const activation = await activateTheme(this.wp, child.stylesheet)
      active = true
      this.log(`Activated ${child.stylesheet} (was ${activation.previous}), as loopress.json's activateChildTheme asks.`)
    }

    if (!active) {
      this.warn(
        `${child.stylesheet} is not the active theme, so nothing changed on the site yet. Run \`lps theme activate\`, or set "activateChildTheme": true in loopress.json.`,
      )
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
      active,
      customized: child.customized,
      status: 'success',
      stylesheet: child.stylesheet,
      unknownBlocks,
    }
  }

  // Same read and same refusal as previewRemote, one GET for templates, parts and CSS.
  private async previewChildTheme(templates: Template[], parts: Part[], css: ThemeCss): Promise<NonNullable<PushResult['changes']>> {
    let child: ChildTheme
    try {
      child = await this.wp.get<ChildTheme>(CHILD_THEME_ENDPOINT)
    } catch (error) {
      this.error(`The site would refuse this push: ${(error as Error).message}`)
    }

    const localCss: ResourceState = new Map(css.blocks.map((block) => [`blocks/${block.name}.css`, sha256(block.css)]))
    if (css.style !== '') localCss.set('style.css', sha256(css.style))
    const cssChanges: CssChange[] = child.css
      ? pushChanges(localCss, new Map(Object.entries(child.css)), {mirror: true})
      : [...localCss.keys()].toSorted((a, b) => a.localeCompare(b)).map((id) => ({id, status: 'unknown'}))

    return {
      css: cssChanges,
      parts: pushChanges(bySlug(parts), bySlug(child.parts), {mirror: true}),
      templates: pushChanges(bySlug(templates), bySlug(child.templates), {mirror: true}),
    }
  }
}

function bySlug(files: Array<Part | Template>): ResourceState {
  return new Map(files.map(({slug, ...rest}) => [slug, rest]))
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
