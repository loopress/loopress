import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {isExcluded, withoutExcluded} from '../lib/exclude.js'
import {errorCode, isRecord} from '../lib/narrow.js'

// A dynamic block: blocks/<slug>/ in WordPress's own block format, registered on the site as
// loopress/<slug> (the plugin's BlocksDirectory and BlockFilesController).
export const BLOCKS_ENDPOINT = 'loopress/v1/block-files'

// The only files a block folder may hold, mirrors BlocksDirectory::FILES.
export const BLOCK_FILES = ['block.json', 'render.php', 'style.css', 'view.js'] as const

// WordPress's block name segment rule, capped like the plugin's slug pattern.
export const BLOCK_SLUG = /^[a-z][a-z0-9-]{0,63}$/

export type BlockFiles = Record<string, string>
export type LocalBlock = {files: BlockFiles; slug: string}
export type BlockProblem = {file: string; message: string}

// Every `file:./x` path a block.json field points at (style, viewScriptModule, ...), top level
// only, as a string or an array of strings, like WordPress reads them.
function referencedFiles(metadata: Record<string, unknown>): string[] {
  return Object.values(metadata)
    .flatMap((value): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [value]))
    .filter((value): value is string => typeof value === 'string' && value.startsWith('file:'))
    .map((value) => value.slice('file:'.length).replace(/^\.\//, ''))
}

// Local checks `lps block push` and `lps validate` share. The site checks the same again,
// plus render.php's syntax.
export function blockProblems(slug: string, files: BlockFiles): string[] {
  if (!BLOCK_SLUG.test(slug)) return ['the folder name must be lowercase letters, digits and hyphens, starting with a letter']

  const problems: string[] = []
  for (const name of Object.keys(files)) {
    if (!(BLOCK_FILES as readonly string[]).includes(name)) problems.push(`${name} is not a block file, a block folder holds only ${BLOCK_FILES.join(', ')}`)
  }

  if (files['render.php'] === undefined) problems.push('render.php is missing')
  const raw = files['block.json']
  if (raw === undefined) return [...problems, 'block.json is missing']

  let metadata: unknown
  try {
    metadata = JSON.parse(raw)
  } catch {
    return [...problems, 'block.json is not valid JSON']
  }

  if (!isRecord(metadata) || Array.isArray(metadata)) return [...problems, 'block.json is not a JSON object']
  if (metadata.name !== `loopress/${slug}`) problems.push(`block.json "name" must be "loopress/${slug}"`)
  for (const file of referencedFiles(metadata)) {
    if (files[file] === undefined) problems.push(`block.json references file:./${file}, which is not in the folder`)
  }

  return problems
}

// Every blocks/<slug>/ folder with its files. Unknown files are read too, so blockProblems()
// reports them instead of push silently dropping them.
export async function readLocalBlocks(dir: string): Promise<{blocks: LocalBlock[]; problems: BlockProblem[]}> {
  let entries
  try {
    entries = withoutExcluded(dir, await readdir(dir, {withFileTypes: true}), (entry) => entry.name)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return {blocks: [], problems: []}
    throw error
  }

  const blocks: LocalBlock[] = []
  const problems: BlockProblem[] = []
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).toSorted((a, b) => a.name.localeCompare(b.name))) {
    const slug = entry.name
    const files: BlockFiles = {}
    for (const file of await readdir(join(dir, slug), {withFileTypes: true})) {
      if (file.isFile() && !file.name.startsWith('.')) files[file.name] = await readFile(join(dir, slug, file.name), 'utf8')
    }

    // Checked whole, then the environment's excluded files are dropped: a push keeps the site's
    // copy of those (see blockFilesToPush), a diff holds the block back.
    for (const message of blockProblems(slug, files)) problems.push({file: join(dir, slug), message})
    const kept = new Set(withoutExcluded(join(dir, slug), Object.keys(files), (name) => name))
    blocks.push({files: Object.fromEntries(Object.entries(files).filter(([name]) => kept.has(name))), slug})
  }

  return {blocks, problems}
}

// Block files the environment excludes: never sent, so the site's copy of each one goes back in
// the PUT (a block is replaced as a whole).
export function excludedBlockFiles(dir: string, slug: string): string[] {
  return BLOCK_FILES.filter((name) => isExcluded(join(dir, slug, name)))
}

// What a push sends for `block`: its local files plus the site's copy of its excluded ones.
export function blockFilesToPush(dir: string, block: LocalBlock, site: BlockFiles | undefined): BlockFiles {
  const excluded = new Set(excludedBlockFiles(dir, block.slug))
  const kept = Object.entries(block.files).filter(([name]) => !excluded.has(name))
  const fromSite = Object.entries(site ?? {}).filter(([name]) => excluded.has(name))
  return Object.fromEntries([...kept, ...fromSite])
}

export function formatBlockProblems(problems: BlockProblem[]): string {
  return problems.map((problem) => `${problem.file}: ${problem.message}`).join('\n')
}

// A block from the site or a snapshot names a folder and files on disk: anything but a valid
// slug and the known file names could write or delete outside blocks/.
export function assertSafeBlock(block: LocalBlock): void {
  const unsafe = !BLOCK_SLUG.test(block.slug) || Object.keys(block.files).some((name) => !(BLOCK_FILES as readonly string[]).includes(name))
  if (unsafe) throw new Error(`Refusing block "${block.slug}": invalid slug or file name (${Object.keys(block.files).join(', ')})`)
}

export async function writeBlock(dir: string, block: LocalBlock): Promise<void> {
  assertSafeBlock(block)
  await mkdir(join(dir, block.slug), {recursive: true})
  for (const [name, content] of Object.entries(block.files)) await writeFile(join(dir, block.slug, name), content)
}

export type RemoteBlock = LocalBlock & {error?: string; runtimeError?: {at: string; message: string}}

