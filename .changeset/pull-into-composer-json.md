---
"@loopress/cli": minor
---

`lps plugin pull` and `lps theme pull` no longer stop when the project has a `composer.json`: they pin the live versions into its `require` as `wpackagist-plugin/<slug>` / `wpackagist-theme/<slug>` entries, leaving every other key untouched. A version constraint you wrote (`^9.4`) is kept, only exact pins move; packages in `require-dev`, provided by another package, or absent from WordPress.org (premium, custom) are skipped and listed in the output. `loopress.json` is not modified in that case. The file keeps its original indentation. If the WordPress.org check fails, the pull stops with the reason and leaves `composer.json` untouched.

`loopress.json` now records whether each plugin is active: `lps plugin pull` writes an inactive plugin as `{"version": "1.7.2", "active": false}`, `lps plugin push` keeps it inactive (and deactivates it if it was switched on), and `lps plugin status` reports it as drift when it is active. A plain version string still means active, so existing files keep working. Before, a pull followed by a push activated every plugin that was inactive on the site.

`lps plugin push` no longer stops on a project with a `composer.json`: it reads the `wpackagist-plugin/*` entries, pushes the whole file (themes and libraries included) and keeps its safety around the file swap, but activates nothing unless `--activate` is passed. `lps push` then skips `composer push` so Composer runs once. Composer constraints like `^9.4` are no longer reported as version drift.
