import {createHash} from 'node:crypto'
import {type Dirent} from 'node:fs'
import {readdir, readFile} from 'node:fs/promises'
import {extname, join, relative} from 'node:path'

// Shared contract between `lps app push`/`pull` and the WordPress plugin's AppsController.
// A "manifest" is the whole description of one committed build; the plugin stores it verbatim
// in the `loopress_apps` option and the shortcode renders from it.

export type AppFile = {
  path: string
  sha256: string
  size: number
}

export type AppEntry = {
  scripts: string[]
  styles: string[]
}

// loopress.app.json, one per app directory. Everything is optional: sensible defaults are
// derived from the directory name and dist/index.html.
export type AppConfigFile = {
  assetsDir?: string
  entry?: AppEntry
  mountSelector?: string
  name?: string
  // Only "hash" is supported today; a stored file could still carry something else, so it is
  // typed loosely here and validated in parseAppConfig.
  routing?: string
}

export type AppManifest = {
  buildId: string
  entry: AppEntry
  files: AppFile[]
  mountSelector: string
  name: string
  routing: 'hash'
}

export const APP_CONFIG_FILENAME = 'loopress.app.json'
const DEFAULT_ASSETS_DIR = 'dist'

// Static assets a bundler emits, mirrors the server's AppsDirectory::ALLOWED_EXTENSIONS.
// `.php` and friends are absent on purpose: these files are served straight off wp-content/.
const ALLOWED_EXTENSIONS = new Set([
  '.avif', '.bmp', '.cjs', '.css', '.csv', '.eot', '.gif', '.htm', '.html', '.ico', '.jpeg',
  '.jpg', '.js', '.json', '.map', '.mjs', '.mp3', '.mp4', '.ogg', '.otf',
  '.pdf', '.png', '.svg', '.ttf', '.txt',
  '.wasm', '.webm', '.webmanifest', '.webp', '.woff', '.woff2', '.xml',
])

export function isAllowedAsset(relPath: string): boolean {
  return ALLOWED_EXTENSIONS.has(extname(relPath).toLowerCase())
}

async function walk(dir: string, root: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, {withFileTypes: true})
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const out: string[] = []
  for (const entry of entries) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, root)))
    } else if (entry.isFile()) {
      // Identity is always '/'-joined, never the OS separator: it travels over HTTP and is
      // matched against the server's own '/'-joined paths.
      out.push(relative(root, abs).replaceAll(/[\\/]/g, '/'))
    }
  }

  return out
}

// Builds the sorted file list of a dist directory. Throws on a file whose extension the
// server would reject, so the push fails locally with a clear message instead of a 400
// halfway through the upload.
export async function buildFileList(distDir: string): Promise<AppFile[]> {
  const relPaths = (await walk(distDir, distDir)).sort((a, b) => a.localeCompare(b))

  const files: AppFile[] = []
  for (const path of relPaths) {
    if (!isAllowedAsset(path)) {
      throw new Error(
        `${path}: extension ${extname(path) || '(none)'} is not an allowed static asset. Remove it from the build output or the bundle.`,
      )
    }

    const buf = await readFile(join(distDir, path))
    files.push({path, sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length})
  }

  return files
}

// A stable content hash of the whole build: changes if and only if some file's bytes change.
// Used as the enqueue `?ver` (cache busting) and as the build identity in `app list`.
export function computeBuildId(files: AppFile[]): string {
  const digest = createHash('sha256')
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    digest.update(`${file.path}:${file.sha256}\n`)
  }

  return digest.digest('hex').slice(0, 12)
}

function normalizeAssetUrl(url: string): string {
  let path = url.trim()
  const schemeMatch = /^(?:[a-z]+:)?\/\/[^/]+(\/.*)$/i.exec(path)
  if (schemeMatch) path = schemeMatch[1]
  path = path.replace(/^\.?\//, '')

  return path
}

// Reads the <script type="module"> and <link rel="stylesheet"> the build's own index.html
// declares. This is what a bundler already writes; Loopress does not guess or reorder.
export function deriveEntry(indexHtml: string): AppEntry {
  const scripts: string[] = []
  for (const tag of indexHtml.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype=["']module["']/i.test(tag)) continue
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)
    if (src) scripts.push(normalizeAssetUrl(src[1]))
  }

  const styles: string[] = []
  for (const tag of indexHtml.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)
    if (href) styles.push(normalizeAssetUrl(href[1]))
  }

  return {scripts, styles}
}

// Files new on this build or whose hash moved. Deletions are handled server-side on commit
// (with a one-generation grace for in-flight sessions), never by this diff.
export function diffFiles(local: AppFile[], remote: AppFile[]): AppFile[] {
  const remoteByPath = new Map(remote.map((file) => [file.path, file.sha256]))

  return local.filter((file) => remoteByPath.get(file.path) !== file.sha256)
}

export function parseAppConfig(raw: string, appDir: string): AppConfigFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${join(appDir, APP_CONFIG_FILENAME)} is not valid JSON`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${join(appDir, APP_CONFIG_FILENAME)} must be a JSON object`)
  }

  const config = parsed as AppConfigFile
  if (config.routing !== undefined && config.routing !== 'hash') {
    throw new Error(
      `${join(appDir, APP_CONFIG_FILENAME)}: routing "${config.routing}" is not supported, only "hash" works without a server rewrite`,
    )
  }

  return config
}

// Assembles the full manifest for one app directory: reads loopress.app.json, hashes the
// dist directory, derives the entry from index.html (or takes it from the config), computes
// the build id.
export async function loadAppManifest(
  appDir: string,
  dirName: string,
): Promise<{configPath: string; distDir: string; manifest: AppManifest}> {
  const configPath = join(appDir, APP_CONFIG_FILENAME)
  const config = parseAppConfig(await readFile(configPath, 'utf8'), appDir)

  const name = config.name ?? dirName
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name)) {
    throw new Error(`Invalid app name "${name}": lowercase letters, digits and hyphens only, no leading or trailing hyphen`)
  }

  const distDir = join(appDir, config.assetsDir ?? DEFAULT_ASSETS_DIR)
  const files = await buildFileList(distDir)
  if (files.length === 0) {
    throw new Error(`No files in ${distDir}. Build the app first, then run \`lps app push\`.`)
  }

  const filePaths = new Set(files.map((file) => file.path))

  let entry: AppEntry
  if (config.entry) {
    entry = config.entry
  } else if (filePaths.has('index.html')) {
    entry = deriveEntry(await readFile(join(distDir, 'index.html'), 'utf8'))
  } else {
    throw new Error(
      `${distDir} has no index.html to read the entry from. Add an "entry" object to ${APP_CONFIG_FILENAME}.`,
    )
  }

  const missing = [...entry.scripts, ...entry.styles].filter((ref) => !filePaths.has(ref))
  if (missing.length > 0) {
    throw new Error(`Entry references files not in the build output: ${missing.join(', ')}`)
  }

  if (entry.scripts.length === 0) {
    throw new Error(`No <script type="module"> entry found for app "${name}".`)
  }

  return {
    configPath,
    distDir,
    manifest: {
      buildId: computeBuildId(files),
      entry,
      files,
      mountSelector: config.mountSelector ?? `#loopress-app-${name}`,
      name,
      routing: 'hash',
    },
  }
}
