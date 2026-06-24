import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

export interface LoopressLocalConfig {
  plugins?: Record<string, string>
  rootDir?: string
  snippets?: string
  styles?: string
}

export async function readLocalConfig(): Promise<LoopressLocalConfig> {
  const configPath = join(process.cwd(), 'loopress.config.js')
  if (!existsSync(configPath)) return {}

  // Fast path: files written by writeLocalConfig are always `export default <JSON>`.
  // Parsing as text avoids the Node.js ESM module cache entirely.
  try {
    const content = await readFile(configPath, 'utf8')
    const match = /^export default\s+([\s\S]+)$/.exec(content.trim())
    if (match) return JSON.parse(match[1]) as LoopressLocalConfig
  } catch {
    // not our format — fall through to dynamic import
  }

  // Fallback: user-authored config with JS expressions (functions, env vars, etc.)
  try {
    const mod = await import(configPath)
    return mod.default ?? {}
  } catch {
    return {}
  }
}

export async function writeLocalConfig(config: LoopressLocalConfig): Promise<void> {
  const configPath = join(process.cwd(), 'loopress.config.js')
  const body = JSON.stringify(config, null, 2)
  await writeFile(configPath, `export default ${body}\n`, 'utf8')
}
