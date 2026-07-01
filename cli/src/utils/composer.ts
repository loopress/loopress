import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

export interface ComposerJson {
  'require-dev'?: Record<string, string>
  require?: Record<string, string>
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

export async function readComposerLock(): Promise<string | null> {
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
  const packages = {...(composerJson.require ?? {}), ...(composerJson['require-dev'] ?? {})}
  return Object.keys(packages)
    .filter((pkg) => pkg.startsWith('wpackagist-plugin/'))
    .map((pkg) => pkg.slice('wpackagist-plugin/'.length))
}
