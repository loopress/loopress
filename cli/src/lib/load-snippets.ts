import {readdir, readFile} from 'node:fs/promises'
import {basename, extname, join} from 'node:path'

import {type Snippet} from '../types/snippet.js'
import {
  defaultLocationForType,
  parseInsertMethod,
  parseLocation,
  parseType,
  type SnippetType,
} from '../utils/snippet-format.js'
import {errorCode, errorMessage, isRecord} from './narrow.js'

const TYPE_BY_EXTENSION: Record<string, SnippetType> = {
  '.css': 'css',
  '.html': 'html',
  '.js': 'js',
  '.php': 'php',
  '.txt': 'text',
}

// One snippet's files are read in isolation: a corrupted or hand-broken sidecar (bad JSON,
// unreadable file, ...) must only skip that snippet, not abort loading every other one.
async function loadSnippet(path: string, file: string, onSkip?: (message: string) => void): Promise<Snippet | undefined> {
  const ext = extname(file)
  if (!Object.hasOwn(TYPE_BY_EXTENSION, ext)) return undefined

  const filePath = join(path, file)
  const metaPath = join(path, `${basename(file, ext)}.json`)

  let content: string
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    onSkip?.(`Skipping "${filePath}": ${errorMessage(error)}`)
    return undefined
  }

  let meta: Record<string, unknown>
  try {
    meta = await readSidecar(metaPath)
  } catch (error) {
    onSkip?.(`Skipping "${metaPath}": ${errorMessage(error)}`)
    return undefined
  }

  const type = parseType(meta.type) ?? TYPE_BY_EXTENSION[ext] ?? 'php'

  return {
    active: Boolean(meta.active),
    code: content,
    // Kept even when empty: a description cleared on purpose, not one to replace with "Imported from <path>".
    description: typeof meta.description === 'string' ? meta.description : undefined,
    id: typeof meta.id === 'number' ? meta.id : undefined,
    insertMethod: parseInsertMethod(meta.insertMethod) ?? 'auto',
    location: parseLocation(meta.location) ?? defaultLocationForType(type),
    // An empty-string name in the sidecar JSON counts as absent too.
    name: typeof meta.name === 'string' && meta.name !== '' ? meta.name : basename(file, ext),
    path: filePath,
    priority: typeof meta.priority === 'number' ? meta.priority : 10,
    shortcodeAttributes: Array.isArray(meta.shortcodeAttributes) ? meta.shortcodeAttributes.map(String) : [],
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    type,
  }
}

// The sidecar's JSON object, or no fields when the snippet has no sidecar (yet).
async function readSidecar(metaPath: string): Promise<Record<string, unknown>> {
  let raw: string
  try {
    raw = await readFile(metaPath, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return {}
    throw error
  }

  const meta: unknown = JSON.parse(raw)
  if (!isRecord(meta)) throw new Error('not a JSON object')
  return meta
}

// Shared by `snippet push` (pushes to the project's own WordPress site) and `snippet publish`
// (publishes to the Loopress api as a shared source): both read the same local `snippets/`
// directory the same way. `onSkip` is optional so callers that don't care about per-file
// warnings (e.g. `snippet publish`) can ignore them; skipped files are simply left out either way.
export async function loadSnippets(path: string, onSkip?: (message: string) => void): Promise<Snippet[]> {
  let files: string[]
  try {
    files = await readdir(path)
  } catch (error) {
    throw new Error(`Error loading snippets: ${errorMessage(error)}`, {cause: error})
  }

  const snippets: Snippet[] = []
  for (const file of files) {
    const snippet = await loadSnippet(path, file, onSkip)
    if (snippet) snippets.push(snippet)
  }

  return snippets
}
