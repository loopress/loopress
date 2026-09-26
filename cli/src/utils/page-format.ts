import {readdir, readFile} from 'node:fs/promises'
import {basename, extname, join} from 'node:path'

export const PAGES_ENDPOINT = 'loopress/v1/pages'

// Mirrored server-side in PagesController. No leading, trailing or doubled hyphen: WordPress's
// sanitize_title() would rewrite those, and the page would no longer match its file name.
export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const PAGE_STATUSES = ['draft', 'publish'] as const
export type PageStatus = (typeof PAGE_STATUSES)[number]

// What `lps page push` sends and what PagesController hands back (plus `link`), so the two
// sides of `lps page diff` compare the exact same fields.
export type Page = {
  fullWidth: boolean
  hideTitle: boolean
  html: string
  slug: string
  status: PageStatus
  template: string
  title: string
}

const HEADER_KEYS = ['title', 'status', 'full-width', 'hide-title', 'template'] as const

function parseBoolean(key: string, value: string | undefined): boolean {
  if (value === undefined) return false
  if (value !== 'true' && value !== 'false') throw new Error(`"${key}" must be "true" or "false", got "${value}"`)
  return value === 'true'
}

export type RemotePage = Page & {link: string}

// Only on a push of pages/home.html that changed Settings > Reading (see PagesController).
export type PushedPage = RemotePage & {frontPage?: 'set' | 'unset'}

const FRONT_PAGE_NOTES = {
  set: 'now the site front page',
  unset: 'no longer the front page, the site shows its latest posts',
} as const

export type PageProblem = {file: string; message: string}

export function formatPageProblems(problems: PageProblem[]): string {
  return problems.map((problem) => `${problem.file}: ${problem.message}`).join('\n  ')
}

// `legal-notice` -> `Legal notice`.
export function titleFromSlug(slug: string): string {
  const words = slug.split('-').filter(Boolean).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// A page file is plain HTML, optionally opened by an HTML comment of `key: value` lines:
//
//   <!--
//   title: Legal notice
//   status: publish
//   template: page-no-title
//   -->
//
// A comment rather than YAML front matter so the file stays valid HTML, previewable as is in a
// browser. The header is stripped from what gets pushed. Throws on an unknown key or status so a
// typo never silently falls back to a default. `template` is the active theme's own template
// slug (a block theme's templates/<slug>.html, or a classic theme's page-<slug>.php); unlike
// `status`, it's never validated here, an unknown slug just makes WordPress fall back to the
// default template, the same silent no-op as `full-width`/`hide-title` on a theme that doesn't
// support them.
export function parsePageFile(slug: string, raw: string): Page {
  const header = /^\s*<!--([\s\S]*?)-->\r?\n?/.exec(raw)
  const meta: Record<string, string> = {}

  if (header) {
    for (const line of header[1].split(/\r?\n/)) {
      if (line.trim() === '') continue
      const colon = line.indexOf(':')
      if (colon === -1) throw new Error(`header line "${line.trim()}" is not a "key: value" pair`)
      const key = line.slice(0, colon).trim()
      if (!(HEADER_KEYS as readonly string[]).includes(key)) throw new Error(`unknown header key "${key}" (allowed: ${HEADER_KEYS.join(', ')})`)
      meta[key] = line.slice(colon + 1).trim()
    }
  }

  const status = meta.status ?? 'draft'
  if (!(PAGE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`status "${status}" is not one of ${PAGE_STATUSES.join(', ')}`)
  }

  return {
    fullWidth: parseBoolean('full-width', meta['full-width']),
    hideTitle: parseBoolean('hide-title', meta['hide-title']),
    html: header ? raw.slice(header[0].length) : raw,
    slug,
    status: status as PageStatus,
    template: meta.template ?? '',
    title: meta.title || titleFromSlug(slug),
  }
}

// Reads every page of `dir` and reports every problem at once instead of skipping bad files
// like the other resources do: a page push is declarative, so anything unexpected in the
// directory (a `.php`, a subdirectory, a bad header) must stop it before any network call.
// Dotfiles (.DS_Store, editor droppings) are ignored. A missing directory is "no pages".
export async function readLocalPages(dir: string): Promise<{pages: Page[]; problems: PageProblem[]}> {
  let entries
  try {
    entries = await readdir(dir, {withFileTypes: true})
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {pages: [], problems: []}
    throw error
  }

  const pages: Page[] = []
  const problems: PageProblem[] = []

  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const filePath = join(dir, entry.name)
    if (!entry.isFile()) {
      problems.push({file: filePath, message: `subdirectories are not supported, keep every page at the top of ${dir}`})
      continue
    }

    if (extname(entry.name) !== '.html') {
      problems.push({file: filePath, message: `only .html files are allowed in ${dir}`})
      continue
    }

    const slug = basename(entry.name, '.html')
    if (!PAGE_SLUG_PATTERN.test(slug)) {
      problems.push({file: filePath, message: 'the file name must be lowercase letters and digits separated by single hyphens (e.g. "legal-notice.html")'})
      continue
    }

    try {
      pages.push(parsePageFile(slug, await readFile(filePath, 'utf8')))
    } catch (error) {
      problems.push({file: filePath, message: (error as Error).message})
    }
  }

  return {pages, problems}
}

export function frontPageNote(page: PushedPage): string {
  return page.frontPage === undefined ? '' : ` (${FRONT_PAGE_NOTES[page.frontPage]})`
}
