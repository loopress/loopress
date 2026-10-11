---
"@loopress/cli": minor
---

New `lps meta` commands for post meta keys declared as `meta/<post-type>.json` files: `push`, `pull`, `list` (every registered meta key per post type, and whether Loopress declares it), `rm`, `diff` and `rollback`. Values are never synced. `lps push`, `lps pull` and `lps validate` include them. Needs the matching plugin release.
