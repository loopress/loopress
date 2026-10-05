import {readdirSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const COMMANDS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/commands')

// The MCP server runs every command with `--json` and parses stdout, so a command without
// `enableJsonFlag` fails there with "Nonexistent flag: --json". Only commands the MCP server
// never wraps (interactive setup, account and telemetry commands) may opt out.
const NOT_WRAPPED_BY_MCP = new Set([
  'api/publish',
  'composer/init',
  'dev',
  'init',
  'login',
  'logout',
  'project/config',
  'project/pull',
  'project/push',
  'project/remove',
  'project/rotate',
  'project/switch',
  'sentry-test',
  'snippet/publish',
  'telemetry/disable',
  'telemetry/enable',
])

function commandIds(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return commandIds(path)
    return entry.name.endsWith('.ts') ? [relative(COMMANDS_DIR, path).replace(/\.ts$/, '')] : []
  })
}

describe('--json support', () => {
  const ids = commandIds(COMMANDS_DIR).filter((id) => !NOT_WRAPPED_BY_MCP.has(id))

  it.each(ids)('%s enables the --json flag', async (id) => {
    const {default: command} = (await import(join(COMMANDS_DIR, `${id}.ts`))) as {default: {enableJsonFlag?: boolean}}
    expect(command.enableJsonFlag).toBe(true)
  })
})
