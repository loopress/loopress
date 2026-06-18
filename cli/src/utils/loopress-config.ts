import {existsSync} from 'node:fs'
import {join} from 'node:path'

export interface LoopressLocalConfig {
  rootDir?: string
  snippets?: string
  styles?: string
}

export async function readLocalConfig(): Promise<LoopressLocalConfig> {
  const configPath = join(process.cwd(), 'loopress.config.js')
  if (!existsSync(configPath)) return {}
  try {
    const mod = await import(configPath)
    return mod.default ?? {}
  } catch {
    return {}
  }
}
