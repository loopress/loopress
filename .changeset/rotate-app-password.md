---
"@loopress/cli": minor
---

Add `lps project rotate` to replace the WordPress application password for the current (or `--env`) environment: it creates a new one, verifies it authenticates on its own, then revokes the old one, never the other way around, so a bad new credential can't lock you out. Every other command now also does this silently in the background once the stored credential is older than 90 days: best-effort, skipped during `--dry-run`, and a failed attempt (site unreachable) just retries on the next run instead of blocking the current command.
