import {basename} from 'node:path'
import {z} from 'zod'

import {parseHtmlHeader, titleFromSlug} from './page-format.js'
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
  cliName: 'cpt' | 'meta' | 'pattern' | 'role' | 'taxonomy'
  // Arguments WordPress calls or instantiates: a file is data, never code.
  codeArgs: string[]
  // The default directory name (loopress.json can override it), for messages.
  dir: string
  dirKind: ResourceDirKind
  endpoint: string
  // How a file maps to the arguments when it isn't the JSON arguments themselves (patterns: HTML
  // with a header). `parse` throws with the problem.
  file?: {
    extension: string
    format(args: DeclaredArgs): string
    parse(slug: string, raw: string): DeclaredArgs
  }
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

const JSON_OBJECT = z.record(z.string(), z.unknown())
const isObject = (value: unknown): value is Record<string, unknown> => JSON_OBJECT.safeParse(value).success

// register_post_meta()'s `type` values, each with the schema its `default` must pass.
const META_TYPES: Record<string, z.ZodType> = {
  array: z.array(z.unknown()),
  boolean: z.boolean(),
  integer: z.int(),
  number: z.number(),
  object: JSON_OBJECT,
  string: z.string(),
}

function checkMetaRest(key: string, type: string, rest: unknown): void {
  if (typeof rest !== 'boolean' && !isObject(rest)) throw new Error(`"${key}": "show_in_rest" must be true, false or an object`)

  // WordPress calls it with each value on every REST read (WP_REST_Meta_Fields).
  if (isObject(rest) && Object.hasOwn(rest, 'prepare_callback')) {
    throw new Error(`"${key}": "show_in_rest.prepare_callback" runs PHP code, use a hook instead of a file for it`)
  }

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
  checkMetaRest(key, type, Object.hasOwn(meta, 'show_in_rest') ? meta.show_in_rest : false)
  if (Object.hasOwn(meta, 'default') && !META_TYPES[type].safeParse(meta.default).success) throw new Error(`"${key}": "default" must be a ${type}`)
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

// Same checks as the plugin's RoleService::assertArgs().
function checkRoleArgs(args: DeclaredArgs): void {
  if (typeof args.name !== 'string' || args.name.trim() === '') throw new Error('"name" must be a non-empty string')

  const capabilities = args.capabilities ?? {}
  if (!z.record(z.string(), z.boolean()).safeParse(capabilities).success) {
    throw new Error('"capabilities" must map each capability name to true or false')
  }
}

// `{"name": ..., "capabilities": {cap: bool}}`, added in memory on every request, never written
// to the roles option. Built-in roles are refused by the plugin.
export const ROLE_SPEC: DeclaredTypeSpec = {
  arrayArgs: {capabilities: []},
  checkArgs: checkRoleArgs,
  cliName: 'role',
  codeArgs: [],
  dir: 'roles',
  dirKind: 'role',
  endpoint: 'loopress/v1/roles',
  noun: 'role',
  plural: 'roles',
  registeredEndpoint: 'loopress/v1/registered-roles',
  registerFunction: 'add_role()',
  slugMaxLength: 50,
  termArgs: [],
}

// Header key => register_block_pattern() property, and how its text is read.
const PATTERN_HEADER = {
  'block-types': {key: 'blockTypes', type: 'list'},
  categories: {key: 'categories', type: 'list'},
  description: {key: 'description', type: 'text'},
  inserter: {key: 'inserter', type: 'boolean'},
  keywords: {key: 'keywords', type: 'list'},
  'post-types': {key: 'postTypes', type: 'list'},
  'template-types': {key: 'templateTypes', type: 'list'},
  title: {key: 'title', type: 'text'},
  'viewport-width': {key: 'viewportWidth', type: 'integer'},
} as const

function readPatternValue(header: string, type: string, value: string): unknown {
  if (type === 'list') return value.split(',').map((item) => item.trim()).filter(Boolean)
  if (type === 'boolean') {
    if (value !== 'true' && value !== 'false') throw new Error(`"${header}" must be "true" or "false", got "${value}"`)
    return value === 'true'
  }

  if (type === 'integer') {
    if (!/^\d+$/.test(value)) throw new Error(`"${header}" must be a whole number, got "${value}"`)
    return Number(value)
  }

  return value
}

// A pattern file is its block markup, opened by the same `key: value` comment header as a page.
export function parsePatternFile(slug: string, raw: string): DeclaredArgs {
  const {body, meta} = parseHtmlHeader(raw, Object.keys(PATTERN_HEADER))
  const args: DeclaredArgs = {title: titleFromSlug(slug)}
  for (const [header, value] of Object.entries(meta)) {
    const {key, type} = PATTERN_HEADER[header as keyof typeof PATTERN_HEADER]
    args[key] = readPatternValue(header, type, value)
  }

  args.content = body
  return args
}

export function formatPatternFile(args: DeclaredArgs): string {
  const lines = Object.entries(PATTERN_HEADER)
    .filter(([, {key}]) => args[key] !== undefined)
    .map(([header, {key}]) => `${header}: ${Array.isArray(args[key]) ? args[key].join(', ') : String(args[key])}`)

  return `<!--\n${lines.join('\n')}\n-->\n${typeof args.content === 'string' ? args.content : ''}`
}

function checkPatternArgs(args: DeclaredArgs): void {
  if (typeof args.title !== 'string' || args.title.trim() === '') throw new Error('"title" must be a non-empty string')
}

// Registered as `loopress/<slug>`, referenced with `<!-- wp:pattern {"slug":"loopress/<slug>"} /-->`.
export const PATTERN_SPEC: DeclaredTypeSpec = {
  arrayArgs: {blockTypes: [], categories: [], keywords: [], postTypes: [], templateTypes: []},
  checkArgs: checkPatternArgs,
  cliName: 'pattern',
  codeArgs: ['filePath'],
  dir: 'patterns',
  dirKind: 'pattern',
  endpoint: 'loopress/v1/patterns',
  file: {extension: '.html', format: formatPatternFile, parse: parsePatternFile},
  noun: 'pattern',
  plural: 'patterns',
  registeredEndpoint: 'loopress/v1/registered-patterns',
  registerFunction: 'register_block_pattern()',
  slugMaxLength: 100,
  termArgs: [],
}

export function fileExtension(spec: DeclaredTypeSpec): string {
  return spec.file?.extension ?? '.json'
}

export function parseDeclaredFile(spec: DeclaredTypeSpec, filePath: string, raw: string): {args: DeclaredArgs; slug: string} {
  const slug = basename(filePath, fileExtension(spec))
  return {args: spec.file ? spec.file.parse(slug, raw) : parseDeclaredArgs(raw), slug}
}

export function formatDeclaredFile(spec: DeclaredTypeSpec, args: DeclaredArgs): string {
  return spec.file ? spec.file.format(args) : JSON.stringify(args, null, 2) + '\n'
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
  // Published posts for a post type, terms for a taxonomy, users for a role, 0 for a pattern.
  count: number
  label: string
  managed: boolean
  // Taxonomies only: the post types it attaches to.
  objectTypes?: string[]
  slug: string
  source: 'acf' | 'cptui' | 'loopress' | 'other' | 'wordpress'
}

export function parseDeclaredArgs(raw: string): DeclaredArgs {
  const result = JSON_OBJECT.safeParse(JSON.parse(raw))
  if (!result.success) throw new Error('not a JSON object of arguments')

  return result.data
}

// `lps validate`'s check of one file: the file name is a valid slug, array arguments are arrays,
// and no argument is code.
export function declaredFileChecker(spec: DeclaredTypeSpec): (raw: string, filePath: string) => void {
  const slugPattern = new RegExp(`^[a-z0-9_-]{1,${spec.slugMaxLength}}$`)

  return (raw, filePath) => {
    const slug = basename(filePath, fileExtension(spec))
    if (!slugPattern.test(slug)) {
      throw new Error(`"${slug}" is not a valid ${spec.noun} slug: 1 to ${spec.slugMaxLength} lowercase letters, digits, "_" or "-"`)
    }

    const {args} = parseDeclaredFile(spec, filePath, raw)
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
