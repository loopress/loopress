import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

export interface LoopressLocalConfig {
  plugins?: Record<string, string>
  projectId?: string
  rootDir?: string
  snippetPlugin?: 'code-snippets' | 'wpcode'
  snippetsDir?: string
}

// Only a missing file is treated as "no config" (returns {}). A file that exists but
// fails to read or parse throws, so callers don't silently fall back to the global
// current environment when loopress.json is actually broken.
export async function readLocalConfig(): Promise<LoopressLocalConfig> {
  const configPath = join(process.cwd(), 'loopress.json')
  if (!existsSync(configPath)) return {}

  const content = await readFile(configPath, 'utf8')

  try {
    return JSON.parse(content) as LoopressLocalConfig
  } catch {
    throw new Error('loopress.json is not valid JSON. Fix or delete it, then run `lps init` again.')
  }
}

export async function writeLocalConfig(config: LoopressLocalConfig): Promise<void> {
  const configPath = join(process.cwd(), 'loopress.json')
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
}
