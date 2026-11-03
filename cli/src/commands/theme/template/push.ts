import {createHash} from 'node:crypto'
import {join} from 'node:path'

import {activateTheme} from '../../../lib/capabilities.js'
import {type ResourceState} from '../../../lib/diff-state.js'
import {hasExclusions, isExcluded} from '../../../lib/exclude.js'
import {errorMessage} from '../../../lib/narrow.js'
import {logChanges, type PushChange, pushChanges, PushCommand} from '../../../lib/push-command.js'
import {formatPageProblems} from '../../../utils/page-format.js'
import {pluralize} from '../../../utils/pluralize.js'
import {projectHasChildThemeFiles, resolveResourceDir} from '../../../utils/resource-dirs.js'
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
    // Pushing would only create an empty child theme as a side effect.
    if (!projectHasChildThemeFiles(this.localConfig)) {
      this.error(`Nothing to push: no ${templatesPath}, ${partsPath}, ${resolveResourceDir('css', this.localConfig)} or ${resolveResourceDir('blockCss', this.localConfig)} directory.`)
    }

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

    // The PUT replaces every file of the child theme: what the site has under a path this
    // environment excludes (loopress.json) is sent back as it is, so it is left alone.
    const kept = await this.keptFromSite(templatesPath, partsPath, templates, parts)

    if (this.dryRun) {
      const changes = await this.previewChildTheme(templates, parts, css, kept)
      logChanges((message) => { this.log(message); }, changes.templates, 'templates/')
      logChanges((message) => { this.log(message); }, changes.parts, 'parts/')
      logChanges((message) => { this.log(message); }, changes.css, 'css/')
      if (this.localConfig.activateChildTheme) {
        const {child} = (await this.capabilities()).theme
        if (child && !child.active) this.log(`[dry-run] Would activate ${child.stylesheet}.`)
      }

      return {...names, changes, status: 'dry-run'}
    }

    const child = await this.wp.put<ChildTheme>(CHILD_THEME_ENDPOINT, {...css, parts: [...parts, ...kept.parts], templates: [...templates, ...kept.templates]})
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

  // The site's templates and parts under an excluded path the project doesn't push. Refuses when
  // the site can't be read: pushing blind would remove them.
  private async keptFromSite(templatesPath: string, partsPath: string, templates: Template[], parts: Part[]): Promise<{parts: Part[]; templates: Template[]}> {
    if (!hasExclusions()) return {parts: [], templates: []}
    const child = await this.readChildTheme()
    const localTemplates = new Set(templates.map((template) => template.slug))
    const localParts = new Set(parts.map((part) => part.slug))
    return {
      parts: child.parts.filter((part) => !localParts.has(part.slug) && isExcluded(join(partsPath, `${part.slug}.html`))),
      templates: child.templates.filter((template) => !localTemplates.has(template.slug) && isExcluded(join(templatesPath, `${template.slug}.html`))),
    }
  }

  // Same read and same refusal as previewRemote, one GET for templates, parts and CSS. Kept
  // files are held back, they are neither changes nor removals.
  private async previewChildTheme(
    templates: Template[],
    parts: Part[],
    css: ThemeCss,
    kept: {parts: Part[]; templates: Template[]},
  ): Promise<NonNullable<PushResult['changes']>> {
    const child = await this.readChildTheme()

    const localCss: ResourceState = new Map(css.blocks.map((block) => [`blocks/${block.name}.css`, sha256(block.css)]))
    if (css.style !== '') localCss.set('style.css', sha256(css.style))
    const cssChanges: CssChange[] = child.css
      ? pushChanges(localCss, new Map(Object.entries(child.css)), {mirror: true})
      : [...localCss.keys()].toSorted((a, b) => a.localeCompare(b)).map((id) => ({id, status: 'unknown'}))

    return {
      css: cssChanges,
      parts: withoutKept(pushChanges(bySlug([...parts, ...kept.parts]), bySlug(child.parts), {mirror: true}), kept.parts),
      templates: withoutKept(pushChanges(bySlug([...templates, ...kept.templates]), bySlug(child.templates), {mirror: true}), kept.templates),
    }
  }

  private async readChildTheme(): Promise<ChildTheme> {
    try {
      return await this.wp.get<ChildTheme>(CHILD_THEME_ENDPOINT)
    } catch (error) {
      this.error(`The site would refuse this push: ${errorMessage(error)}`)
    }
  }
}

function bySlug(files: Array<Part | Template>): ResourceState {
  return new Map(files.map(({slug, ...rest}) => [slug, rest]))
}

function withoutKept(changes: PushChange[], kept: Array<Part | Template>): PushChange[] {
  const slugs = new Set(kept.map((file) => file.slug))
  return changes.filter((change) => !slugs.has(change.id))
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
