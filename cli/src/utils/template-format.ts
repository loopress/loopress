import {type PageProblem, parseHtmlHeader, readLocalHtmlFiles, titleFromSlug} from './page-format.js'

export const TEMPLATES_ENDPOINT = 'loopress/v1/templates'

// What `lps template push` sends and TemplatesController hands back, compared as is by
// `lps template diff`.
export type Template = {
  html: string
  slug: string
  title: string
}

const HEADER_KEYS = ['title'] as const

// A template file is block markup (what the Site Editor saves, e.g. `<!-- wp:post-content /-->`),
// optionally opened by the same `key: value` comment header as a page. Only `title` is known: it's
// the name shown in the editor's template picker, derived from the slug when absent. A file opening
// on a block delimiter (`<!-- wp:template-part ... /-->`, the usual first line) has no header.
export function parseTemplateFile(slug: string, raw: string): Template {
  if (/^\s*<!--\s*\/?wp:/.test(raw)) return {html: raw, slug, title: titleFromSlug(slug)}

  const {body, meta} = parseHtmlHeader(raw, HEADER_KEYS)
  return {html: body, slug, title: meta.title || titleFromSlug(slug)}
}

// Same directory rules as pages/ (flat, `.html` only, strict slugs), every problem at once.
export async function readLocalTemplates(dir: string): Promise<{problems: PageProblem[]; templates: Template[]}> {
  const {files, problems} = await readLocalHtmlFiles(dir, parseTemplateFile)
  return {problems, templates: files}
}
