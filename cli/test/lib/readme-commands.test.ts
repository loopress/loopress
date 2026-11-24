import {readdirSync, readFileSync} from 'node:fs'
import {dirname, join, relative, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const commandsDir = join(here, '../../src/commands')
const readme = readFileSync(join(here, '../../README.md'), 'utf8')

function commandIds(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return commandIds(path)
    if (!entry.name.endsWith('.ts')) return []
    return [relative(commandsDir, path).replace(/\.ts$/u, '').split(sep).join(' ')]
  })
}

describe('cli/README.md', () => {
  // The README is generated: `pnpm exec oclif manifest && pnpm exec oclif readme` (the `version` script).
  it('documents every command, so the npm page cannot go stale', () => {
    const missing = commandIds(commandsDir)
      .filter((id) => !id.startsWith('sentry-test') && id !== 'dev')
      .filter((id) => !readme.includes(`## \`lps ${id}`))
    expect(missing).toEqual([])
  })

  it('documents no removed command', () => {
    expect(readme).not.toContain('## `lps seo')
    expect(readme).not.toContain('## `lps theme-styles')
  })
})
