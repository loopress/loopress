import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {parseType} from '../utils/snippet-format.js'
import {loadSnippets} from './load-snippets.js'
import {readdirTolerant} from './readdir-tolerant.js'

export type Problem = {file: string; message: string}

export type ValidateResult = {
  checked: number
  problems: Problem[]
  valid: boolean
}

// Directories holding one JSON document per resource. Snippets (code file plus JSON sidecar)
// and api routes (`.php`, not JSON) are checked separately.
const JSON_RESOURCE_DIRS = ['acfDir', 'formDir', 'pageDir', 'seoDir'] as const

const DEFAULT_DIR: Record<string, string> = {
  acfDir: 'acf',
  apiDir: 'api',
  formDir: 'forms',
  pageDir: 'pages',
  seoDir: 'seo',
  snippetsDir: 'snippets',
}

// Inspects the local tracked files under `cwd` without contacting WordPress: JSON files parse
// and have the right shape, snippet sidecars use a known type, `loopress.json` points at a
// real project, `composer.json` is well formed. Never throws for a bad file, it collects the
// problem and moves on.
export async function validateLocal(cwd: string): Promise<ValidateResult> {
  const problems: Problem[] = []
  let checked = 0

  const localConfig = await readConfig(cwd, problems)
  const rootDir = typeof localConfig.rootDir === 'string' ? localConfig.rootDir : '.'
  const resolve = (key: string): string => {
    const override = localConfig[key]
    return join(cwd, rootDir, typeof override === 'string' ? override : DEFAULT_DIR[key])
  }

  checkLoopressJson(localConfig, problems)
  checked += 1

  checked += await checkComposerJson(cwd, problems)

  for (const key of JSON_RESOURCE_DIRS) {
    checked += await checkJsonDir(resolve(key), problems)
  }

  checked += await checkSnippets(resolve('snippetsDir'), problems)
  checked += await checkApiDir(resolve('apiDir'), problems)

  return {checked, problems, valid: problems.length === 0}
}

async function checkApiDir(dir: string, problems: Problem[]): Promise<number> {
  const entries = await readdirTolerant(dir, {withFileTypes: true})
  let checked = 0

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.php')) continue
    checked += 1
    const filePath = join(dir, entry.name)
    const content = await readFile(filePath, 'utf8')
    if (content.trim() === '') problems.push({file: filePath, message: 'API route file is empty'})
  }

  return checked
}

async function checkComposerJson(cwd: string, problems: Problem[]): Promise<number> {
  let raw: string
  try {
    raw = await readFile(join(cwd, 'composer.json'), 'utf8')
  } catch {
    // No composer.json is fine, Composer sync is optional.
    return 0
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    problems.push({file: 'composer.json', message: `not valid JSON: ${(error as Error).message}`})
    return 1
  }

  for (const key of ['require', 'require-dev']) {
    const section = (parsed as Record<string, unknown>)[key]
    if (section !== undefined && (typeof section !== 'object' || section === null || Array.isArray(section))) {
      problems.push({file: 'composer.json', message: `"${key}" must be an object`})
    }
  }

  return 1
}

async function checkJsonDir(dir: string, problems: Problem[]): Promise<number> {
  const files = (await readdirTolerant(dir)).filter((file) => file.endsWith('.json'))
  let checked = 0

  for (const file of files) {
    checked += 1
    const filePath = join(dir, file)
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8'))
    } catch (error) {
      problems.push({file: filePath, message: `not valid JSON: ${(error as Error).message}`})
      continue
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      problems.push({file: filePath, message: 'expected a JSON object'})
    }
  }

  return checked
}

function checkLoopressJson(localConfig: Record<string, unknown>, problems: Problem[]): void {
  const {projectId} = localConfig
  if (typeof projectId === 'string') {
    const project = configManager.getProject(projectId)
    if (!project) {
      problems.push({
        file: 'loopress.json',
        message: `projectId "${projectId}" is not a configured project (run \`lps project config\`)`,
      })
    } else if (Object.keys(project.environments).length === 0) {
      problems.push({file: 'loopress.json', message: `project "${project.name}" has no environments configured`})
    }
  }

  const {plugins} = localConfig as {plugins?: unknown}
  if (plugins === undefined) return

  if (typeof plugins !== 'object' || plugins === null || Array.isArray(plugins)) {
    problems.push({file: 'loopress.json', message: '"plugins" must be an object of slug -> version string'})
    return
  }

  for (const [slug, version] of Object.entries(plugins)) {
    if (typeof version !== 'string') problems.push({file: 'loopress.json', message: `plugin "${slug}" must map to a string`})
  }
}

async function checkSnippets(dir: string, problems: Problem[]): Promise<number> {
  const listing = await readdirTolerant(dir)
  if (listing.length === 0) return 0

  // loadSnippets reports unreadable files and unparseable sidecars through onSkip.
  let snippets
  try {
    snippets = await loadSnippets(dir, (message) => {
      problems.push({file: dir, message})
    })
  } catch (error) {
    problems.push({file: dir, message: (error as Error).message})
    return 0
  }

  // loadSnippets coerces an invalid `type` to the extension default rather than failing, so
  // check the raw sidecars for a bogus enum value the schema would reject.
  const sidecars = listing.filter((file) => file.endsWith('.json'))
  for (const file of sidecars) {
    const filePath = join(dir, file)
    let meta: Record<string, unknown>
    try {
      meta = JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      problems.push({file: filePath, message: 'not valid JSON'})
      continue
    }

    if (meta.type !== undefined && parseType(meta.type) === null) {
      problems.push({file: filePath, message: `"type": ${JSON.stringify(meta.type)} is not one of css, html, js, php, text`})
    }

    if (meta.id !== undefined && !Number.isSafeInteger(meta.id)) {
      problems.push({file: filePath, message: '"id" must be an integer'})
    }
  }

  return snippets.length + sidecars.length
}

// Mirrors utils/loopress-config.ts:readLocalConfig, but rooted at an explicit directory rather
// than process.cwd() so the whole check is driveable from a test without process.chdir(), which
// vitest's worker threads forbid. A missing file just means "no config".
async function readConfig(cwd: string, problems: Problem[]): Promise<Record<string, unknown>> {
  let raw: string
  try {
    raw = await readFile(join(cwd, 'loopress.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    problems.push({file: 'loopress.json', message: 'loopress.json is not valid JSON. Fix or delete it, then run `lps init` again.'})
    return {}
  }
}
