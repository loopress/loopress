import {basename} from 'node:path'

import {type ResourceDirKind} from './resource-dirs.js'

// A WordPress object type declared as one JSON file per item: post types (`lps cpt`, cpt/) and
// taxonomies (`lps taxonomy`, taxonomies/). The file is the plain arguments of its `register_*()`
// call, named after the slug, never repeated inside. Mirrors the plugin's
// AbstractDeclaredTypeService and its two subclasses, which stay the authority (they also refuse
// reserved slugs).
export type DeclaredTypeSpec = {
  // Arguments WordPress uses as arrays without checking first (a fatal error on every request
  // otherwise), with the other values each accepts.
  arrayArgs: Record<string, unknown[]>
  // `lps <cliName>`, also the resource-state provider and snapshot name.
  cliName: 'cpt' | 'taxonomy'
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

    const code = spec.codeArgs.find((key) => Object.hasOwn(args, key))
    if (code) throw new Error(`"${code}" runs PHP code, use a hook instead of a file for it`)
  }
}
