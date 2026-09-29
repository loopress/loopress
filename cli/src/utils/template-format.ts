import {type PageProblem, parseHtmlHeader, readLocalHtmlFiles, titleFromSlug} from './page-format.js'

export const CHILD_THEME_ENDPOINT = 'loopress/v1/child-theme'

// templates/<slug>.html. `title`/`postTypes` only when the header declares them: they become the
// template's `customTemplates` entry in the child theme's theme.json (ChildThemeController).
export type Template = {
  html: string
  postTypes?: string[]
  slug: string
  title?: string
}

// parts/<slug>.html, always registered in the child's `templateParts`.
export type Part = {
  area: string
  html: string
  slug: string
  title: string
}

// What ChildThemeController answers on GET and PUT.
export type ChildTheme = {
  active: boolean
  // Templates/parts edited in the Site Editor: their database copy wins over the child's file.
  customized: string[]
  exists: boolean
  parent: string
  parts: Part[]
  stylesheet: string
  templates: Template[]
}

// A block delimiter as the first line (`<!-- wp:template-part ... /-->`, the usual one) is markup,
// not a header.
const BLOCK_START = /^\s*<!--\s*\/?wp:/

// `{"slug":"header","theme":"twentytwentyfive"}` makes WordPress load the named theme's part, so
// the child's own parts/header.html would be silently ignored.
const THEMED_PART = /<!--\s*wp:template-part\s+\{[^}]*"theme"\s*:/

function parseFile(raw: string, keys: readonly string[]): {body: string; meta: Record<string, string>} {
  const parsed = BLOCK_START.test(raw) ? {body: raw, meta: {}} : parseHtmlHeader(raw, keys)
  if (THEMED_PART.test(parsed.body)) {
    throw new Error('a template-part block has a "theme" attribute, remove it: WordPress would load that theme\'s part instead of the one in parts/')
  }

  return parsed
}

export function parseTemplateFile(slug: string, raw: string): Template {
  const {body, meta} = parseFile(raw, ['title', 'postTypes'])
  const template: Template = {html: body, slug}
  if (meta.title) template.title = meta.title
  if (meta.postTypes) template.postTypes = meta.postTypes.split(',').map((type) => type.trim()).filter(Boolean)
  return template
}

// `area` defaults from the name, the way themes name their parts: header, header-large-title...
export function parsePartFile(slug: string, raw: string): Part {
  const {body, meta} = parseFile(raw, ['title', 'area'])
  const nameArea = /^(header|footer)(-|$)/.exec(slug)?.[1] ?? 'uncategorized'
  return {area: meta.area || nameArea, html: body, slug, title: meta.title || titleFromSlug(slug)}
}

// Same directory rules as pages/ (flat, `.html` only, strict slugs), every problem at once.
export async function readLocalTemplates(
  templatesDir: string,
  partsDir: string,
): Promise<{parts: Part[]; problems: PageProblem[]; templates: Template[]}> {
  const templates = await readLocalHtmlFiles(templatesDir, parseTemplateFile)
  const parts = await readLocalHtmlFiles(partsDir, parsePartFile)
  return {parts: parts.files, problems: [...templates.problems, ...parts.problems], templates: templates.files}
}
