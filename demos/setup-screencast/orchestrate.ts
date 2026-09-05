// Screencast orchestrator for the Loopress setup flow.
//
// Records one asciinema cast of a shell where we `npm install -g @loopress/cli` and then run
// `lps project config`, answering every prompt. When the CLI prints the browser-authorization
// URL, we drive Chrome through the WordPress "Authorize application" screen (browser.ts) and
// record that to a webm. build.sh stitches the two into a side-by-side clip.
//
// Everything is isolated under <this dir>/state so it never touches a real npm prefix or a
// real ~/.config/loopress.
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {env, stderr, stdout} from 'node:process'
import {fileURLToPath} from 'node:url'

import nodePty from 'node-pty'
import type {IPty} from 'node-pty'

import {pluginPage, runAuthorize} from './browser.ts'

const {spawn} = nodePty

const BASE = dirname(fileURLToPath(import.meta.url))
const SITE = join(BASE, 'site') // cwd for `lps` (an empty project dir)
const STATE = join(BASE, 'state') // throwaway npm prefix + XDG dirs
const OUT = join(BASE, 'out')
const CAST = join(OUT, 'term.cast')
const VIDEO_DIR = join(OUT, 'video')

const WP_URL = env.WP_URL ?? 'http://localhost:8080'
const COLS = 100
const ROWS = 22

const NPM_PREFIX = join(STATE, 'npm-global')
// A download cache that survives resetState(): with HOME on the wiped state dir, npm's own
// ~/.npm is cold every run, so `npm install -g` becomes a ~20s silent fetch that the cast
// reshaper crushes to one capped gap. A persistent cache keeps the install as quick as it
// was before HOME was isolated, without npm touching anything of the user's.
const NPM_CACHE = join(BASE, '.npm-cache')
const REAL_PATH = env.PATH ?? '/usr/bin:/bin'

// A fresh, curated environment for the recorded shell: HOME is always the throwaway state
// dir (never the user's), `npm install -g` lands in NPM_PREFIX with no sudo, and the XDG
// dirs keep the CLI's config out of ~/.config.
const SHELL_ENV: Record<string, string> = {
  HOME: STATE,
  PATH: `${join(NPM_PREFIX, 'bin')}:${REAL_PATH}`,
  npm_config_prefix: NPM_PREFIX,
  npm_config_cache: NPM_CACHE,
  npm_config_fund: 'false',
  npm_config_audit: 'false',
  npm_config_progress: 'false',
  npm_config_prefer_offline: 'true',
  npm_config_update_notifier: 'false', // HOME is wiped each run, so npm's once-a-week throttle never kicks in
  XDG_CONFIG_HOME: join(STATE, '.config'),
  XDG_DATA_HOME: join(STATE, '.local', 'share'),
  XDG_CACHE_HOME: join(STATE, '.cache'),
  TERM: 'xterm-256color',
  LANG: 'C.UTF-8',
  PS1: 'demo@wp:~/site\\$ ',
  BROWSER: 'true', // so xdg-open from the CLI is a silent no-op
  NO_UPDATE_NOTIFIER: '1',
}

const sleep = (seconds: number): Promise<void> => new Promise((r) => setTimeout(r, seconds * 1000))

function resetState(): void {
  for (const dir of [SITE, STATE, VIDEO_DIR]) rmSync(dir, {recursive: true, force: true})
  rmSync(join(OUT, 'wp-state.json'), {force: true})
  mkdirSync(SITE, {recursive: true})
  mkdirSync(join(STATE, '.config', 'loopress'), {recursive: true})
  mkdirSync(join(NPM_PREFIX, 'bin'), {recursive: true})
  mkdirSync(VIDEO_DIR, {recursive: true})
  mkdirSync(OUT, {recursive: true})
  // Pre-seed only telemetry, so the CLI still sees zero projects but never prompts about it.
  writeFileSync(join(STATE, '.config', 'loopress', 'config.json'), '{"telemetry":{"disabled":true},"projects":{}}\n')
}

// A minimal pexpect: accumulate the pty output, and resolve when a pattern shows up.
class Term {
  private readonly pty: IPty
  private buffer = ''
  private exited = false

  constructor(command: string, args: string[]) {
    this.pty = spawn(command, args, {
      name: 'xterm-256color',
      cols: COLS,
      rows: ROWS,
      cwd: SITE,
      env: SHELL_ENV,
    })
    this.pty.onData((data) => {
      this.buffer += data
      stdout.write(data)
    })
    this.pty.onExit(() => {
      this.exited = true
    })
  }

  // Type keystrokes one at a time so the tty echo looks like real typing. ~16 cps reads as a
  // person at the keyboard (it also matches what the old pexpect version emitted in practice:
  // its nominal 55 was swamped by per-keystroke sleep + send overhead).
  async typeLine(text: string, cps = 16): Promise<void> {
    for (const ch of text) {
      this.pty.write(ch)
      await sleep(1 / cps)
    }
    this.pty.write('\r')
  }

  send(data: string): void {
    this.pty.write(data)
  }

  // Wait for the first match of `pattern`, then drop the buffer up to and including it (so
  // later waits only see fresh output). Returns the RegExp match.
  waitFor(pattern: RegExp | string, timeoutMs = 15_000): Promise<RegExpMatchArray> {
    const re =
      typeof pattern === 'string' ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : pattern
    return new Promise((resolve, reject) => {
      const tick = (): boolean => {
        const match = this.buffer.match(re)
        if (!match) return false
        this.buffer = this.buffer.slice((match.index ?? 0) + match[0].length)
        clearInterval(interval)
        clearTimeout(timer)
        resolve(match)
        return true
      }
      const interval = setInterval(tick, 30)
      const timer = setTimeout(() => {
        clearInterval(interval)
        reject(new Error(`timed out waiting for ${re}\n--- last output ---\n${this.buffer.slice(-600)}`))
      }, timeoutMs)
      tick()
    })
  }

  // Like waitFor, but for a set of alternatives: resolves with the index that matched first.
  async waitForAny(patterns: string[], timeoutMs: number): Promise<number> {
    const match = await this.waitFor(new RegExp(patterns.map((p) => `(${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('|')), timeoutMs)
    return match.slice(1).findIndex((group) => group !== undefined)
  }

  async waitForExit(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (!this.exited && Date.now() - start < timeoutMs) await sleep(0.05)
    if (!this.exited) {
      try {
        this.pty.kill()
      } catch {
        // already gone
      }
    }
  }
}

async function main(): Promise<void> {
  resetState()

  const term = new Term('asciinema', [
    'rec',
    '-q',
    '--overwrite',
    '--cols',
    String(COLS),
    '--rows',
    String(ROWS),
    '-c',
    '/bin/bash --norc -i',
    CAST,
  ])

  await term.waitFor('site$ ', 20_000)
  await sleep(0.5)

  // 1. Install the CLI from npm (into the isolated prefix set in SHELL_ENV).
  await term.typeLine('npm install -g @loopress/cli')
  await term.waitFor('site$ ', 240_000)
  await sleep(0.7)

  // 2. lps project config -- connect a WordPress environment.
  await term.typeLine('lps project config')

  await term.waitFor('Project name', 20_000)
  await sleep(0.4)
  await term.typeLine('Demo Site')

  await term.waitFor('Environment', 15_000)
  await sleep(0.4)
  term.send('\r') // select: local (default)

  await term.waitFor('WordPress URL', 15_000)
  await sleep(0.4)
  await term.typeLine(WP_URL)

  await term.waitFor('authenticate', 15_000)
  await sleep(0.4)
  term.send('\r') // Authorize in my browser (recommended)

  const visit = await term.waitFor(/visit:[\r\n]+(https?:\/\/\S+)/, 30_000)
  const authUrl = visit[1].trim()
  stderr.write(`\n[orchestrator] auth url: ${authUrl}\n\n`)

  // 3. Approve the Application Password in the browser (recorded to webm).
  const webm = await runAuthorize(authUrl, VIDEO_DIR)
  stderr.write(`[orchestrator] browser video: ${webm}\n`)

  // 4. Back in the terminal: auto-install Loopress Full.
  await term.waitFor('configured', 30_000)
  await term.waitFor('Loopress Full was not detected', 30_000)
  await term.waitFor(/\(Y\/n\)/, 8_000)
  await sleep(0.2)
  term.send('\r') // install it now? yes

  await term.waitFor('Downloading the latest Loopress Full release', 20_000)
  const outcome = await term.waitForAny(
    ['Loopress Full installed and activated', 'Could not install Loopress Full'],
    180_000,
  )
  if (outcome === 1) throw new Error('Loopress Full auto-install failed')
  await term.waitFor('Removing the temporary admin account', 30_000)
  await term.waitFor(/lps project switch/, 20_000) // closing hint -> command done

  await sleep(1.5) // let the closing hint be the last frame
  term.send('\x04') // EOF: bash exits (no typed "exit")
  await term.waitForExit(15_000)

  // 5. Now that Loopress Full is installed, show its admin page in the browser.
  stderr.write('[orchestrator] opening the Loopress plugin page...\n')
  const pluginWebm = await pluginPage(VIDEO_DIR)
  stderr.write(`[orchestrator] plugin-page video: ${pluginWebm}\n`)

  stderr.write('\n[orchestrator] done\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
