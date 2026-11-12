---
"@loopress/cli": minor
---

New `lps plugin rollback`, `lps theme version rollback` and `lps composer rollback`, with the MCP `plugin_rollback`, `theme_version_rollback` and `composer_rollback` tools. `lps plugin push`, `lps theme version push` and `lps composer push` (so `lps push`, `lps theme push` and `lps promote` too) now save a snapshot of the site's installed plugins, themes or `composer.json` and `composer.lock`, and the rollback syncs Composer back to it: a package the push installed is uninstalled, one it uninstalled is reinstalled, re-pinned versions go back, and each plugin gets its active state back. A rollback that downgrades a package warns, also with `--dry-run`, and needs `--force`, since a downgrade does not undo database migrations. Composer resolves the earlier `composer.json` again instead of replaying its lock, and lists any package that resolved to another version.
