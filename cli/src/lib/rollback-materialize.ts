import {mkdir, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

import {getAcfKey} from '../utils/acf-format.js'
import {getFormId, getFormTitle} from '../utils/form-format.js'
import {getMenuSlug} from '../utils/menu-format.js'
import {defaultReadonlyFor, type LocalOption, optionFileName} from '../utils/option-format.js'
import {redirectFileBase, type SeoRedirect} from '../utils/seo-format.js'
import {buildMetaFile, buildSnippetFile, type NormalizedSnippet, type SnippetType} from '../utils/snippet-format.js'
import {themeStylesFileName} from '../utils/theme-styles-format.js'
import {toSlug} from '../utils/to-slug.js'

const SNIPPET_EXTENSIONS: Record<SnippetType, string> = {css: 'css', html: 'html', js: 'js', php: 'php', text: 'txt'}

type Materializer = (id: string, value: unknown, dir: string) => Promise<void>

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), {recursive: true})
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

// id: the snapshot's map key, a numeric WordPress id (snapshots only ever come from
// `provider.remote()`, which never produces the "local:<file>" placeholder ids a not-yet-pushed
// local file gets, see resource-state.ts). value: the canonical snippet fields resource-state.ts
// compares (no `id`, no `description`, `code` with its `<?php` tag already stripped), exactly
// what `normalizeSnippet` + `stripPhpOpeningTag` produce, so it plugs straight into the same
// `buildSnippetFile`/`buildMetaFile` pair `snippet pull` uses to write files.
async function snippet(id: string, value: unknown, dir: string): Promise<void> {
  const fields = value as Omit<NormalizedSnippet, 'description' | 'id'>
  const normalized: NormalizedSnippet = {...fields, description: '', id: Number(id)}
  const ext = SNIPPET_EXTENSIONS[normalized.type]
  const base = `${normalized.id}-${toSlug(normalized.name)}`

  await mkdir(dir, {recursive: true})
  await writeFile(join(dir, `${base}.${ext}`), buildSnippetFile(normalized))
  await writeFile(join(dir, `${base}.json`), buildMetaFile(normalized))
}

// value is the whole form JSON (minus `modified`/`modified_gmt`), the same shape `form pull`
// writes verbatim; `form push` re-sends it as-is.
async function form(id: string, value: unknown, dir: string): Promise<void> {
  const data = value as Record<string, unknown>
  const formId = getFormId(data) ?? Number(id)
  const slug = toSlug(getFormTitle(data), 'untitled')
  await writeJson(join(dir, `${formId}-${slug}.json`), data)
}

// id is `<type>/<key>` (see resource-state.ts's acfProvider); value is the whole ACF export
// object (minus `modified`), already carrying its own `key`.
async function acf(id: string, value: unknown, dir: string): Promise<void> {
  const separator = id.indexOf('/')
  const type = id.slice(0, separator)
  const data = value as Record<string, unknown>
  const key = getAcfKey(data) ?? id.slice(separator + 1)
  await writeJson(join(dir, type, `${key}.json`), data)
}

// api/hook: id is the filename (possibly nested, `/`-joined); value is the raw PHP file text.
async function phpFile(id: string, value: unknown, dir: string): Promise<void> {
  const filePath = join(dir, `${id}.php`)
  await mkdir(dirname(filePath), {recursive: true})
  await writeFile(filePath, String(value))
}

// ids are 'settings', `post-meta/<postType>/<slug>`, or `redirects/<id>` (see resource-state.ts's
// seoProvider). Each value round-trips to the exact file `seo pull` would have written.
async function seo(id: string, value: unknown, dir: string): Promise<void> {
  if (id === 'settings') {
    await writeJson(join(dir, 'settings.json'), value)
    return
  }

  if (id.startsWith('post-meta/')) {
    const rest = id.slice('post-meta/'.length)
    const separator = rest.indexOf('/')
    const postType = rest.slice(0, separator)
    const slug = rest.slice(separator + 1)
    await writeJson(join(dir, 'post-meta', postType, `${slug}.json`), value)
    return
  }

  if (id.startsWith('redirects/')) {
    const redirect = value as SeoRedirect
    await writeJson(join(dir, 'redirects', `${redirectFileBase(redirect)}.json`), redirect)
    return
  }

  throw new Error(`Unrecognized SEO snapshot id "${id}"`)
}

// ids are 'menu-locations' or `menu/<slug>` (see resource-state.ts's menuProvider).
async function menu(id: string, value: unknown, dir: string): Promise<void> {
  if (id === 'menu-locations') {
    await writeJson(join(dir, 'menu-locations.json'), value)
    return
  }

  const data = value as Record<string, unknown>
  const slug = getMenuSlug(data) ?? id.slice('menu/'.length)
  await writeJson(join(dir, `${slug}.json`), data)
}

// `value` is `{autoload, value}` (resource-state.ts's optionsProvider deliberately drops
// `readonly`: it's a local policy flag with no WordPress counterpart). Restoring it as writable
// by default would silently lift that protection for a rollback that happens to include a
// dangerous option (siteurl, home, ...); defaulting to the same policy `option add` itself uses
// keeps a rolled-back option exactly as protected as a freshly tracked one, never less.
async function option(id: string, value: unknown, dir: string): Promise<void> {
  const {autoload, value: optionValue} = value as {autoload: string; value: unknown}
  const local: LocalOption = {autoload, name: id, readonly: defaultReadonlyFor(id), value: optionValue}
  await writeJson(join(dir, optionFileName(id)), local)
}

// id is the stylesheet slug; value is `{settings, styles}` (canonicalGlobalStyles' shape).
async function themeStyles(id: string, value: unknown, dir: string): Promise<void> {
  await writeJson(join(dir, themeStylesFileName(id)), value)
}

const MATERIALIZERS: Record<string, Materializer> = {
  acf,
  api: phpFile,
  form,
  hook: phpFile,
  menu,
  option,
  seo,
  snippet,
  'theme-styles': themeStyles,
}

// Writes a snapshot's state back to `dir` in the exact on-disk layout `<resource> pull` would
// have produced, so the existing `<resource> push` command can push it unmodified: a rollback
// is push() applied to an archived state instead of the current local files.
export async function materializeSnapshot(resource: string, state: Record<string, unknown>, dir: string): Promise<void> {
  const materialize = MATERIALIZERS[resource]
  if (!materialize) throw new Error(`Rollback is not supported for "${resource}".`)

  await mkdir(dir, {recursive: true})
  for (const [id, value] of Object.entries(state)) await materialize(id, value, dir)
}
