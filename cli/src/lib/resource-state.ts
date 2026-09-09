import {readFile} from 'node:fs/promises'
import {basename, join, relative, sep} from 'node:path'

import {ACF_OBJECT_TYPES, acfEndpoint, getAcfKey} from '../utils/acf-format.js'
import {FORM_ENDPOINT, getFormId} from '../utils/form-format.js'
import {optionEndpoint, parseLocalOption, type RemoteOption} from '../utils/option-format.js'
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
import {isApplicative404, isNotFoundError, type WpClient} from './wp-client.js'

// A resource `lps diff` knows how to compare. `remote` reads and normalizes the live state
// from WordPress; `local` reads and normalizes the same shape from the tracked files. Both
// project to the exact same "canonical" value per item so a deep-equal check reflects real
// drift, not serialization quirks (key order, a re-added `<?php` tag, a rendered-HTML field
// that changes on every read). `dirKind` is how the local base directory is resolved. `dir` is
// passed to every `remote` call (not just `local`'s) so a provider whose remote endpoint has no
// notion of "everything" (options: no bulk value listing, by design) can read the locally
// tracked id set to know what to compare; every other provider's remote endpoint already
// returns its full inventory and ignores this argument.
export type ResourceStateProvider = {
  dirKind: ResourceDirKind
  local(dir: string, onWarn: (message: string) => void): Promise<ResourceState>
  remote(wp: WpClient, onWarn: (message: string) => void, dir: string): Promise<ResourceState>
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

// Removes top-level keys that the server rewrites without the tracked configuration itself
// changing (save timestamps, hit counters), so a `diff` between two independently-configured
// environments reports real differences only. Top-level only: a nested user field that happens
// to share a name is never touched.
function omit(object: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

// ACF's export JSON carries `modified` (a unix timestamp bumped on every save in wp-admin).
const ACF_VOLATILE_KEYS = ['modified'] as const
// A WPForms form is a WP post; `modified`/`modified_gmt` move on every edit.
const FORM_VOLATILE_KEYS = ['modified', 'modified_gmt'] as const
// A RankMath redirect's `hits` is a live visit counter.
const REDIRECT_VOLATILE_KEYS = ['hits'] as const

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

// ---- forms -------------------------------------------------------------------------------

// The form plugin's own JSON (WPForms today) round-trips untouched through pull/push, so
// (minus save timestamps) the whole object is the compared value, same "deliberately loose"
// stance as form-format.ts.
const formProvider: ResourceStateProvider = {
  dirKind: 'form',
  async local(dir, onWarn) {
    const entries = await loadFiles<{file: string; value: Record<string, unknown>}>(dir, {
      extension: '.json',
      onSkip: onWarn,
      parse: (raw, filePath) => ({file: basename(filePath, '.json'), value: readJson(raw)}),
    })
    const state: ResourceState = new Map()
    for (const {file, value} of entries) {
      const formId = getFormId(value)
      state.set(formId === null ? `local:${file}` : String(formId), omit(value, FORM_VOLATILE_KEYS))
    }

    return state
  },
  async remote(wp) {
    const raw = await wp.get<Array<Record<string, unknown>>>(FORM_ENDPOINT)
    const state: ResourceState = new Map()
    for (const form of raw) {
      const formId = getFormId(form)
      if (formId !== null) state.set(String(formId), omit(form, FORM_VOLATILE_KEYS))
    }

    return state
  },
  resource: 'form',
  title: 'Forms',
}

// ---- ACF --------------------------------------------------------------------------------

// ACF's export JSON is large, deeply nested, and versioned by ACF itself; `key` is the stable
// identity and the whole object (minus the `modified` timestamp) round-trips untouched, so it
// is all compared. Ids are namespaced by object type (`field-groups/group_x`) since keys are
// only unique within a type.
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
        if (key !== null) state.set(`${type}/${key}`, omit(object, ACF_VOLATILE_KEYS))
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
        if (key !== null) state.set(`${type}/${key}`, omit(object, ACF_VOLATILE_KEYS))
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

// ---- Hooks ------------------------------------------------------------------------------

// The value is the file's text, compared verbatim (line diff on change), same shape as
// apiProvider above: a hook file is just PHP text, no server-side normalization to undo.
const hookProvider: ResourceStateProvider = {
  dirKind: 'hooks',
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
    const files = await wp.get<Array<{content: string; filename: string}>>('loopress/v1/hook-files')
    const state: ResourceState = new Map()
    for (const file of files) state.set(file.filename, file.content)
    return state
  },
  resource: 'hook',
  title: 'Hooks',
}

// ---- SEO --------------------------------------------------------------------------------

function canonicalRedirect(redirect: Record<string, unknown>): Record<string, unknown> {
  return omit(redirect, REDIRECT_VOLATILE_KEYS)
}

const seoProvider: ResourceStateProvider = {
  dirKind: 'seo',
  async local(dir, onWarn) {
    const state: ResourceState = new Map()

    // The provider settings blob (Yoast / RankMath) is compared whole. If a real payload turns
    // out to carry install-specific noise (a plugin version, a license hash), add those keys
    // to an omit() list here, the e2e round-trip is what will surface them.
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
      const entries = await loadFiles<{file: string; value: Record<string, unknown>}>(metaDir, {
        extension: '.json',
        onSkip: onWarn,
        parse: (raw, filePath) => ({file: basename(filePath, '.json'), value: readJson(raw)}),
      })
      for (const {file, value} of entries) {
        const slug = typeof value.slug === 'string' && value.slug !== '' ? value.slug : `local:${file}`
        state.set(`post-meta/${postType}/${slug}`, value)
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

// ---- Options ------------------------------------------------------------------------------

// Unlike every provider above, remote() has no "everything" endpoint to read: GET /options only
// lists names, never values (by design, see OptionsController), so both sides compare exactly
// the locally tracked set, read from `dir` on the remote side too (see ResourceStateProvider's
// docstring). `readonly` is a local policy flag with no WordPress counterpart, left out of both
// sides so it can never itself show up as drift.
const optionsProvider: ResourceStateProvider = {
  dirKind: 'options',
  async local(dir, onWarn) {
    const entries = await loadFiles<{autoload: string; name: string; value: unknown}>(dir, {
      extension: '.json',
      onSkip: onWarn,
      parse(raw) {
        const option = parseLocalOption(raw)
        return {autoload: option.autoload, name: option.name, value: option.value}
      },
    })

    const state: ResourceState = new Map()
    for (const {autoload, name, value} of entries) state.set(name, {autoload, value})
    return state
  },
  async remote(wp, onWarn, dir) {
    const tracked = await loadFiles<string>(dir, {
      extension: '.json',
      onSkip: onWarn,
      parse: (raw) => parseLocalOption(raw).name,
    })

    const state: ResourceState = new Map()
    for (const name of tracked) {
      try {
        const option = await wp.get<RemoteOption>(optionEndpoint(name))
        state.set(name, {autoload: option.autoload, value: option.value})
      } catch (error) {
        if (!isNotFoundError(error)) throw error
        // Absent on this environment (never pushed here, or deleted there): left out of the
        // map, which reads as "removed" on this side, exactly the right signal.
      }
    }

    return state
  },
  resource: 'option',
  title: 'Options',
}

export const RESOURCE_STATE_PROVIDERS: ResourceStateProvider[] = [
  snippetProvider,
  formProvider,
  acfProvider,
  apiProvider,
  hookProvider,
  seoProvider,
  optionsProvider,
]

export function getResourceStateProvider(resource: string): ResourceStateProvider {
  const provider = RESOURCE_STATE_PROVIDERS.find((candidate) => candidate.resource === resource)
  if (!provider) throw new Error(`No resource-state provider for "${resource}"`)
  return provider
}

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
