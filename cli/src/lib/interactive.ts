// Whether prompts can be shown at all: a real terminal on both ends, and not a CI runner.
// CI=1 with a pseudo-TTY still counts as non-interactive, which is what CI users expect.
// Every command that prompts routes its decision through this so the CLI never hangs on a
// question nobody can answer.
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY) && !process.env.CI
}
