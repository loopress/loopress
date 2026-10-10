import {basename} from 'node:path'

export const CPT_ENDPOINT = 'loopress/v1/post-types'
export const REGISTERED_POST_TYPES_ENDPOINT = 'loopress/v1/registered-post-types'

export function cptEndpoint(slug: string): string {
  return `${CPT_ENDPOINT}/${encodeURIComponent(slug)}`
}

// WordPress's own limit (20 chars) and charset for a post type key. Mirrors PostTypeService on
// the plugin side, which stays the authority (it also refuses reserved slugs).
export const CPT_SLUG_PATTERN = /^[a-z0-9_-]{1,20}$/

// One `cpt/<slug>.json` file is the plain `register_post_type()` arguments; the slug is the file
// name, never repeated inside the file.
export type CptArgs = Record<string, unknown>

export type RemoteCpt = {
  args: CptArgs
  // Opaque hash of `args`, only compared for equality (`cpt push`'s conditional write, #234).
  revision: string
  slug: string
}

export type RegisteredPostType = {
  conflict: boolean
  count: number
  label: string
  managed: boolean
  slug: string
  source: 'acf' | 'cptui' | 'loopress' | 'other' | 'wordpress'
}

export function parseCptArgs(raw: string): CptArgs {
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('not a JSON object of register_post_type() arguments')
  }

  return parsed as CptArgs
}

// Arguments WordPress calls or instantiates: refused by the plugin (a cpt/ file is data, never
// code), flagged here first so `lps validate` catches them before a push.
const CODE_ARGS = ['register_meta_box_cb', 'rest_controller_class', 'autosave_rest_controller_class', 'revisions_rest_controller_class']

// Arguments WordPress uses as arrays without checking first (a fatal error on every request
// otherwise), with the other values it accepts. Mirrors PostTypeService::ARRAY_ARGS.
const ARRAY_ARGS: Record<string, unknown[]> = {
  capabilities: [],
  labels: [],
  rewrite: [true, false],
  supports: [false],
  taxonomies: [],
  template: [],
}

// `lps validate`'s check of one cpt/ file: the file name is a valid slug, array arguments are
// arrays, and no argument is code.
export function checkCptFile(raw: string, filePath: string): void {
  const slug = basename(filePath, '.json')
  if (!CPT_SLUG_PATTERN.test(slug)) {
    throw new Error(`"${slug}" is not a valid post type slug: 1 to 20 lowercase letters, digits, "_" or "-"`)
  }

  const args = parseCptArgs(raw)
  for (const [key, alsoAllowed] of Object.entries(ARRAY_ARGS)) {
    const value = args[key]
    if (Object.hasOwn(args, key) && (typeof value !== 'object' || value === null) && !alsoAllowed.includes(value)) {
      const or = alsoAllowed.length > 0 ? ' (or ' + alsoAllowed.join(', ') + ')' : ''
      throw new Error(`"${key}" must be a JSON object or array${or}`)
    }
  }

  const code = CODE_ARGS.find((key) => Object.hasOwn(args, key))
  if (code) throw new Error(`"${code}" runs PHP code, use a hook instead of a cpt/ file for it`)
}
