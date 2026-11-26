---
"@loopress/cli": patch
---

A push now stops before writing anything when the site's current state cannot be read, instead of skipping the check for changes made on the site outside Loopress. `--overwrite` skips the check and pushes without a rollback snapshot.
