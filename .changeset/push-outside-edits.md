---
"@loopress/cli": minor
---

A push no longer silently overwrites changes made on the site outside Loopress (wp-admin, another tool). Before writing, it compares the site with the state your last push from this machine left it in, using the existing rollback snapshots: an object changed there since, that the push would write a different version over, stops the push and is named (a terminal asks instead, a `--dry-run` only warns). Pass `--overwrite` to push anyway, `--yes` doesn't imply it. Pages now keep snapshots too, for this check.

`lps push` stops at the first resource that fails and lists the ones it didn't attempt, instead of pushing the rest on top of a failed dependency (hooks without the Composer packages they use). Plugins and Composer are skipped when the project doesn't manage them.

A site that can't be reached now says why (connection refused, host not found, timeout) with a hint to run `lps doctor`, instead of an empty reason, and `lps diff` prints an error shared by every resource once. Its header reads "local files" instead of "local → local".
