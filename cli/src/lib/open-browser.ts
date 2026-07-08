import {execFile} from 'node:child_process'

/** Opens `url` in the user's default browser, best-effort (no-op on unknown platforms). */
export function openBrowser(url: string): void {
  const commands: Record<string, [file: string, args: string[]]> = {
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]],
    win32: ['cmd', ['/c', 'start', '', url]],
  }

  const command = commands[process.platform]
  if (command) execFile(...command)
}
