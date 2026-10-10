---
"@loopress/cli": minor
---

New `lps cpt` commands for custom post types declared as `cpt/<slug>.json` files: `push`, `pull`, `list` (every post type on the site and its source), `rm`, `diff` and `rollback`. `lps push` and `lps pull` include them, `lps validate` checks the file names and refuses arguments that would run code. Needs the matching plugin release.
