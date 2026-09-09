import {confirm} from '@inquirer/prompts'

// Whether prompts can be shown at all: a real terminal on both ends, and not a CI runner.
// CI=1 with a pseudo-TTY still counts as non-interactive, which is what CI users expect.
// Every command that prompts routes its decision through this so the CLI never hangs on a
// question nobody can answer.
export function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY && !process.env.CI
}

// The "about to uninstall N plugins/themes from the site" gate shared by `plugin push` and
// `theme push`. Returns whether the caller may proceed: nothing to remove, --yes, or a
// non-interactive shell all pass straight through; otherwise the user is asked and a "no"
// returns false so the caller can abort.
export async function confirmUninstall(toRemove: string[], yes: boolean): Promise<boolean> {
  if (yes || toRemove.length === 0 || !isInteractive()) return true
  return confirm({default: false, message: `Uninstall ${toRemove.join(', ')} from the site?`})
}
