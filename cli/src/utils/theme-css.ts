import {build, type BuildFailure} from 'esbuild'
import {Buffer} from 'node:buffer'
import {existsSync} from 'node:fs'
import {readdir} from 'node:fs/promises'
import {extname, join, relative, resolve, sep} from 'node:path'

import {type PageProblem} from './page-format.js'

// theme/blocks/<namespace>/<block>.css, enqueued by the plugin with wp_enqueue_block_style(), so
// only on pages that render that block. Bundled to the same path in the child theme.
export type BlockStyle = {css: string; name: string}

// A font or image a url() points at, copied next to the CSS. Base64, it may be binary.
export type ThemeAsset = {content: string; path: string}

export type ThemeCss = {assets: ThemeAsset[]; blocks: BlockStyle[]; style: string}

// The global stylesheet's entry: it @imports the rest of theme/css/ in cascade order.
export const STYLE_ENTRY = 'style.css'

// WordPress's own block name rule (register_block_type): lowercase letters, digits and dashes,
// starting with a letter, on both sides of the slash.
const BLOCK_SEGMENT = /^[a-z][a-z0-9-]*$/

const ASSET_EXTENSIONS = ['.avif', '.eot', '.gif', '.jpeg', '.jpg', '.otf', '.png', '.svg', '.ttf', '.webp', '.woff', '.woff2']

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, {recursive: true, withFileTypes: true})
    return entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map((entry) => join(entry.parentPath, entry.name))
      .toSorted((a, b) => a.localeCompare(b))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function readBlockEntries(blocksDir: string, problems: PageProblem[]): Promise<Array<{file: string; name: string}>> {
  const entries: Array<{file: string; name: string}> = []
  for (const file of await listFiles(blocksDir)) {
    const segments = relative(blocksDir, file).split(sep)
    const [namespace, block] = [segments[0], segments[1]?.replace(/\.css$/, '')]
    if (segments.length !== 2 || extname(file) !== '.css' || !BLOCK_SEGMENT.test(namespace) || !BLOCK_SEGMENT.test(block)) {
      problems.push({file, message: `must be <namespace>/<block>.css, named after a block (e.g. ${join(blocksDir, 'core', 'button.css')})`})
      continue
    }

    entries.push({file, name: `${namespace}/${block}`})
  }

  return entries
}

function buildProblems(error: unknown): PageProblem[] {
  const {errors} = error as BuildFailure
  if (!Array.isArray(errors)) throw error
  return errors.map((message) => ({
    file: message.location ? `${message.location.file}:${message.location.line}` : 'esbuild',
    message: message.text,
  }))
}

// Bundles theme/css/style.css and every theme/blocks/<namespace>/<block>.css with esbuild:
// @import resolved, relative url() copied to assets/ and rewritten, minified. Paths in the result
// are the child theme's: style.css, blocks/core/button.css, assets/inter-HASH.woff2.
export async function bundleThemeCss(cssDir: string, blocksDir: string): Promise<{css: ThemeCss; problems: PageProblem[]}> {
  const problems: PageProblem[] = []
  const empty: ThemeCss = {assets: [], blocks: [], style: ''}

  const styleEntry = join(cssDir, STYLE_ENTRY)
  const hasStyle = existsSync(styleEntry)
  if (!hasStyle && (await listFiles(cssDir)).some((file) => extname(file) === '.css')) {
    problems.push({file: cssDir, message: `has CSS files but no ${STYLE_ENTRY}, the entry that @imports them: nothing in it would be loaded`})
  }

  const blocks = await readBlockEntries(blocksDir, problems)
  if (problems.length > 0) return {css: empty, problems}

  const entryPoints = [
    ...(hasStyle ? [{in: resolve(styleEntry), out: 'style'}] : []),
    ...blocks.map((block) => ({in: resolve(block.file), out: `blocks/${block.name}`})),
  ]
  if (entryPoints.length === 0) return {css: empty, problems}

  // Never written: outdir only anchors the output paths and the relative url() rewrites.
  const outdir = resolve('/loopress-child')
  let outputFiles
  try {
    ;({outputFiles} = await build({
      assetNames: 'assets/[name]-[hash]',
      bundle: true,
      charset: 'utf8',
      entryPoints,
      loader: Object.fromEntries(ASSET_EXTENSIONS.map((extension) => [extension, 'file'])),
      logLevel: 'silent',
      minify: true,
      outdir,
      write: false,
    }))
  } catch (error) {
    return {css: empty, problems: buildProblems(error)}
  }

  const css: ThemeCss = {assets: [], blocks: [], style: ''}
  for (const output of outputFiles) {
    const path = relative(outdir, output.path).split(sep).join('/')
    if (path === STYLE_ENTRY) css.style = output.text
    else if (path.startsWith('blocks/') && path.endsWith('.css')) css.blocks.push({css: output.text, name: path.slice('blocks/'.length, -'.css'.length)})
    else css.assets.push({content: Buffer.from(output.contents).toString('base64'), path})
  }

  css.blocks.sort((a, b) => a.name.localeCompare(b.name))
  return {css, problems}
}
