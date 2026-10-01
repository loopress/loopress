import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import writeFileAtomic from 'write-file-atomic'

import {type SyncIntent} from './plugin-sync.js'
import {type MergeResult} from './plugins.js'
import {isExactVersion} from './version.js'

export type ComposerJson = {
  config?: {
    'allow-plugins'?: Record<string, boolean>
  }
  extra?: {
    'installer-paths'?: Record<string, string[]>
  }
  name?: string
  repositories?: Array<{type: string; url: string}>
  require?: Record<string, string>
  'require-dev'?: Record<string, string>
}

export async function readComposerJson(): Promise<ComposerJson | null> {
  const path = join(process.cwd(), 'composer.json')
  if (!existsSync(path)) return null
  try {
    const content = await readFile(path, 'utf8')
    return JSON.parse(content) as ComposerJson
  } catch {
    return null
  }
}

export async function readComposerLock(): Promise<null | string> {
  const path = join(process.cwd(), 'composer.lock')
  if (!existsSync(path)) return null
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

// Returns WordPress plugin slugs declared as wpackagist-plugin/* in composer.json
export function getComposerManagedSlugs(composerJson: ComposerJson): string[] {
  const packages = {...composerJson.require, ...composerJson['require-dev']}
  return Object.keys(packages)
    .filter((pkg) => pkg.startsWith('wpackagist-plugin/'))
    .map((pkg) => pkg.slice('wpackagist-plugin/'.length))
}

export type ComposerPullResult = MergeResult<string> & {
  // Installed on the site but left out of composer.json, with the reason.
  skipped: Array<{reason: string; slug: string}>
}

// A slug WPackagist can't serve makes `composer update` fail for the whole file, libraries
// included. WPackagist mirrors WordPress.org, whose API answers a clean 404 for premium and
// custom plugins/themes. Any other failure throws before composer.json is written.
async function isOnWordPressOrg(kind: 'plugin' | 'theme', slug: string): Promise<boolean> {
  const url = `https://api.wordpress.org/${kind}s/info/1.2/?action=${kind}_information&slug=${encodeURIComponent(slug)}`
  const fail = (why: string) =>
    new Error(
      `Could not check whether the ${kind} "${slug}" is on WordPress.org (${why}), so composer.json was not modified. ` +
        'Loopress only adds packages WPackagist can serve. Retry once api.wordpress.org is reachable.',
    )

  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw fail(`network error: ${(error as Error).message}`)
  }

  if (response.status === 404) return false
  if (!response.ok) throw fail(`HTTP ${response.status}`)
  return true
}

// Rewrites a JSON file the way it was indented (Composer itself writes 4 spaces), so a pull only
// shows the entries it changed in the git diff. A file with no indentation to copy gets 4 spaces.
function stringifyLike(original: string, value: unknown): string {
  const indent = /^([ \t]+)"/m.exec(original)?.[1] ?? ' '.repeat(4)
  return JSON.stringify(value, null, indent) + (original.endsWith('\n') ? '\n' : '')
}

// A package already declared in composer.json: `pin` means the pull may move it (an exact pin,
// or already live), `skip` gives the reason it must stay as is.
function classifyDeclared(declared: string, live: string, inRequire: boolean): {pin: string} | {skip: string} {
  if (!inRequire) return {skip: 'declared in require-dev'}
  if (declared === live || isExactVersion(declared)) return {pin: declared}
  return {skip: `keeps constraint ${declared}, live ${live}`}
}

// Sorts every installed package into the result, and returns the undeclared slugs that still
// need a WordPress.org lookup before they can be added.
function planComposerPull(composerJson: ComposerJson, prefix: string, incoming: Record<string, string>) {
  const require = composerJson.require ?? {}
  const allPackages = {...require, ...composerJson['require-dev']}
  const providedBy = new Map(
    Object.keys(allPackages)
      .filter((name) => !name.startsWith(prefix) && name.includes('/'))
      .map((name) => [name.split('/', 2)[1], name]),
  )

  const result: ComposerPullResult = {added: [], merged: {}, skipped: [], updated: []}
  const candidates: string[] = []
  for (const [slug, version] of Object.entries(incoming)) {
    const name = prefix + slug
    const provider = providedBy.get(slug)
    if (Object.hasOwn(allPackages, name)) {
      const outcome = classifyDeclared(allPackages[name], version, Object.hasOwn(require, name))
      if ('skip' in outcome) {
        result.skipped.push({reason: outcome.skip, slug})
        continue
      }

      result.merged[slug] = version
      if (outcome.pin !== version) result.updated.push({from: outcome.pin, slug, to: version})
    } else if (provider) {
      result.skipped.push({reason: `provided by ${provider}`, slug})
    } else {
      candidates.push(slug)
    }
  }

  return {candidates, result}
}

// `lps plugin pull` / `lps theme version pull` on a project that has a composer.json: pin installed
// packages to their live versions as `wpackagist-<kind>/<slug>` under `require`, leaving every
// other key untouched. The server adds the WPackagist repository and composer/installers on push.
// - A declared version constraint (^9.4, *, ...) is the user's intent: never overwritten, only an
//   exact pin moves to the live version.
// - Slugs already declared in require-dev stay there instead of being duplicated into require.
// - A slug provided by another package (acme/<slug>) or absent from WordPress.org is skipped.
export async function pullIntoComposerJson(
  path: string,
  kind: 'plugin' | 'theme',
  incoming: Record<string, string>,
  {dryRun, log}: {dryRun: boolean; log: (message: string) => void},
): Promise<ComposerPullResult> {
  const raw = await readFile(path, 'utf8')
  const composerJson = JSON.parse(raw) as ComposerJson
  const prefix = `wpackagist-${kind}/`
  const {candidates, result} = planComposerPull(composerJson, prefix, incoming)

  const found = await Promise.all(candidates.map(async (slug) => isOnWordPressOrg(kind, slug)))
  for (const [i, slug] of candidates.entries()) {
    if (found[i]) {
      result.added.push(slug)
      result.merged[slug] = incoming[slug]
    } else {
      result.skipped.push({reason: 'not on WordPress.org', slug})
    }
  }

  if (!dryRun) {
    const require = {...composerJson.require}
    for (const [slug, version] of Object.entries(result.merged)) require[prefix + slug] = version
    // Atomic: an interrupted write must never leave the user's committed composer.json truncated.
    await writeFileAtomic(path, stringifyLike(raw, {...composerJson, require}), 'utf8')
  }

  log(`${dryRun ? '[dry-run] Would pin' : 'Pinned'} ${Object.keys(result.merged).length} ${kind}s in composer.json`)
  if (result.added.length > 0) log(`  + Added: ${result.added.join(', ')}`)
  for (const u of result.updated) log(`  ~ Updated: ${u.slug} ${u.from} → ${u.to}`)
  for (const s of result.skipped) log(`  - Skipped: ${s.slug} (${s.reason})`)
  if (!dryRun && (result.added.length > 0 || result.updated.length > 0)) log('Run `lps composer push` to apply.')

  return result
}

// Split a composer.json `require` map into the three intent namespaces the sync endpoint
// understands. `composer/installers` is owned by the server scaffold, never sent.
export function toIntent(require: Record<string, string>): SyncIntent {
  const intent: SyncIntent = {libraries: {}, plugins: {}, themes: {}}

  for (const [name, constraint] of Object.entries(require)) {
    if (name === 'composer/installers') continue
    if (name.startsWith('wpackagist-plugin/')) {
      intent.plugins![name.slice('wpackagist-plugin/'.length)] = constraint
    } else if (name.startsWith('wpackagist-theme/')) {
      intent.themes![name.slice('wpackagist-theme/'.length)] = constraint
    } else {
      intent.libraries![name] = constraint
    }
  }

  return intent
}

// The `wpackagist-<kind>/<slug>` entries of a composer.json `require`, keyed by slug, with the
// version or constraint as written.
export function wpackagistRequire(composerJson: ComposerJson, kind: 'plugin' | 'theme'): Record<string, string> {
  const prefix = `wpackagist-${kind}/`
  return Object.fromEntries(
    Object.entries(composerJson.require ?? {})
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, version]) => [name.slice(prefix.length), version]),
  )
}
