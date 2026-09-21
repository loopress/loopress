---
"@loopress/cli": patch
---

Fixes the non-interactive drift error from `lps <resource> rollback` mentioning "without --dry-run/--yes to leave it as is", advice that can never apply in that branch since it is only reached once `--dry-run` is already known to be false. The message now only mentions the `--yes` option that actually resolves it.
