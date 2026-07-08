import {exec} from 'node:child_process'

/** Opens `url` in the user's default browser, best-effort (no-op on unknown platforms). */
export function openBrowser(url: string): void {
  const cmds: Record<string, string> = {
    darwin: `open "${url}"`,
    linux: `xdg-open "${url}"`,
    win32: `start "" "${url}"`,
  }

  const cmd = cmds[process.platform]
  if (cmd) exec(cmd)
}
