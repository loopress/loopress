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
  const configPath = join(process.cwd(), 'loopress.json')
  if (!existsSync(configPath)) return {}
  try {
    const content = await readFile(configPath, 'utf8')
    return JSON.parse(content) as LoopressLocalConfig
  } catch {
    return {}
  }
}

export async function writeLocalConfig(config: LoopressLocalConfig): Promise<void> {
  const configPath = join(process.cwd(), 'loopress.json')
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
}
