import {existsSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {type LoopressProjectConfiguration} from '../types/project-config.generated.js'

export type LoopressLocalConfig = LoopressProjectConfiguration

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

// Git for Windows checks text files out as CRLF by default (core.autocrlf=true), so the same
// snippet would differ byte for byte between a Windows checkout and what `pull` writes (LF).
// Pinning LF in the repo keeps synced files identical on every OS. Returns false when the rule
// is already there, so re-running `lps init` never duplicates it. The rule goes first: in
// .gitattributes a later line wins, so existing exceptions (`*.bat text eol=crlf`) keep theirs.
const LF_RULE = '* text=auto eol=lf'

export async function ensureLfGitattributes(): Promise<boolean> {
  const path = join(process.cwd(), '.gitattributes')
  const current = existsSync(path) ? await readFile(path, 'utf8') : ''
  if (current.split(/\r?\n/).some((line) => line.trim() === LF_RULE)) return false

  await writeFile(path, `${LF_RULE}\n${current}`, 'utf8')
  return true
}
