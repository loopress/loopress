import {readdir, readFile} from 'node:fs/promises'
import {basename, extname, join} from 'node:path'

import {type LoopressSnippetMetadata} from '../types/snippet.generated.js'
import {type Snippet} from '../types/snippet.js'
import {
  defaultLocationForType,
  parseInsertMethod,
  parseLocation,
  parseType,
  type SnippetInsertMethod,
  type SnippetLocation,
  type SnippetType,
} from '../utils/snippet-format.js'

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
    onSkip?.(`Skipping "${filePath}": ${(error as Error).message}`)
    return undefined
  }

  let id: number | undefined
  let name: string | undefined
  let type: SnippetType | undefined
  let isActive = false
  let tags: string[] = []
  let location: null | SnippetLocation = null
  let insertMethod: null | SnippetInsertMethod = null
  let priority = 10
  let shortcodeAttributes: string[] = []
  try {
    const metaContent = await readFile(metaPath, 'utf8')
    const meta = JSON.parse(metaContent) as LoopressSnippetMetadata
    id = meta.id
    // `||`, not `??`: an empty-string name in the sidecar JSON counts as absent too.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    name = meta.name || undefined
    type = parseType(meta.type) ?? undefined
    isActive = Boolean(meta.active)
    tags = Array.isArray(meta.tags) ? meta.tags.map(String) : []
    location = parseLocation(meta.location)
    insertMethod = parseInsertMethod(meta.insertMethod)
    priority = meta.priority ?? 10
    shortcodeAttributes = Array.isArray(meta.shortcodeAttributes) ? meta.shortcodeAttributes.map(String) : []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      onSkip?.(`Skipping "${metaPath}": ${(error as Error).message}`)
      return undefined
    }
  }

  const resolvedType = type ?? (Object.hasOwn(TYPE_BY_EXTENSION, ext) ? TYPE_BY_EXTENSION[ext] : 'php')

  return {
    active: isActive,
    code: content,
    id,
    insertMethod: insertMethod ?? 'auto',
    location: location ?? defaultLocationForType(resolvedType),
    name: name ?? basename(file, ext),
    path: filePath,
    priority,
    shortcodeAttributes,
    tags,
    type: resolvedType,
  }
}

// Shared by `snippet push` (pushes to the project's own WordPress site) and `snippet publish`
// (publishes to the Loopress api as a shared source) — both read the same local `snippets/`
// directory the same way. `onSkip` is optional so callers that don't care about per-file
// warnings (e.g. `snippet publish`) can ignore them; skipped files are simply left out either way.
export async function loadSnippets(path: string, onSkip?: (message: string) => void): Promise<Snippet[]> {
  let files: string[]
  try {
    files = await readdir(path)
  } catch (error) {
    throw new Error(`Error loading snippets: ${(error as Error).message}`, {cause: error})
  }

  const snippets: Snippet[] = []
  for (const file of files) {
    const snippet = await loadSnippet(path, file, onSkip)
    if (snippet) snippets.push(snippet)
  }

  return snippets
}
