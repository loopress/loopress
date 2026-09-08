import {readFile} from 'node:fs/promises'
import {basename, extname, join, relative, sep} from 'node:path'

import {ACF_OBJECT_TYPES, acfEndpoint, getAcfKey} from '../utils/acf-format.js'
import {FORM_ENDPOINT, getFormId} from '../utils/form-format.js'
import {getPageContent, PAGE_ENDPOINT, PAGE_LIST_QUERY, pickPageMeta} from '../utils/page-format.js'
import {type ResourceDirKind} from '../utils/resource-dirs.js'
import {
  DEFAULT_POST_TYPES,
  SEO_REDIRECTS_ENDPOINT,
  SEO_SETTINGS_ENDPOINT,
  type SeoPostMeta,
  seoPostMetaEndpoint,
  type SeoRedirect,
} from '../utils/seo-format.js'
import {normalizeSnippet, SNIPPETS_ENDPOINT, stripPhpOpeningTag} from '../utils/snippet-format.js'
import {type ResourceState} from './diff-state.js'
import {loadFiles} from './load-files.js'
import {loadSnippets} from './load-snippets.js'
import {readdirTolerant} from './readdir-tolerant.js'
import {isApplicative404, isNotFoundError, type WpClient} from './wp-client.js'

// A resource `lps diff` knows how to compare. `remote` reads and normalizes the live state
// from WordPress; `local` reads and normalizes the same shape from the tracked files. Both
// project to the exact same "canonical" value per item so a deep-equal check reflects real
// drift, not serialization quirks (key order, a re-added `<?php` tag, a rendered-HTML field
// that changes on every read). `dirKind` is how the local base directory is resolved.
export type ResourceStateProvider = {
  dirKind: ResourceDirKind
  local(dir: string, onWarn: (message: string) => void): Promise<ResourceState>
  remote(wp: WpClient, onWarn: (message: string) => void): Promise<ResourceState>
  resource: string
  title: string
}

function readJson(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('not a JSON object')
  }

  return parsed as Record<string, unknown>
}

// ---- snippets -------------------------------------------------------------------------------

// `description` is dropped: `snippet push` overwrites it with "Imported from <path>" on every
// push and `loadSnippets` never reads it back, so it is not part of the synced state. `id`
// becomes the map key. `code` has its leading `<?php` stripped on both sides: `snippet pull`
// re-adds it to PHP files for editor friendliness, WordPress stores only the body.
function canonicalSnippet(snippet: {
  active: boolean
  code: string
  insertMethod: string
  location: string
  name: string
  priority: number
  shortcodeAttributes: string[]
  tags: string[]
  type: string
}): Record<string, unknown> {
  return {
    active: snippet.active,
    code: stripPhpOpeningTag(snippet.code),
    insertMethod: snippet.insertMethod,
    location: snippet.location,
    name: snippet.name,
    priority: snippet.priority,
    shortcodeAttributes: [...snippet.shortcodeAttributes],
    tags: [...snippet.tags],
    type: snippet.type,
  }
}

const snippetProvider: ResourceStateProvider = {
  dirKind: 'snippets',
  async local(dir) {
    const state: ResourceState = new Map()

    let snippets
    try {
      snippets = await loadSnippets(dir)
    } catch (error) {
      // A directory that was never created is "nothing tracked locally", the same tolerance
      // loadFiles/readdirTolerant already have; loadSnippets wraps the ENOENT in its own Error.
      if ((error as {cause?: NodeJS.ErrnoException}).cause?.code === 'ENOENT') return state
      throw error
    }

    for (const snippet of snippets) {
      const id = snippet.id === undefined ? `local:${basename(snippet.path)}` : String(snippet.id)
      state.set(id, canonicalSnippet(snippet))
    }

    return state
  },
  async remote(wp) {
    const raw = await wp.get<Array<Record<string, unknown>>>(SNIPPETS_ENDPOINT)
    const state: ResourceState = new Map()
    for (const item of raw) {
      const snippet = normalizeSnippet(item)
      state.set(String(snippet.id), canonicalSnippet(snippet))
    }

    return state
  },
  resource: 'snippet',
  title: 'Snippets',
}

// ---- pages --------------------------------------------------------------------------------

// `title` and `excerpt` come back from `?context=edit` as `{raw, rendered, protected}`;
// `rendered` is derived and can change without the source changing, so only `raw` is compared
// (which is also all `page push` meaningfully round-trips).
function rawOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const {raw} = value as Record<string, unknown>
    if (typeof raw === 'string') return raw
  }

  return ''
}

function canonicalPage(meta: Record<string, unknown>, content: string): Record<string, unknown> {
  const canonical: Record<string, unknown> = {...meta, content}
  if ('title' in canonical) canonical.title = rawOf(canonical.title)
  if ('excerpt' in canonical) canonical.excerpt = rawOf(canonical.excerpt)
  return canonical
}

const pageProvider: ResourceStateProvider = {
  dirKind: 'page',
  async local(dir, onWarn) {
    const files = await readdirTolerant(dir)
    const state: ResourceState = new Map()
    for (const file of files) {
      if (extname(file) !== '.html') continue

      const base = basename(file, '.html')
      const metaPath = join(dir, `${base}.json`)
      let meta: Record<string, unknown> = {}
      try {
        meta = readJson(await readFile(metaPath, 'utf8'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          onWarn(`Skipping "${metaPath}": ${(error as Error).message}`)
          continue
        }
      }

      const content = await readFile(join(dir, file), 'utf8')
      const rawId = Number(meta.id)
      const id = Number.isSafeInteger(rawId) && rawId > 0 ? String(rawId) : `local:${base}`
      state.set(id, canonicalPage(meta, content))
    }

    return state
  },
  async remote(wp) {
    const raw = await wp.get<Array<Record<string, unknown>>>(`${PAGE_ENDPOINT}?${PAGE_LIST_QUERY}&context=edit`)
    const state: ResourceState = new Map()
    for (const page of raw) {
      const rawId = Number(page.id)
      if (!Number.isSafeInteger(rawId) || rawId <= 0) continue
      state.set(String(rawId), canonicalPage(pickPageMeta(page), getPageContent(page)))
    }

    return state
  },
  resource: 'page',
  title: 'Pages',
}

// ---- forms -------------------------------------------------------------------------------

// The form plugin's own JSON (WPForms today) round-trips untouched through pull/push, so the
// whole object is the compared value, same "deliberately loose" stance as form-format.ts.
const formProvider: ResourceStateProvider = {
  dirKind: 'form',
  async local(dir, onWarn) {
    const objects = await loadFiles<Record<string, unknown>>(dir, {extension: '.json', onSkip: onWarn, parse: readJson})
    const state: ResourceState = new Map()
    let unidentified = 0
    for (const object of objects) {
      const formId = getFormId(object)
      state.set(formId === null ? `local:unidentified-${unidentified++}` : String(formId), object)
    }

    return state
  },
  async remote(wp) {
    const raw = await wp.get<Array<Record<string, unknown>>>(FORM_ENDPOINT)
    const state: ResourceState = new Map()
    for (const form of raw) {
      const formId = getFormId(form)
      if (formId !== null) state.set(String(formId), form)
    }

    return state
  },
  resource: 'form',
  title: 'Forms',
}

// ---- ACF --------------------------------------------------------------------------------

// ACF's export JSON is large, deeply nested, and versioned by ACF itself; `key` is the stable
// identity and the whole object round-trips untouched, so it is all compared. Ids are
// namespaced by object type (`field-groups/group_x`) since keys are only unique within a type.
const acfProvider: ResourceStateProvider = {
  dirKind: 'acf',
  async local(dir, onWarn) {
    const state: ResourceState = new Map()
    for (const type of ACF_OBJECT_TYPES) {
      const objects = await loadFiles<Record<string, unknown>>(join(dir, type), {
        extension: '.json',
        onSkip: onWarn,
        parse: readJson,
      })
      for (const object of objects) {
        const key = getAcfKey(object)
        if (key !== null) state.set(`${type}/${key}`, object)
      }
    }

    return state
  },
  async remote(wp) {
    const state: ResourceState = new Map()
    for (const type of ACF_OBJECT_TYPES) {
      const raw = await wp.get<Array<Record<string, unknown>>>(acfEndpoint(type))
      for (const object of raw) {
        const key = getAcfKey(object)
        if (key !== null) state.set(`${type}/${key}`, object)
      }
    }

    return state
  },
  resource: 'acf',
  title: 'ACF',
}

// ---- API routes ------------------------------------------------------------------------

// The value is the file's text, compared verbatim (line diff on change).
const apiProvider: ResourceStateProvider = {
  dirKind: 'api',
  async local(dir, onWarn) {
    const files = await loadFiles<{content: string; filename: string}>(dir, {
      extension: '.php',
      onSkip: onWarn,
      parse: (raw, filePath) => ({
        content: raw,
        filename: relative(dir, filePath).slice(0, -'.php'.length).split(sep).join('/'),
      }),
      recursive: true,
    })
    const state: ResourceState = new Map()
    for (const file of files) state.set(file.filename, file.content)
    return state
  },
  async remote(wp) {
    const files = await wp.get<Array<{content: string; filename: string}>>('loopress/v1/api-files')
    const state: ResourceState = new Map()
    for (const file of files) state.set(file.filename, file.content)
    return state
  },
  resource: 'api',
  title: 'API routes',
}

// ---- SEO --------------------------------------------------------------------------------

// `hits` is a live counter, not configuration: it drifts on every visit and `seo pull` snapshots
// whatever it was at pull time, so comparing it would always report drift. Dropped from both sides.
function canonicalRedirect(redirect: Record<string, unknown>): Record<string, unknown> {
  const rest = {...redirect}
  delete rest.hits
  return rest
}

const seoProvider: ResourceStateProvider = {
  dirKind: 'seo',
  async local(dir, onWarn) {
    const state: ResourceState = new Map()

    const settingsPath = join(dir, 'settings.json')
    try {
      const settings = readJson(await readFile(settingsPath, 'utf8'))
      state.set('settings', settings)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        onWarn(`Skipping "${settingsPath}": ${(error as Error).message}`)
      }
    }

    for (const postType of DEFAULT_POST_TYPES) {
      const metaDir = join(dir, 'post-meta', postType)
      const objects = await loadFiles<Record<string, unknown>>(metaDir, {extension: '.json', onSkip: onWarn, parse: readJson})
      let unidentified = 0
      for (const object of objects) {
        const slug = typeof object.slug === 'string' && object.slug !== '' ? object.slug : `local:unidentified-${unidentified++}`
        state.set(`post-meta/${postType}/${slug}`, object)
      }
    }

    const redirects = await loadFiles<Record<string, unknown>>(join(dir, 'redirects'), {
      extension: '.json',
      onSkip: onWarn,
      parse: readJson,
    })
    for (const redirect of redirects) {
      const id = Number(redirect.id)
      if (Number.isSafeInteger(id) && id > 0) state.set(`redirects/${id}`, canonicalRedirect(redirect))
    }

    return state
  },
  async remote(wp, onWarn) {
    const state: ResourceState = new Map()

    const settings = await wp.get<Record<string, unknown>>(SEO_SETTINGS_ENDPOINT)
    state.set('settings', settings)

    for (const postType of DEFAULT_POST_TYPES) {
      const posts = await wp.get<SeoPostMeta[]>(seoPostMetaEndpoint(postType))
      for (const post of posts) state.set(`post-meta/${postType}/${post.slug}`, post)
    }

    // Redirects are a RankMath-only feature; on Yoast the endpoint 404s, same graceful skip
    // as `seo pull`.
    try {
      const redirects = await wp.get<SeoRedirect[]>(SEO_REDIRECTS_ENDPOINT)
      for (const redirect of redirects) {
        state.set(`redirects/${redirect.id}`, canonicalRedirect(redirect))
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error
      onWarn(`Skipping redirects: not supported by the active SEO plugin`)
    }

    return state
  },
  resource: 'seo',
  title: 'SEO',
}

export const RESOURCE_STATE_PROVIDERS: ResourceStateProvider[] = [
  snippetProvider,
  pageProvider,
  formProvider,
  acfProvider,
  apiProvider,
  seoProvider,
]

// ---- Composer ---------------------------------------------------------------------------

// Composer isn't a directory of items but two files at the project root, so it sits outside
// RESOURCE_STATE_PROVIDERS. The compared value is each file's text.
const COMPOSER_JSON_ENDPOINT = 'loopress/v1/composer/json'
const COMPOSER_LOCK_ENDPOINT = 'loopress/v1/composer/lock'

export async function composerRemoteState(wp: WpClient): Promise<ResourceState> {
  const state: ResourceState = new Map()

  const {composerJson} = await wp.get<{composerJson: string}>(COMPOSER_JSON_ENDPOINT)
  state.set('composer.json', composerJson)

  try {
    const {composerLock} = await wp.get<{composerLock: string}>(COMPOSER_LOCK_ENDPOINT)
    state.set('composer.lock', composerLock)
  } catch (error) {
    // A site that never pushed Composer dependencies has no lock yet, the same tolerated 404
    // as `composer pull`.
    if (!isApplicative404(error, 'composer.lock not found')) throw error
  }

  return state
}

export async function composerLocalState(rootDir: string): Promise<ResourceState> {
  const state: ResourceState = new Map()
  for (const file of ['composer.json', 'composer.lock']) {
    try {
      state.set(file, await readFile(join(rootDir, file), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  return state
}
