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
  html: string
  slug: string
  status: PageStatus
  title: string
}

export type RemotePage = Page & {link: string}

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
//   -->
//
// A comment rather than YAML front matter so the file stays valid HTML, previewable as is in a
// browser. The header is stripped from what gets pushed. Throws on an unknown key or status so a
// typo never silently falls back to a default.
export function parsePageFile(slug: string, raw: string): Page {
  const header = /^\s*<!--([\s\S]*?)-->\r?\n?/.exec(raw)
  const meta: Record<string, string> = {}

  if (header) {
    for (const line of header[1].split(/\r?\n/)) {
      if (line.trim() === '') continue
      const colon = line.indexOf(':')
      if (colon === -1) throw new Error(`header line "${line.trim()}" is not a "key: value" pair`)
      const key = line.slice(0, colon).trim()
      if (key !== 'title' && key !== 'status') throw new Error(`unknown header key "${key}" (allowed: title, status)`)
      meta[key] = line.slice(colon + 1).trim()
    }
  }

  const status = meta.status ?? 'draft'
  if (!(PAGE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`status "${status}" is not one of ${PAGE_STATUSES.join(', ')}`)
  }

  return {
    html: header ? raw.slice(header[0].length) : raw,
    slug,
    status: status as PageStatus,
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
