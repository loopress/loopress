import {basename} from 'node:path'

import {type ResourceDirKind} from './resource-dirs.js'

// A WordPress object type declared as one JSON file per item: post types (`lps cpt`, cpt/),
// taxonomies (`lps taxonomy`, taxonomies/) and post meta keys (`lps meta`, meta/). The file is the
// plain arguments of its `register_*()` call, named after the slug, never repeated inside. Mirrors
// the plugin's AbstractDeclaredTypeService and its subclasses, which stay the authority (they also
// refuse reserved slugs).
export type DeclaredTypeSpec = {
  // Arguments WordPress uses as arrays without checking first (a fatal error on every request
  // otherwise), with the other values each accepts.
  arrayArgs: Record<string, unknown[]>
  // Checks specific to one kind, after the shared ones: throws with the problem.
  checkArgs?: (args: DeclaredArgs) => void
  // `lps <cliName>`, also the resource-state provider and snapshot name.
  cliName: 'cpt' | 'meta' | 'taxonomy'
  // Arguments WordPress calls or instantiates: a file is data, never code.
  codeArgs: string[]
  // The default directory name (loopress.json can override it), for messages.
  dir: string
  dirKind: ResourceDirKind
  endpoint: string
  // What the item is for the user, singular and lowercase ("post type").
  noun: string
  plural: string
  registeredEndpoint: string
  // What `register_*()` the file feeds, for messages.
  registerFunction: string
  slugMaxLength: number
  // Arguments that make WordPress create terms (content), which Loopress doesn't sync.
  termArgs: string[]
}

export const CPT_SPEC: DeclaredTypeSpec = {
  arrayArgs: {capabilities: [], labels: [], rewrite: [true, false], supports: [false], taxonomies: [], template: []},
  cliName: 'cpt',
  codeArgs: ['register_meta_box_cb', 'rest_controller_class', 'autosave_rest_controller_class', 'revisions_rest_controller_class'],
  dir: 'cpt',
  dirKind: 'cpt',
  endpoint: 'loopress/v1/post-types',
  noun: 'post type',
  plural: 'post types',
  registeredEndpoint: 'loopress/v1/registered-post-types',
  registerFunction: 'register_post_type()',
  slugMaxLength: 20,
  termArgs: [],
}

// `object_type` is the one key that isn't a register_taxonomy() argument: its second parameter,
// the post types the taxonomy attaches to. Kept in the same file, split off by the plugin.
export const TAXONOMY_SPEC: DeclaredTypeSpec = {
  arrayArgs: {capabilities: [], labels: [], object_type: [], rewrite: [true, false]},
  cliName: 'taxonomy',
  codeArgs: ['meta_box_cb', 'meta_box_sanitize_cb', 'update_count_callback', 'rest_controller_class'],
  dir: 'taxonomies',
  dirKind: 'taxonomy',
  endpoint: 'loopress/v1/taxonomies',
  noun: 'taxonomy',
  plural: 'taxonomies',
  registeredEndpoint: 'loopress/v1/registered-taxonomies',
  registerFunction: 'register_taxonomy()',
  slugMaxLength: 32,
  // register_taxonomy() creates the default term when it doesn't exist yet.
  termArgs: ['default_term'],
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// register_post_meta()'s `type` values, each with the check its `default` must pass.
const META_TYPES: Record<string, (value: unknown) => boolean> = {
  array: Array.isArray,
  boolean: (value) => typeof value === 'boolean',
  integer: Number.isSafeInteger,
  number: (value) => typeof value === 'number',
  object: isObject,
  string: (value) => typeof value === 'string',
}

function checkMetaRest(key: string, type: string, rest: unknown): void {
  if (typeof rest !== 'boolean' && !isObject(rest)) throw new Error(`"${key}": "show_in_rest" must be true, false or an object`)

  // WordPress silently leaves an array or object key out of REST without a schema.
  if (rest !== false && (type === 'array' || type === 'object') && !(isObject(rest) && isObject(rest.schema))) {
    throw new Error(`"${key}": a ${type} exposed in REST needs "show_in_rest": { "schema": {...} }`)
  }
}

function checkMetaKey(key: string, meta: unknown): void {
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(key)) throw new Error(`"${key}" is not a valid meta key: 1 to 255 letters, digits, "_" or "-"`)
  if (!isObject(meta)) throw new Error(`"${key}" must be a JSON object of register_post_meta() arguments`)

  const code = ['sanitize_callback', 'auth_callback'].find((name) => Object.hasOwn(meta, name))
  if (code) throw new Error(`"${key}": "${code}" runs PHP code, use a hook instead of a file for it`)

  const {type} = meta
  if (typeof type !== 'string' || !Object.hasOwn(META_TYPES, type)) {
    throw new Error(`"${key}": "type" must be one of ${Object.keys(META_TYPES).join(', ')}`)
  }

  if (Object.hasOwn(meta, 'single') && typeof meta.single !== 'boolean') throw new Error(`"${key}": "single" must be true or false`)
  checkMetaRest(key, type, meta.show_in_rest ?? false)
  if (Object.hasOwn(meta, 'default') && !META_TYPES[type](meta.default)) throw new Error(`"${key}": "default" must be a ${type}`)
}

// Same checks as the plugin's PostMetaService::assertArgs(): the file is `key => register_post_meta()
// arguments`, so the code and type checks are one level deeper than for post types.
function checkMetaArgs(args: DeclaredArgs): void {
  for (const [key, meta] of Object.entries(args)) checkMetaKey(key, meta)
}

// The file name is the post type (`post` and `page` included), the keys are meta keys. Only the
// keys are declared, never their values.
export const META_SPEC: DeclaredTypeSpec = {
  arrayArgs: {},
  checkArgs: checkMetaArgs,
  cliName: 'meta',
  codeArgs: [],
  dir: 'meta',
  dirKind: 'meta',
  endpoint: 'loopress/v1/post-meta',
  noun: 'post meta',
  plural: 'post meta',
  registeredEndpoint: 'loopress/v1/registered-post-meta',
  registerFunction: 'register_post_meta()',
  slugMaxLength: 20,
  termArgs: [],
}

export function itemEndpoint(spec: DeclaredTypeSpec, slug: string): string {
  return `${spec.endpoint}/${encodeURIComponent(slug)}`
}

export type DeclaredArgs = Record<string, unknown>

export type RemoteDeclaredType = {
  args: DeclaredArgs
  // Opaque hash of `args`, only compared for equality (push's conditional write, #234).
  revision: string
  slug: string
}

export type RegisteredItem = {
  conflict: boolean
  // Published posts for a post type, terms for a taxonomy.
  count: number
  label: string
  managed: boolean
  // Taxonomies only: the post types it attaches to.
  objectTypes?: string[]
  slug: string
  source: 'acf' | 'cptui' | 'loopress' | 'other' | 'wordpress'
}

export function parseDeclaredArgs(raw: string): DeclaredArgs {
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('not a JSON object of arguments')
  }

  return parsed as DeclaredArgs
}

// `lps validate`'s check of one file: the file name is a valid slug, array arguments are arrays,
// and no argument is code.
export function declaredFileChecker(spec: DeclaredTypeSpec): (raw: string, filePath: string) => void {
  const slugPattern = new RegExp(`^[a-z0-9_-]{1,${spec.slugMaxLength}}$`)

  return (raw, filePath) => {
    const slug = basename(filePath, '.json')
    if (!slugPattern.test(slug)) {
      throw new Error(`"${slug}" is not a valid ${spec.noun} slug: 1 to ${spec.slugMaxLength} lowercase letters, digits, "_" or "-"`)
    }

    const args = parseDeclaredArgs(raw)
    for (const [key, alsoAllowed] of Object.entries(spec.arrayArgs)) {
      const value = args[key]
      if (Object.hasOwn(args, key) && (typeof value !== 'object' || value === null) && !alsoAllowed.includes(value)) {
        const or = alsoAllowed.length > 0 ? ' (or ' + alsoAllowed.join(', ') + ')' : ''
        throw new Error(`"${key}" must be a JSON object or array${or}`)
      }
    }

    const term = spec.termArgs.find((key) => Object.hasOwn(args, key))
    if (term) throw new Error(`"${term}" creates a term, and Loopress doesn't sync terms: remove it and create the term in wp-admin`)

    const code = spec.codeArgs.find((key) => Object.hasOwn(args, key))
    if (code) throw new Error(`"${code}" runs PHP code, use a hook instead of a file for it`)

    spec.checkArgs?.(args)
  }
}
