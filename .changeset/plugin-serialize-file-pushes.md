---
"@loopress/wordpress-plugin": patch
---

Serializes every write to `wp-content/loopress/api/` and `hooks/` (batch pushes, single-file pushes, deletions) behind a per-directory lock. Two overlapping `lps api push`/`lps hook push` runs shared one staging directory: the second could end up committing a staging directory holding only its own files, deleting every other route or hook from the site. A second push now waits for the first and starts from its result.
