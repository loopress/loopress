---
'@loopress/cli': minor
---

Explicit environment targeting and safer destructive operations (CLI backlog lot 3)

- New `--env <name>` flag on every project-aware command: targets an environment by name for a single run, taking priority over `lps project switch`, with an error listing the available environments when the name does not exist. `lps status --env <name>` previews what would be targeted.
- New `--yes` (`-y`) flag on commands that ask for confirmation.
- Production guard: push commands targeting an environment named `production` now ask for confirmation in a terminal, and require `--yes` in non-interactive runs.
- Pull commands now list local files that would be deleted (because they no longer exist on WordPress) and ask before removing them. `--yes` skips the question; without a TTY the previous behavior (remove and warn) is kept so existing scripts do not break.
- The CLI never hangs on a prompt in CI: confirmations take their default answer and log it, and commands that require interactive input (`lps init`, `lps project config`) fail immediately with instructions.
