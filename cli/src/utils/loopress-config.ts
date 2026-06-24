import {existsSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
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
